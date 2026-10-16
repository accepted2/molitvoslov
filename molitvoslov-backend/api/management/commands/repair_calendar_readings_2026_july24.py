"""Repair the one 2026-07-24 day whose Azbyka source uses conditional prose.

Sources:
  https://azbyka.ru/days/2026-07-24
  https://valaam.ru/calendar/20260724/

Ordinary service, saints' service, and TWO conditional polyeleos options
must be distinguished. The old prose parser incorrectly stored narrative
text inside labels and truncated two jump readings.

Dry-run is default. --apply edits ONLY CalendarReading for 2026-07-24,
requires a SQLite backup, and writes a before/after JSON report.
"""
import json
import re
from datetime import date
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connections, transaction

from api.azbyka_calendar_readings import REFERENCE_RE, normalize_book, normalize_verses
from api.calendar_models import CalendarDay, CalendarReading
from api.calendar_reading_identity import canonical_scripture_title
from api.sqlite_backup import create_sqlite_backup


TARGET_DATE = date(2026, 7, 24)
# These appointments were explicitly checked against the cited sources.
# "Утр." readings happen only when the corresponding polyeleos is served.
# The two Olga matin Gospel passages are ALTERNATIVES, never simultaneous.
APPOINTMENTS = (
    ("apostle", "Ряд.", "1Кор.11:8–22 (зач. 148)", ()),
    ("gospel", "Ряд.", "Мф.17:10–18 (зач. 71)", ()),
    ("apostle", "Свв.; равноап. Ольги (вариант)", "2Кор.6:1–10 (зач. 181)", ()),
    ("gospel", "Свв.; равноап. Ольги (вариант)", "Лк.7:36–50 (зач. 33)", ()),
    ("gospel", "Утр. равноап. Ольги (полиелей)", "Мф.25:1–13 (зач. 104)", ()),
    ("gospel", "Утр. равноап. Ольги (вариант)", "Мф.13:33,44–50", ("Мф.13:33",)),
    ("apostle", "Равноап. Ольги (полиелей)", "Деян.16:12–15,17:1–4", ("Деян.16:12–15",)),
    ("gospel", "Утр. сщмч. Илариона (полиелей)", "Мф.10:16–22 (зач. 36)", ()),
    ("apostle", "Сщмч. Илариона (полиелей)", "Евр.7:26–8:2 (зач. 318)", ()),
    ("gospel", "Сщмч. Илариона (полиелей)", "Ин.10:9–16 (зач. 36)", ()),
)


def first_reference_key(title):
    """Match a malformed historic row by the actual Bible reference, not prose.

    For formerly truncated jump readings, aliases identify their ORIGINAL
    reference. This function is not used to infer any additional verses.
    """
    match = REFERENCE_RE.search(str(title or ""))
    if not match:
        return None
    ref = f"{normalize_book(match.group('book'))}.{normalize_verses(match.group('verses'))}"
    return canonical_scripture_title(ref)


def row_details(row):
    return {
        "id": row.pk,
        "sync_uid": str(row.sync_uid),
        "kind": row.kind,
        "label": row.label,
        "title": row.title,
        "order": row.order,
    }


def plan_july24_repair(readings):
    """Create-only or update-only; no deletes and no guessing for unmatched rows."""
    used_ids = set()
    actions = []
    for index, (kind, label, title, aliases) in enumerate(APPOINTMENTS, start=1):
        match_keys = {first_reference_key(value) for value in (title, *aliases)}
        matches = [
            row for row in readings
            if row.pk not in used_ids and row.kind == kind
            and first_reference_key(row.title) in match_keys
        ]
        if len(matches) > 1:
            raise CommandError(
                f"{TARGET_DATE}: неоднозначное соответствие {kind} {title}: "
                f"{[row.pk for row in matches]}. Нужна ручная проверка."
            )
        desired = {
            "kind": kind, "label": label, "title": title, "order": index * 10,
        }
        if matches:
            row = matches[0]
            used_ids.add(row.pk)
            changed = {
                key: value for key, value in desired.items()
                if getattr(row, key) != value
            }
            actions.append({
                "action": "UPDATE" if changed else "SAME",
                "row_id": row.pk,
                "before": row_details(row),
                "after": desired,
                "changed": changed,
            })
        else:
            actions.append({
                "action": "CREATE", "row_id": None, "before": None,
                "after": desired, "changed": desired,
            })

    unexpected = [row_details(row) for row in readings if row.pk not in used_ids]
    return actions, unexpected


