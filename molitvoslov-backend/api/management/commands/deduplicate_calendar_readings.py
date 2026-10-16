"""Audit / conservatively remove already accumulated duplicate daily readings.

All groups compare Bible range and service. Automatic removal is limited
to identical/ordinary-equivalent rubrics; groups whose labels denote
distinct commemorations remain for explicit human review.
"""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connections, transaction

from api.calendar_models import CalendarDay, CalendarReading
from api.calendar_reading_identity import find_duplicate_groups, normalized_reading_key
from api.sqlite_backup import create_sqlite_backup


def rubric_role(label):
    text = str(label or "").casefold().replace("ё", "е").strip()
    text = re.sub(r"[\s.,;:]+", "", text)
    if text in {"", "ряд", "рядовое", "рядовыечтения", "лит", "литургия", "налитургии"}:
        return "ordinary"
    if text in {"утр", "утреня", "наутрени"}:
        return "matins"
    if text in {"веч", "вечерня", "навеч", "навечерни", "навечерне"}:
        return "vespers"
    return text


def select_duplicate_cleanup(readings):
    """Pure planning step. Protect different feast/saint labels from deletion."""
    removable, ambiguous = [], []
    for group in find_duplicate_groups(readings):
        roles = {rubric_role(item.label) for item in group}
        if len(roles) == 1:
            removable.append((group[0], group[1:]))
        else:
            ambiguous.append(group)
    return removable, ambiguous


class Command(BaseCommand):
    help = "Найти и безопасно убрать повторы Евангелия/Апостола в существующем календаре."

    def add_arguments(self, parser):
        parser.add_argument("--year", type=int, default=2027)
        parser.add_argument("--apply", action="store_true", help="Удалить лишь однозначные дубли из SQLite.")
        parser.add_argument("--report", default="", help="JSON-отчёт по обнаруженным группам.")

    def handle(self, *args, **opts):
        year = opts["year"]
        if not 1900 <= year <= 2098:
            raise CommandError("Год вне диапазона 1900–2098.")
        connection = connections["default"]
        if connection.vendor != "sqlite":
            raise CommandError("Очистка разрешена только в локальной SQLite.")
        days = (
            CalendarDay.objects.filter(date_gregorian__year=year)
            .prefetch_related("readings")
            .order_by("date_gregorian")
        )
        rows = []
        delete_ids = []
        stats = Counter()
        for day in days:
            readings = list(day.readings.all())
            removal, ambiguous = select_duplicate_cleanup(readings)
            for first, extras in removal:
                ids = [r.pk for r in extras]
                delete_ids.extend(ids)
                stats["duplicates_to_remove"] += len(ids)
                rows.append({
                    "date": day.date_gregorian.isoformat(),
                    "status": "EXACT_OR_EQUIVALENT_DUPLICATE",
                    "key": list(normalized_reading_key(first)),
                    "keep": {"id": first.pk, "label": first.label, "title": first.title},
                    "remove": [{"id": r.pk, "label": r.label, "title": r.title} for r in extras],
                })
            for group in ambiguous:
                stats["requires_manual_review"] += 1
                rows.append({
                    "date": day.date_gregorian.isoformat(),
                    "status": "REVIEW_DIFFERENT_LABELS",
                    "key": list(normalized_reading_key(group[0])),
                    "rows": [{"id": r.pk, "label": r.label, "title": r.title} for r in group],
                })
        output = Path(opts["report"] or (
            Path(settings.BASE_DIR) / "reports" / f"calendar_reading_duplicates_{year}.json"
        )).resolve()
        output.parent.mkdir(parents=True, exist_ok=True)
        report = {
            "year": year,
            "mode": "APPLY" if opts["apply"] else "DRY_RUN",
            "planned_deletions": len(delete_ids),
            "different_label_groups_for_review": stats["requires_manual_review"],
            "entries": rows,
        }
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        self.stdout.write(
            f"{year}: автоматические дубли={len(delete_ids)}, "
            f"спорные группы={stats['requires_manual_review']}; отчёт: {output}"
        )
        if not opts["apply"]:
            self.stdout.write("DRY-RUN: база не изменена.")
            return
        if not delete_ids:
            self.stdout.write("Удалять нечего. База не изменена.")
            return
        database_path = Path(connection.settings_dict["NAME"])
        backup_dir = Path(settings.BASE_DIR) / "backups" / "sqlite"
        backup, digest = create_sqlite_backup(database_path, backup_dir)
        self.stdout.write(f"BACKUP: {backup}; SHA256: {digest}")
        with transaction.atomic():
            deleted, _ = CalendarReading.objects.filter(
                pk__in=delete_ids, day__date_gregorian__year=year
            ).delete()
        if deleted != len(delete_ids):
            raise CommandError(
                f"Удалено {deleted}, ожидалось {len(delete_ids)}. Проверь отчёт и backup."
            )
        self.stdout.write(self.style.SUCCESS(
            f"Удалено {deleted} дублей. Различающиеся службы и подписи сохранены."
        ))
