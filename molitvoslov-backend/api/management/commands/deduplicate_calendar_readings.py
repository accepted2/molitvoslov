"""Audit and consolidate duplicate Scripture references in CalendarReading.

One displayed reading per Bible range and service. Preserve the reason(s)
in the combined label and the full original values in a JSON audit report.
Never alter feasts, days, Bible texts, fasting, or a different service.
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
from api.calendar_reading_identity import (
    find_duplicate_groups,
    normalized_reading_key,
    reading_service,
)
from api.sqlite_backup import create_sqlite_backup


MAX_LABEL_LENGTH = CalendarReading._meta.get_field("label").max_length


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
    """Previous conservative classifier retained for compatibility and tests."""
    removable, ambiguous = [], []
    for group in find_duplicate_groups(readings):
        roles = {rubric_role(item.label) for item in group}
        if len(roles) == 1:
            removable.append((group[0], group[1:]))
        else:
            ambiguous.append(group)
    return removable, ambiguous


def make_combined_label(group):
    """Keep all distinct reasons for the identical passage without repeat cards."""
    labels = []
    seen = set()
    for record in group:
        value = " ".join(str(record.label or "").split()).strip()
        key = value.casefold().replace("ё", "е").strip(" .;")
        if not value or key in seen:
            continue
        seen.add(key)
        labels.append(value)
    return "; ".join(labels)


def plan_reading_coalescence(readings):
    """Prepare loss-auditable operations. Never combine two different services."""
    actions, review = [], []
    for group in find_duplicate_groups(readings):
        key = normalized_reading_key(group[0])
        # find_duplicate_groups already groups by kind + service + range.
        if any(normalized_reading_key(item) != key for item in group):
            review.append((group, "IDENTITY_MISMATCH"))
            continue
        combined = make_combined_label(group)
        if len(combined) > MAX_LABEL_LENGTH:
            review.append((group, "COMBINED_LABEL_TOO_LONG"))
            continue
        if reading_service(combined) != key[1]:
            review.append((group, "SERVICE_MISMATCH_AFTER_LABEL_MERGE"))
            continue
        # Keep the earliest existing row, including its sync_uid, title and order.
        # All the others are preserved in the report and SQLite backup.
        actions.append((group[0], group[1:], combined))
    return actions, review


def reading_snapshot(record):
    return {
        "id": record.pk,
        "sync_uid": str(record.sync_uid),
        "kind": record.kind,
        "label": record.label,
        "title": record.title,
        "order": record.order,
    }


class Command(BaseCommand):
    help = "Свести повторы чтений одной службы в одну строку, сохранив все подписи."

    def add_arguments(self, parser):
        parser.add_argument("--year", type=int, default=2027)
        parser.add_argument("--apply", action="store_true", help="Исправить локальную SQLite с backup.")
        parser.add_argument("--report", default="", help="JSON с оригинальными записями и всеми изменениями.")

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
        planned = []
        rows = []
        stats = Counter()
        for day in days:
            actions, review = plan_reading_coalescence(list(day.readings.all()))
            day_string = day.date_gregorian.isoformat()
            for keep, extras, merged_label in actions:
                planned.append((keep.pk, [r.pk for r in extras], merged_label))
                stats["groups"] += 1
                stats["removed_rows"] += len(extras)
                rows.append({
                    "date": day_string,
                    "status": "COALESCE_SAME_SERVICE_AND_PASSAGE",
                    "identity": list(normalized_reading_key(keep)),
                    "combined_label": merged_label,
                    "keep": reading_snapshot(keep),
                    "remove": [reading_snapshot(r) for r in extras],
                })
            for group, reason in review:
                stats["review_groups"] += 1
                rows.append({
                    "date": day_string, "status": "MANUAL_REVIEW",
                    "reason": reason,
                    "identity": list(normalized_reading_key(group[0])),
                    "rows": [reading_snapshot(r) for r in group],
                })

        output = Path(opts["report"] or (
            Path(settings.BASE_DIR) / "reports" / f"calendar_reading_duplicates_{year}.json"
        )).resolve()
        output.parent.mkdir(parents=True, exist_ok=True)
        report = {
            "year": year,
            "mode": "APPLY" if opts["apply"] else "DRY_RUN",
            "groups_to_combine": stats["groups"],
            "duplicates_to_remove": stats["removed_rows"],
            "groups_to_review": stats["review_groups"],
            "warning": (
                "Entries with the same book/range on one service are consolidated; "
                "all original labels and row contents are in this report and the SQLite backup."
            ),
            "entries": rows,
        }
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        self.stdout.write(
            f"{year}: групп для объединения={stats['groups']}, "
            f"повторных строк={stats['removed_rows']}, "
            f"нужна ручная проверка={stats['review_groups']}; отчёт: {output}"
        )

        if not opts["apply"]:
            self.stdout.write("DRY-RUN: база не изменена.")
            return
        if not planned:
            self.stdout.write("Нет однозначно совпадающих чтений. База не изменена.")
            return

        db = Path(connection.settings_dict["NAME"])
        backup, digest = create_sqlite_backup(
            db, Path(settings.BASE_DIR) / "backups" / "sqlite"
        )
        self.stdout.write(f"BACKUP: {backup}; SHA256: {digest}")

        removed = 0
        updated_labels = 0
        with transaction.atomic():
            for keep_id, extra_ids, combined_label in planned:
                old = CalendarReading.objects.get(pk=keep_id)
                if old.label != combined_label:
                    CalendarReading.objects.filter(pk=keep_id).update(label=combined_label)
                    updated_labels += 1
                deleted, _ = CalendarReading.objects.filter(
                    pk__in=extra_ids, day__date_gregorian__year=year
                ).delete()
                if deleted != len(extra_ids):
                    raise CommandError(
                        f"Конфликт удаления группы {keep_id}: ожидалось {len(extra_ids)}, удалено {deleted}."
                    )
                removed += deleted

        self.stdout.write(self.style.SUCCESS(
            f"Готово: объединено групп={len(planned)}, "
            f"удалено повторных строк={removed}, "
            f"подписей объединено={updated_labels}. "
            "Полный источник каждой объединённой записи — в JSON-отчёте и backup."
        ))
