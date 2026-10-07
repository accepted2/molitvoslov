import os

from django.core.management.base import BaseCommand, CommandError
from django.db import connections, transaction

from api.models import PrayerRule, PrayerRuleItem, Text


REMOTE_ALIAS = "supabase_sync"

RULE_SLUGS = {
    "morning": "molitvy-utrennie",
    "evening": "molitvy-na-son-griadushchim",
}

TEXT_FIELDS = [
    "traditional_content",
    "traditional_title",
]


class Command(BaseCommand):
    help = (
        "Синхронизировать традиционный церковнославянский текст "
        "утреннего/вечернего молитвенного правила из локальной SQLite "
        "в Supabase. Меняются только PrayerRule.traditional_name и "
        "Text.traditional_content/Text.traditional_title. "
        "Обычный ЦС, русский и украинский текст не изменяются."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--rule",
            choices=["morning", "evening", "both"],
            default="both",
        )

        mode = parser.add_mutually_exclusive_group(required=True)
        mode.add_argument("--dry-run", action="store_true")
        mode.add_argument("--apply", action="store_true")

    def handle(self, *args, **options):
        self._assert_local_source()
        self._configure_supabase_connection()
        self._check_remote()

        selected = ["morning", "evening"] if options["rule"] == "both" else [options["rule"]]

        plans = [self._build_rule_plan(key) for key in selected]
        self._validate_shared_texts(plans)

        self.stdout.write("")
        self.stdout.write(
            self.style.MIGRATE_HEADING("PrayerRule traditional CS: local SQLite -> Supabase")
        )

        for plan in plans:
            self._print_plan(plan)

        if options["dry_run"]:
            self.stdout.write("")
            self.stdout.write(self.style.WARNING("DRY-RUN: Supabase не изменён."))
            return

        with transaction.atomic(using=REMOTE_ALIAS):
            self._apply(plans)

        verify = [self._build_rule_plan(key) for key in selected]
        self._validate_shared_texts(verify)

        if any(self._has_changes(plan) for plan in verify):
            for plan in verify:
                self._print_plan(
                    plan,
                    prefix="Остались расхождения после записи:",
                )
            raise CommandError("Проверка после APPLY не прошла.")

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                "APPLY завершён. Supabase синхронизирован и проверен. "
                "Поля content/translation/translation_uk не изменялись."
            )
        )

    def _assert_local_source(self):
        engine = connections["default"].settings_dict.get("ENGINE", "")
        if engine != "django.db.backends.sqlite3":
            raise CommandError(
                "Источник должен быть локальной SQLite. " "Не задавайте Supabase как default."
            )

    def _configure_supabase_connection(self):
        password = os.environ.get("SUPABASE_SYNC_DB_PASSWORD", "").strip()
        if not password:
            raise CommandError("Не задан SUPABASE_SYNC_DB_PASSWORD.")

        connections.databases[REMOTE_ALIAS] = {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.environ.get(
                "SUPABASE_SYNC_DB_NAME",
                os.environ.get("SUPABASE_DB_NAME", "postgres"),
            ),
            "USER": os.environ.get(
                "SUPABASE_SYNC_DB_USER",
                os.environ.get(
                    "SUPABASE_DB_USER",
                    "postgres.gguwppijpnpjpmpkiumd",
                ),
            ),
            "PASSWORD": password,
            "HOST": os.environ.get(
                "SUPABASE_SYNC_DB_HOST",
                os.environ.get(
                    "SUPABASE_DB_HOST",
                    "aws-1-eu-central-1.pooler.supabase.com",
                ),
            ),
            "PORT": os.environ.get(
                "SUPABASE_SYNC_DB_PORT",
                os.environ.get("SUPABASE_DB_PORT", "5432"),
            ),
            "CONN_MAX_AGE": 0,
            "CONN_HEALTH_CHECKS": True,
            "OPTIONS": {"sslmode": "require"},
            "TIME_ZONE": None,
            "AUTOCOMMIT": True,
            "ATOMIC_REQUESTS": False,
            "TEST": {
                "CHARSET": None,
                "COLLATION": None,
                "MIGRATE": True,
                "MIRROR": None,
                "NAME": None,
            },
        }

    def _check_remote(self):
        try:
            connections[REMOTE_ALIAS].ensure_connection()
            PrayerRule.objects.using(REMOTE_ALIAS).count()
            Text.objects.using(REMOTE_ALIAS).count()
        except Exception as error:
            raise CommandError(f"Не удалось подключиться к Supabase: {error}") from error

    def _get_rule(self, alias, slug):
        return (
            PrayerRule.objects.using(alias)
            .prefetch_related("items__text")
            .filter(slug=slug)
            .first()
        )

    def _text_items_by_order(self, rule):
        return {
            item.order: item
            for item in rule.items.all()
            if (item.item_type == PrayerRuleItem.TYPE_TEXT and item.text_id is not None)
        }

    def _build_rule_plan(self, key):
        slug = RULE_SLUGS[key]
        local = self._get_rule("default", slug)
        remote = self._get_rule(REMOTE_ALIAS, slug)

        if local is None:
            raise CommandError(f"Локально отсутствует PrayerRule slug={slug!r}.")

        if remote is None:
            raise CommandError(f"В Supabase отсутствует PrayerRule slug={slug!r}.")

        local_items = self._text_items_by_order(local)
        remote_items = self._text_items_by_order(remote)

        if set(local_items) != set(remote_items):
            local_only = sorted(set(local_items) - set(remote_items))
            remote_only = sorted(set(remote_items) - set(local_items))
            raise CommandError(
                f"{slug}: структура PrayerRuleItem отличается. "
                f"Только локально orders={local_only}; "
                f"только в Supabase orders={remote_only}."
            )

        text_changes = {}

        for order in sorted(local_items):
            local_item = local_items[order]
            remote_item = remote_items[order]

            if local_item.text.slug != remote_item.text.slug:
                raise CommandError(
                    f"{slug}: order={order} связан с разными Text: "
                    f"local={local_item.text.slug!r}, "
                    f"Supabase={remote_item.text.slug!r}."
                )

            changed = [
                field
                for field in TEXT_FIELDS
                if getattr(local_item.text, field) != getattr(remote_item.text, field)
            ]

            if changed:
                text_changes[local_item.text.slug] = {
                    "order": order,
                    "fields": changed,
                    "local": local_item.text,
                    "remote": remote_item.text,
                }

        return {
            "key": key,
            "slug": slug,
            "local": local,
            "remote": remote,
            "local_items": local_items,
            "remote_items": remote_items,
            "rule_name_changed": (local.traditional_name != remote.traditional_name),
            "texts": text_changes,
        }

    def _validate_shared_texts(self, plans):
        seen = {}

        for plan in plans:
            for order, item in sorted(plan["local_items"].items()):
                text = item.text
                values = tuple(getattr(text, field) for field in TEXT_FIELDS)
                previous = seen.get(text.slug)

                if previous is None:
                    seen[text.slug] = {
                        "values": values,
                        "slug": plan["slug"],
                        "order": order,
                    }
                    continue

                if previous["values"] != values:
                    raise CommandError(
                        "Один и тот же Text используется в нескольких правилах, "
                        "но локальные traditional-поля отличаются: "
                        f"Text={text.slug!r}; "
                        f"{previous['slug']} order={previous['order']} и "
                        f"{plan['slug']} order={order}."
                    )

    @staticmethod
    def _has_changes(plan):
        return bool(plan["rule_name_changed"] or plan["texts"])

    def _print_plan(self, plan, prefix="План синхронизации:"):
        local_items = plan["local_items"]
        with_traditional = sum(
            bool((item.text.traditional_content or "").strip()) for item in local_items.values()
        )

        self.stdout.write("")
        self.stdout.write(self.style.HTTP_INFO(f"---- {plan['slug']} ----"))
        self.stdout.write(
            f"Text-элементов: {len(local_items)}; "
            f"локально traditional_content заполнено: {with_traditional}."
        )
        self.stdout.write(prefix)

        if not self._has_changes(plan):
            self.stdout.write("  Изменений нет.")
            return

        if plan["rule_name_changed"]:
            self.stdout.write("  PrayerRule: traditional_name")

        for slug, row in sorted(
            plan["texts"].items(),
            key=lambda pair: pair[1]["order"],
        ):
            self.stdout.write(f"  order={row['order']:>2} Text {slug}: " + ", ".join(row["fields"]))

    def _apply(self, plans):
        updated_texts = set()

        for plan in plans:
            if plan["rule_name_changed"]:
                remote_rule = plan["remote"]
                remote_rule.traditional_name = plan["local"].traditional_name
                remote_rule.save(
                    using=REMOTE_ALIAS,
                    update_fields=["traditional_name"],
                )

            for slug, row in plan["texts"].items():
                if slug in updated_texts:
                    continue

                remote_text = row["remote"]
                local_text = row["local"]
                fields = row["fields"]

                for field in fields:
                    setattr(remote_text, field, getattr(local_text, field))

                remote_text.save(
                    using=REMOTE_ALIAS,
                    update_fields=fields,
                )
                updated_texts.add(slug)
