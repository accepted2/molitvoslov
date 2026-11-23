"""Preview or apply non-destructive source chrome cleanup to local calendar cards.

Never touches calendar day/reading tables, IDs or images. Honors manually_edited_fields.
For --apply, first creates a FULL SQLite backup using the project's existing helper.
"""
from __future__ import annotations

import csv
import hashlib
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from api.calendar_models import CalendarFeast
from api.calendar_text_cleanup import clean_source_field
from api.sqlite_backup import create_sqlite_backup


FIELDS = (
    "life_content", "life_content_uk",
    "troparion_content", "troparion_content_uk",
    "kontakion_content", "kontakion_content_uk",
    "prayer_content", "prayer_content_uk",
    "magnification_content", "magnification_content_uk",
)


def _sha256(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


class Command(BaseCommand):
    help = "Сухой аудит/чистка житий и песнопений в отдельной локальной SQLite."

    def add_arguments(self, parser):
        group = parser.add_mutually_exclusive_group(required=True)
        group.add_argument("--dry-run", action="store_true")
        group.add_argument("--apply", action="store_true")
        parser.add_argument(
            "--report", default="reports/calendar_text_cleaning_audit.csv",
            help="CSV с идентификаторами, полями и хешами до/после; без полного текста.",
        )

    def handle(self, *args, **options):
        if settings.DATABASES["default"]["ENGINE"] != "django.db.backends.sqlite3":
            raise CommandError(
                "Безопасное применение разрешено только на локальной SQLite. "
                "На сервер PostgreSQL эту команду не запускать."
            )
        report = Path(options["report"]).expanduser().resolve()
        changes = []
        skipped_manual = 0
        query = CalendarFeast.objects.order_by("pk")
        for feast in query.iterator(chunk_size=200):
            manual = set(feast.manually_edited_fields or [])
            for field in FIELDS:
                if field in manual:
                    skipped_manual += 1
                    continue
                before = getattr(feast, field, "") or ""
                if not before:
                    continue
                after = clean_source_field(field, before)
                if after != before:
                    changes.append((feast.pk, field, before, after))
        report.parent.mkdir(parents=True, exist_ok=True)
        if report.exists():
            raise CommandError("Отчёт уже существует; выбери другой --report.")

        with report.open("w", encoding="utf-8-sig", newline="") as handle:
            out = csv.writer(handle)
            out.writerow([
                "feast_id", "field", "before_length", "after_length",
                "before_sha256", "after_sha256", "before_start", "after_start",
                "before_end", "after_end",
            ])
            for pk, field, before, after in changes:
                out.writerow([
                    pk, field, len(before), len(after),
                    _sha256(before), _sha256(after),
                    repr(before[:80]), repr(after[:80]),
                    repr(before[-80:]), repr(after[-80:]),
                ])

        self.stdout.write(
            f"Кандидатов на очистку: {len(changes)} полей. "
            f"Защищённых ручных полей: {skipped_manual}. Отчёт: {report}"
        )
        if options["dry_run"] or not changes:
            self.stdout.write("База НЕ изменена.")
            return

        db_path = Path(settings.DATABASES["default"]["NAME"])
        backup_dir = Path(settings.BASE_DIR) / "backups" / "sqlite"
        try:
            backup, digest = create_sqlite_backup(db_path, backup_dir)
        except Exception as exc:
            raise CommandError(f"Не удалось создать резервную копию: {exc}") from exc
        self.stdout.write(f"ПОЛНАЯ РЕЗЕРВНАЯ КОПИЯ: {backup}; SHA256: {digest}")

        with transaction.atomic():
            for pk, field, before, after in changes:
                current = CalendarFeast.objects.select_for_update().get(pk=pk)
                if (field in set(current.manually_edited_fields or [])
                        or getattr(current, field) != before):
                    raise CommandError(
                        f"Карточка {pk}, поле {field} уже изменились: "
                        "применение отменено транзакцией."
                    )
                updated = CalendarFeast.objects.filter(pk=pk, **{field: before}).update(
                    **{field: after}
                )
                if updated != 1:
                    raise CommandError(
                        f"Не удалось безопасно обновить {pk}/{field}; откат."
                    )

        self.stdout.write(self.style.SUCCESS(
            f"Очищено {len(changes)} полей. Исходная база сохранена: {backup}"
        ))
