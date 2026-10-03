import os

from django.core.management.base import BaseCommand, CommandError
from django.db import connections, transaction

from api.models import Akathist, AkathistSection, Text


REMOTE_ALIAS = "supabase_sync"

AKATHIST_FIELDS = [
    "title",
    "description",
    "is_visible",
]

TEXT_FIELDS = [
    "title",
    "description",
    "content",
    "traditional_content",
    "translation",
    "description_position",
    "language",
    "is_visible",
]

SECTION_FIELDS = [
    "section_type",
    "number",
    "note",
]


class Command(BaseCommand):
    help = (
        "Синхронизировать один существующий акафист из локальной SQLite "
        "в Supabase. Меняются только реально отличающиеся поля этого акафиста, "
        "его разделов и связанных Text. Структурные расхождения безопасно "
        "останавливают команду."
    )

    def add_arguments(self, parser):
        target = parser.add_mutually_exclusive_group(required=True)
        target.add_argument("--slug", help="Slug локального акафиста.")
        target.add_argument("--id", type=int, dest="akathist_id", help="ID локального акафиста.")

        mode = parser.add_mutually_exclusive_group(required=True)
        mode.add_argument("--dry-run", action="store_true")
        mode.add_argument("--apply", action="store_true")

    def handle(self, *args, **options):
        self._assert_local_source()
        self._configure_supabase_connection()
        self._check_remote()

        local = self._get_local(options)
        remote = (
            Akathist.objects.using(REMOTE_ALIAS)
            .select_related("troparion", "kontakion_before")
            .prefetch_related("sections__text")
            .filter(slug=local.slug)
            .first()
        )

        if remote is None:
            raise CommandError(
                f"В Supabase нет акафиста со slug={local.slug!r}. "
                "Команда намеренно не создаёт новые акафисты автоматически."
            )

        plan = self._build_plan(local, remote)
        self._print_plan(local, plan)

        if options["dry_run"]:
            self.stdout.write(self.style.WARNING("DRY-RUN: Supabase не изменён."))
            return

        with transaction.atomic(using=REMOTE_ALIAS):
            self._apply_plan(local, remote, plan)

        fresh_remote = (
            Akathist.objects.using(REMOTE_ALIAS)
            .select_related("troparion", "kontakion_before")
            .prefetch_related("sections__text")
            .get(slug=local.slug)
        )
        verify = self._build_plan(local, fresh_remote)

        if self._has_changes(verify):
            self._print_plan(local, verify, prefix="Остались расхождения после записи:")
            raise CommandError("Проверка после записи не прошла.")

        self.stdout.write(
            self.style.SUCCESS(
                f"Готово: {local.title}\n"
                "Supabase синхронизирован и проверен. "
                "Другие акафисты и другие таблицы не изменялись."
            )
        )

    def _assert_local_source(self):
        engine = connections["default"].settings_dict.get("ENGINE", "")
        if engine != "django.db.backends.sqlite3":
            raise CommandError(
                "Источник должен быть локальной SQLite. "
                "Не задавайте SUPABASE_DB_PASSWORD для default; "
                "для назначения используется SUPABASE_SYNC_DB_PASSWORD."
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
                os.environ.get("SUPABASE_DB_USER", "postgres.gguwppijpnpjpmpkiumd"),
            ),
            "PASSWORD": password,
            "HOST": os.environ.get(
                "SUPABASE_SYNC_DB_HOST",
                os.environ.get("SUPABASE_DB_HOST", "aws-1-eu-central-1.pooler.supabase.com"),
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
            Akathist.objects.using(REMOTE_ALIAS).count()
            Text.objects.using(REMOTE_ALIAS).count()
        except Exception as error:
            raise CommandError(f"Не удалось подключиться к Supabase: {error}") from error

    def _get_local(self, options):
        qs = (
            Akathist.objects.using("default")
            .select_related("troparion", "kontakion_before")
            .prefetch_related("sections__text")
        )

        if options.get("slug"):
            lookup = {"slug": options["slug"]}
        else:
            lookup = {"pk": options["akathist_id"]}

        try:
            return qs.get(**lookup)
        except Akathist.DoesNotExist as error:
            raise CommandError("Локальный акафист не найден.") from error

    @staticmethod
    def _changed_fields(remote, local, fields):
        return [field for field in fields if getattr(remote, field) != getattr(local, field)]

    def _collect_local_texts(self, local):
        texts = {}

        for value in [local.troparion, local.kontakion_before]:
            if value is not None:
                texts[value.slug] = value

        for section in local.sections.all():
            texts[section.text.slug] = section.text

        return texts

    def _remote_texts(self, local_texts):
        remote = {
            item.slug: item
            for item in Text.objects.using(REMOTE_ALIAS).filter(slug__in=list(local_texts))
        }
        missing = sorted(set(local_texts) - set(remote))
        if missing:
            raise CommandError("В Supabase отсутствуют связанные Text: " + ", ".join(missing[:20]))
        return remote

    def _build_plan(self, local, remote):
        local_sections = {item.order: item for item in local.sections.all()}
        remote_sections = {item.order: item for item in remote.sections.all()}

        if set(local_sections) != set(remote_sections):
            local_only = sorted(set(local_sections) - set(remote_sections))
            remote_only = sorted(set(remote_sections) - set(local_sections))
            raise CommandError(
                "Структура разделов отличается. Автоматическая запись остановлена, "
                "чтобы ничего не удалить и не перепутать. "
                f"Только локально orders={local_only}; только в Supabase orders={remote_only}."
            )

        local_texts = self._collect_local_texts(local)
        remote_texts = self._remote_texts(local_texts)

        text_changes = {}
        for slug, local_text in local_texts.items():
            changed = self._changed_fields(remote_texts[slug], local_text, TEXT_FIELDS)
            if changed:
                text_changes[slug] = changed

        section_changes = {}
        for order, local_section in local_sections.items():
            remote_section = remote_sections[order]
            changed = self._changed_fields(remote_section, local_section, SECTION_FIELDS)

            if remote_section.text.slug != local_section.text.slug:
                changed.append("text")

            if changed:
                section_changes[order] = changed

        akathist_changes = self._changed_fields(remote, local, AKATHIST_FIELDS)

        relation_changes = []
        local_troparion = local.troparion.slug if local.troparion else None
        remote_troparion = remote.troparion.slug if remote.troparion else None
        if local_troparion != remote_troparion:
            relation_changes.append("troparion")

        local_before = local.kontakion_before.slug if local.kontakion_before else None
        remote_before = remote.kontakion_before.slug if remote.kontakion_before else None
        if local_before != remote_before:
            relation_changes.append("kontakion_before")

        return {
            "akathist": akathist_changes,
            "relations": relation_changes,
            "texts": text_changes,
            "sections": section_changes,
            "local_texts": local_texts,
            "remote_texts": remote_texts,
            "local_sections": local_sections,
            "remote_sections": remote_sections,
        }

    @staticmethod
    def _has_changes(plan):
        return bool(plan["akathist"] or plan["relations"] or plan["texts"] or plan["sections"])

    def _print_plan(self, local, plan, prefix="План синхронизации:"):
        self.stdout.write(f"Акафист: {local.title}")
        self.stdout.write(f"slug: {local.slug}")
        self.stdout.write(prefix)

        if not self._has_changes(plan):
            self.stdout.write("  Изменений нет.")
            return

        if plan["akathist"]:
            self.stdout.write("  Акафист: " + ", ".join(plan["akathist"]))

        if plan["relations"]:
            self.stdout.write("  Связи акафиста: " + ", ".join(plan["relations"]))

        for slug, fields in sorted(plan["texts"].items()):
            self.stdout.write(f"  Text {slug}: {', '.join(fields)}")

        for order, fields in sorted(plan["sections"].items()):
            self.stdout.write(f"  Раздел order={order}: {', '.join(fields)}")

    def _apply_plan(self, local, remote, plan):
        for slug, fields in plan["texts"].items():
            local_text = plan["local_texts"][slug]
            remote_text = plan["remote_texts"][slug]
            for field in fields:
                setattr(remote_text, field, getattr(local_text, field))
            remote_text.save(using=REMOTE_ALIAS, update_fields=fields)

        akathist_fields = list(plan["akathist"])
        for field in akathist_fields:
            setattr(remote, field, getattr(local, field))

        if "troparion" in plan["relations"]:
            remote.troparion = (
                plan["remote_texts"][local.troparion.slug] if local.troparion else None
            )
            akathist_fields.append("troparion")

        if "kontakion_before" in plan["relations"]:
            remote.kontakion_before = (
                plan["remote_texts"][local.kontakion_before.slug]
                if local.kontakion_before
                else None
            )
            akathist_fields.append("kontakion_before")

        if akathist_fields:
            remote.save(using=REMOTE_ALIAS, update_fields=akathist_fields)

        for order, fields in plan["sections"].items():
            local_section = plan["local_sections"][order]
            remote_section = plan["remote_sections"][order]
            update_fields = []

            for field in fields:
                if field == "text":
                    remote_section.text = plan["remote_texts"][local_section.text.slug]
                else:
                    setattr(remote_section, field, getattr(local_section, field))
                update_fields.append(field)

            remote_section.save(using=REMOTE_ALIAS, update_fields=update_fields)