class Command(BaseCommand):
    help = "Безопасно привести чтения 24 июля 2026 к источнику и убрать искажённые подписи."

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true")
        parser.add_argument("--report", default="")

    def handle(self, *args, **options):
        connection = connections["default"]
        if connection.vendor != "sqlite":
            raise CommandError("Источник должен быть локальной SQLite.")

        day = CalendarDay.objects.filter(date_gregorian=TARGET_DATE).first()
        if day is None:
            raise CommandError("В SQLite нет CalendarDay на 2026-07-24.")
        readings = list(day.readings.order_by("order", "pk"))
        actions, unexpected = plan_july24_repair(readings)

        report_path = Path(options["report"] or (
            Path(settings.BASE_DIR) / "reports" / "calendar_2026_07_24_repair.json"
        )).resolve()
        report_path.parent.mkdir(parents=True, exist_ok=True)
        plan = {
            "date": TARGET_DATE.isoformat(),
            "mode": "APPLY" if options["apply"] else "DRY_RUN",
            "sources": [
                "https://azbyka.ru/days/2026-07-24",
                "https://valaam.ru/calendar/20260724/",
            ],
            "notice": "Праздничные полиелейные назначения условные; альтернативные чтения не одновременны.",
            "actions": actions,
            "unmatched_local_rows": unexpected,
        }
        report_path.write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")

        counts = {
            name: sum(action["action"] == name for action in actions)
            for name in ("CREATE", "UPDATE", "SAME")
        }
        self.stdout.write(
            f"2026-07-24: CREATE {counts['CREATE']}, "
            f"UPDATE {counts['UPDATE']}, SAME {counts['SAME']}; "
            f"неопознанных старых строк: {len(unexpected)}."
        )
        for action in actions:
            if action["action"] != "SAME":
                self.stdout.write(
                    f"  {action['action']} "
                    f"{action['after']['kind']}: {action['after']['title']} "
                    f"[{action['after']['label']}]"
                )
        self.stdout.write(f"Отчёт до изменений: {report_path}")
        if unexpected:
            self.stdout.write(self.style.WARNING(
                "Есть записи, отсутствующие в проверенном наборе; "
                "они останутся без изменений."
            ))
        if not options["apply"]:
            self.stdout.write("DRY-RUN: SQLite не изменена.")
            return

        if not counts["CREATE"] and not counts["UPDATE"]:
            self.stdout.write("Все записи совпадают с планом; SQLite не изменена.")
            return

        sqlite_file = Path(connection.settings_dict["NAME"])
        backup, sha = create_sqlite_backup(
            sqlite_file, Path(settings.BASE_DIR) / "backups" / "sqlite"
        )
        self.stdout.write(f"BACKUP: {backup}; SHA256: {sha}")

        with transaction.atomic():
            for action in actions:
                if action["action"] == "UPDATE":
                    CalendarReading.objects.filter(
                        pk=action["row_id"], day=day,
                    ).update(**action["changed"])
                elif action["action"] == "CREATE":
                    CalendarReading.objects.create(
                        day=day, **action["after"],
                    )
        self.stdout.write(self.style.SUCCESS(
            "Готово: исправлен только CalendarReading за 2026-07-24. "
            "Старые значения сохранены в отчёте и резервной копии."
        ))
