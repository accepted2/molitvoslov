import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connections, transaction

from api.models import PrayerRule, PrayerRuleItem
from api.sqlite_backup import create_sqlite_backup
from api.management.commands.import_ucs_prayer_rules import similarity


RULE_SLUGS = {
    "morning": "molitvy-utrennie",
    "evening": "molitvy-na-son-griadushchim",
}


class Command(BaseCommand):
    help = (
        "Восстанавливает отсутствующие русские переводы утреннего и "
        "вечернего молитвенного правила из bundled offlineContent.json. "
        "Непустые translation не перезаписываются."
    )

    def add_arguments(self, parser):
        default_source = (
            settings.BASE_DIR.parent
            / "molitvoslov-app"
            / "src"
            / "data"
            / "offlineContent.json"
        )

        parser.add_argument(
            "--source",
            default=str(default_source),
            help="Путь к offlineContent.json.",
        )
        parser.add_argument(
            "--rule",
            choices=["morning", "evening", "both"],
            default="both",
        )
        parser.add_argument(
            "--backup-dir",
            default="",
        )

        mode = parser.add_mutually_exclusive_group(required=True)
        mode.add_argument("--dry-run", action="store_true")
        mode.add_argument("--apply", action="store_true")

    def handle(self, *args, **options):
        self._assert_local_sqlite()

        source_path = Path(options["source"]).expanduser().resolve()
        if not source_path.exists():
            raise CommandError(f"offlineContent.json не найден: {source_path}")

        try:
            payload = json.loads(source_path.read_text(encoding="utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise CommandError(f"Не удалось прочитать {source_path}: {error}") from error

        selected = (
            ["morning", "evening"]
            if options["rule"] == "both"
            else [options["rule"]]
        )

        plans = [self._build_plan(payload, key) for key in selected]

        self.stdout.write("")
        self.stdout.write(
            self.style.MIGRATE_HEADING(
                "Восстановление русских переводов молитвенных правил"
            )
        )

        for plan in plans:
            self.stdout.write("")
            self.stdout.write(self.style.HTTP_INFO(f'---- {plan["label"]} ----'))
            self.stdout.write(
                f'Text-элементов в БД: {plan["db_count"]}; '
                f'русских переводов в source: {plan["source_ru_count"]}; '
                f'пустых translation для заполнения: {len(plan["changes"])}; '
                f'уже заполнено: {plan["already_filled"]}.'
            )

            if plan["unsafe"]:
                self.stdout.write(
                    self.style.ERROR(
                        "Есть несовпадения source/DB; APPLY заблокирован:"
                    )
                )
                for row in plan["unsafe"]:
                    self.stdout.write(
                        f'  order={row["order"]} similarity={row["score"]:.3f}'
                    )

            self.stdout.write(
                f'Готово к APPLY: {"ДА" if plan["ready"] else "НЕТ"}.'
            )

        if options["dry_run"]:
            self.stdout.write("")
            self.stdout.write(
                self.style.SUCCESS(
                    "DRY-RUN завершён. База не изменена."
                )
            )
            return

        invalid = [plan for plan in plans if not plan["ready"]]
        if invalid:
            raise CommandError(
                "APPLY остановлен из-за несовпадения данных. "
                "Сначала проверьте --dry-run."
            )

        self._backup(options["backup_dir"])

        seen = {}

        with transaction.atomic():
            for plan in plans:
                for row in plan["changes"]:
                    text = row["item"].text
                    value = row["translation"]

                    previous = seen.get(text.pk)
                    if previous is not None and previous != value:
                        raise CommandError(
                            "Один Text получил разные русские переводы из source: "
                            f"Text id={text.pk}."
                        )

                    seen[text.pk] = value

                    # Никогда не перезаписываем уже существующий перевод.
                    if not (text.translation or "").strip():
                        text.translation = value
                        text.save(update_fields=["translation"])

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                f"APPLY завершён. Заполнено translation: {len(seen)}."
            )
        )

    def _build_plan(self, payload, key):
        slug = RULE_SLUGS[key]
        label = (
            "Утренние молитвы"
            if key == "morning"
            else "Вечерние молитвы"
        )

        source_rule = (
            payload.get("prayer_rules", {})
            .get("by_slug", {})
            .get(slug)
        )
        if not source_rule:
            raise CommandError(
                f'В offlineContent.json нет PrayerRule slug="{slug}".'
            )

        rule = PrayerRule.objects.filter(slug=slug).first()
        if rule is None:
            raise CommandError(
                f'В локальной БД нет PrayerRule slug="{slug}".'
            )

        db_items = list(
            rule.items
            .filter(
                item_type=PrayerRuleItem.TYPE_TEXT,
                text__isnull=False,
            )
            .select_related("text")
            .order_by("order", "id")
        )
        db_by_order = {item.order: item for item in db_items}

        source_rows = {}
        for source_item in source_rule.get("items", []):
            if source_item.get("item_type") != "text":
                continue

            source_text = source_item.get("text") or {}
            translation = str(source_text.get("translation") or "").strip()
            if not translation:
                continue

            source_rows[int(source_item["order"])] = {
                "content": str(source_text.get("content") or ""),
                "translation": translation,
            }

        changes = []
        unsafe = []
        already_filled = 0

        for order, source in sorted(source_rows.items()):
            item = db_by_order.get(order)
            if item is None:
                unsafe.append({"order": order, "score": 0.0})
                continue

            score = similarity(item.text.content, source["content"])
            if score < 0.90:
                unsafe.append({"order": order, "score": score})
                continue

            if (item.text.translation or "").strip():
                already_filled += 1
                continue

            changes.append(
                {
                    "order": order,
                    "item": item,
                    "translation": source["translation"],
                }
            )

        return {
            "label": label,
            "db_count": len(db_items),
            "source_ru_count": len(source_rows),
            "changes": changes,
            "already_filled": already_filled,
            "unsafe": unsafe,
            "ready": not unsafe,
        }

    def _backup(self, backup_dir):
        database = settings.DATABASES["default"]
        source_path = Path(database["NAME"])
        output_dir = (
            Path(backup_dir).expanduser()
            if backup_dir
            else Path(settings.BASE_DIR) / "backups" / "sqlite"
        )

        try:
            destination, digest = create_sqlite_backup(
                source_path,
                output_dir,
            )
        except Exception as error:
            raise CommandError(
                f"Не удалось создать backup перед APPLY: {error}"
            ) from error

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("Резервная копия создана."))
        self.stdout.write(f"Файл: {destination}")
        self.stdout.write(f"SHA256: {digest}")

    def _assert_local_sqlite(self):
        connection = connections["default"]
        if connection.vendor != "sqlite":
            raise CommandError(
                "Команда предназначена только для локальной SQLite. "
                f"Текущий default DB vendor: {connection.vendor}."
            )
