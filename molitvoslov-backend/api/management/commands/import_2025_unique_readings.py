"""Safely import unique scripture passages for 2025; preserve existing days.

This is deliberately separate from import_azbyka_calendar_readings, because local
installations may have additional merge behavior absent from the repository.
Deduplication key = kind + normalized title (including zachalo); labels ignored.
"""
from collections import Counter
from datetime import date, timedelta
import time

import requests
from django.core.management.base import BaseCommand, CommandError
from django.db import connections, transaction
from api.azbyka_calendar_readings import fetch_day_readings, AzbykaReadingsError
from api.calendar_models import CalendarDay, CalendarReading
from api.sqlite_backup import create_sqlite_backup
from django.conf import settings
from pathlib import Path
from api.management.commands.import_azbyka_calendar_readings import deterministic_azbyka_reading_uid


def distinct_readings(readings):
    seen, result = set(), []
    for r in readings:
        key = (r.kind.strip(), "".join(r.title.split()).replace("—", "–").replace("-", "–"))
        if key not in seen:
            seen.add(key)
            result.append(r)
    return result


class Command(BaseCommand):
    help = "Safely import unique Azbyka reading references to empty 2025 days, preserving existing days."

    def add_arguments(self, parser):
        parser.add_argument("--start", default="2025-01-01")
        parser.add_argument("--end", default="2025-01-07")
        mode = parser.add_mutually_exclusive_group(required=True)
        mode.add_argument("--dry-run", action="store_true")
        mode.add_argument("--apply", action="store_true")
        parser.add_argument("--delay", type=float, default=0.35)

    def handle(self, *args, **opts):
        if connections["default"].vendor != "sqlite":
            raise CommandError("Local SQLite only")
        try:
            start, end = date.fromisoformat(opts["start"]), date.fromisoformat(opts["end"])
        except ValueError as exc:
            raise CommandError("Dates must be YYYY-MM-DD") from exc
        if not (date(2025, 1, 1) <= start <= end <= date(2025, 12, 31)):
            raise CommandError("2025 dates only")
        days = list(CalendarDay.objects.filter(date_gregorian__range=(start, end)).order_by("date_gregorian"))
        if len(days) != (end - start).days + 1:
            raise CommandError("Some CalendarDay rows are missing; no changes")
        stats = Counter()
        backup_done = False
        with requests.Session() as session:
            for n, day in enumerate(days):
                if day.readings.exists():
                    stats["skipped_existing"] += 1
                    self.stdout.write(f"{day.date_gregorian}: SKIP existing readings")
                    continue
                try:
                    parsed = fetch_day_readings(day.date_gregorian, session=session)
                except (AzbykaReadingsError, requests.RequestException) as exc:
                    stats["source_errors"] += 1
                    self.stderr.write(f"{day.date_gregorian}: ERROR {exc}")
                    continue
                unique = distinct_readings(parsed.readings)
                stats["found"] += len(parsed.readings)
                stats["unique"] += len(unique)
                stats["duplicates_removed"] += len(parsed.readings) - len(unique)
                self.stdout.write(f"{day.date_gregorian}: source={len(parsed.readings)}, unique={len(unique)}, ignored={len(parsed.readings)-len(unique)}")
                if opts["apply"]:
                    if not backup_done:
                        src = Path(settings.DATABASES["default"]["NAME"])
                        dst, digest = create_sqlite_backup(src, Path(settings.BASE_DIR) / "backups" / "sqlite")
                        self.stdout.write(f"BACKUP: {dst} SHA256: {digest}")
                        backup_done = True
                    # Recheck inside the transaction; never overwrite existing rows.
                    with transaction.atomic():
                        locked = CalendarDay.objects.select_for_update().get(pk=day.pk)
                        if locked.readings.exists():
                            stats["skipped_existing"] += 1
                            continue
                        CalendarReading.objects.bulk_create([
                            CalendarReading(
                                sync_uid=deterministic_azbyka_reading_uid(day.date_gregorian, reading),
                                day=locked,
                                kind=reading.kind,
                                label=reading.label,
                                title=reading.title,
                                order=reading.order,
                            )
                            for reading in unique
                        ])
                        expected_gospel = next((r.title for r in unique if r.kind == "gospel"), "")
                        expected_apostle = next((r.title for r in unique if r.kind == "apostle"), "")
                        CalendarDay.objects.filter(pk=day.pk).update(
                            gospel_title=expected_gospel, gospel_title_uk=expected_gospel,
                            apostolic_title=expected_apostle, apostolic_title_uk=expected_apostle)
                        actual = Counter((r.kind, r.title) for r in locked.readings.all())
                        if len(actual) != len(unique) or any(v != 1 for v in actual.values()):
                            raise CommandError(f"Duplicate integrity check failed for {day.date_gregorian}; transaction rolled back")
                        stats["days_created"] += 1
                if opts["delay"] > 0 and n < len(days)-1:
                    time.sleep(opts["delay"])
        self.stdout.write("SUMMARY: " + " ".join(f"{key}={val}" for key, val in sorted(stats.items())))
        if opts["dry_run"]:
            self.stdout.write("DRY RUN: no changes")
        else:
            self.stdout.write("APPLY: existing days preserved; no changes to 2026/2027")
