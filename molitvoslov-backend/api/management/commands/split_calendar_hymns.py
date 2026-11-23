"""Audit or split existing CalendarFeast hymns into primary/alternate variants.

No data is deleted; all manual Django edits are protected; SQLite backup required.
Only a separate local SQLite database may be changed. Never apply to live PG.
"""
from __future__ import annotations

import csv
import hashlib
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from api.calendar_hymn_normalization import normalize_hymn_source_fields
from api.calendar_models import CalendarFeast
from api.sqlite_backup import create_sqlite_backup


KINDS = ("troparion", "kontakion")
SUFFIXES = ("", "_uk")


def _field_names(kind, suffix):
    return (
        f"{kind}_title{suffix}",
        f"{kind}_content{suffix}",
        f"{kind}_alternate_title{suffix}",
        f"{kind}_alternate_content{suffix}",
        f"{kind}_script{suffix}",
        f"{kind}_alternate_script{suffix}",
    )


def _digest(value):
    return hashlib.sha256(str(value).encode("utf-8")).hexdigest()


class Command(BaseCommand):
    help = "Безопасное разделение тропарей/кондаков и конвертация UCS в Unicode."

    def add_arguments(self, parser):
        options = parser.add_mutually_exclusive_group(required=True)
        options.add_argument("--dry-run", action="store_true")
        options.add_argument("--apply", action="store_true")
        parser.add_argument("--report", required=True)

    def handle(self, *args, **options):
        if settings.DATABASES["default"]["ENGINE"] != "django.db.backends.sqlite3":
            raise CommandError(
                "Этот перенос разрешён только на локальной SQLite. "
                "Сервер PostgreSQL изменять нельзя."
            )
        report = Path(options["report"]).expanduser().resolve()
        if report.exists():
            raise CommandError("Файл отчёта уже существует; укажите новое имя.")
        changes = []
        issues = []
        protected_count = 0
        for feast in CalendarFeast.objects.order_by("pk").iterator(chunk_size=200):
            manually = set(feast.manually_edited_fields or [])
            for kind in KINDS:
                for suffix in SUFFIXES:
                    fields = _field_names(kind, suffix)
                    before = {field: getattr(feast, field, "") or "" for field in fields}
                    if not before[f"{kind}_content{suffix}"]:
                        continue
                    if manually.intersection(fields):
                        protected_count += 1
                        continue
                    after, warnings = normalize_hymn_source_fields(before)
                    if warnings:
                        issues.extend((feast.pk, kind, suffix, warning) for warning in warnings)
                        continue
                    for field in fields:
                        before_value = before[field]
                        after_value = after.get(field, before_value)
                        if after_value != before_value:
                            changes.append((feast.pk, field, before_value, after_value))
        report.parent.mkdir(parents=True, exist_ok=True)
        with report.open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.writer(handle)
            writer.writerow([
                "feast_id", "field", "before_length", "after_length",
                "before_sha256", "after_sha256", "before_start", "after_start",
            ])
            for pk, field, before, after in changes:
                writer.writerow([
                    pk, field, len(before), len(after), _digest(before), _digest(after),
                    repr(before[:120]), repr(after[:120]),
                ])
        self.stdout.write(
            f"Кандидатов: {len(changes)}. Защищено вручную: {protected_count}. "
            f"Неоднозначностей: {len(issues)}. Отчёт: {report}"
        )
        if options["dry_run"]:
            self.stdout.write("DRY RUN: БАЗА НЕ ИЗМЕНЕНА.")
            return
        if issues:
            raise CommandError(
                "Обнаружены неоднозначные песнопения, база не менялась. "
                f"Первые примеры: {issues[:8]}"
            )
        if not changes:
            self.stdout.write("Изменений нет. База не менялась.")
            return
        db_path = Path(settings.DATABASES["default"]["NAME"])
        backup_dir = Path(settings.BASE_DIR) / "backups" / "sqlite"
        try:
            backup, digest = create_sqlite_backup(db_path, backup_dir)
        except Exception as exc:
            raise CommandError(f"Не удалось создать резервную копию SQLite: {exc}") from exc
        self.stdout.write(f"РЕЗЕРВНАЯ КОПИЯ: {backup} SHA256={digest}")
        with transaction.atomic():
            for pk, field, before, after in changes:
                current = CalendarFeast.objects.select_for_update().get(pk=pk)
                if field in (current.manually_edited_fields or []) or \
                        getattr(current, field) != before:
                    raise CommandError(
                        f"Карточка {pk}, поле {field} изменились параллельно. "
                        "Откат без частичной записи."
                    )
                changed = CalendarFeast.objects.filter(
                    pk=pk, **{field: before}
                ).update(**{field: after})
                if changed != 1:
                    raise CommandError(f"Не удалось обновить {pk}/{field}; откат.")
        self.stdout.write(self.style.SUCCESS(
            f"Разделено/перекодировано {len(changes)} полей. "
            f"Полный исходник сохранён: {backup}"
        ))
