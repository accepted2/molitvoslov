#!/usr/bin/env python3
"""Safely prune CalendarFeast cards excluded by the frozen 2026 manifest.

Default: verify and preview. --apply: backup SQLite and remove only verified
noncanonical records, unhooking any 2025 links. NEVER touches Supabase.
"""
import argparse
import csv
import os
import sqlite3
from datetime import datetime
from pathlib import Path
from django.db import transaction

ROOT = Path(__file__).resolve().parent
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
import django
django.setup()
from django.conf import settings
from django.db.models import Q
from api.calendar_models import CalendarDay, CalendarFeast

def load_csv(path):
    with path.open(encoding="utf-8-sig", newline="") as fp:
        records = list(csv.DictReader(fp, delimiter=";"))
    if not records or any(not r.get("id") for r in records):
        raise RuntimeError(f"Missing or empty manifest: {path}")
    return {int(r["id"]): r for r in records}

def linked_ids(year):
    days = CalendarDay.objects.filter(date_gregorian__year=year)
    ids = set(days.values_list("main_feast_id", flat=True))
    ids.update(days.values_list("feasts__id", flat=True))
    ids.discard(None)
    return ids

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--keep", required=True, type=Path)
    parser.add_argument("--review", required=True, type=Path)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if settings.DATABASES["default"]["ENGINE"] != "django.db.backends.sqlite3":
        raise RuntimeError("STOP: local SQLite only")
    db = Path(settings.DATABASES["default"]["NAME"]).resolve()
    if not db.is_file():
        raise RuntimeError(f"STOP: database not found: {db}")
    keep, review = load_csv(args.keep), load_csv(args.review)
    if len(keep) != 3056 or len(review) != 722 or set(keep) & set(review):
        raise RuntimeError("STOP: unexpected snapshot counts/overlap; regenerate audit")
    cards = {c.pk: c for c in CalendarFeast.objects.all().iterator()}
    if set(cards) != set(keep) | set(review):
        raise RuntimeError("STOP: database changed since audit; regenerate snapshot")
    if linked_ids(2026) != set(keep) or not linked_ids(2027) <= set(keep):
        raise RuntimeError("STOP: 2026/2027 links do not match the canonical snapshot")
    if any(str(cards[pk].sync_uid or "") != row["sync_uid"] for pk, row in keep.items()):
        raise RuntimeError("STOP: canonical sync UID mismatch")
    if any(cards[pk].sync_uid or review[pk]["sync_uid"] for pk in review):
        raise RuntimeError("STOP: noncanonical record has sync UID")
    other_years = set(CalendarDay.objects.exclude(date_gregorian__year__in=[2025,2026,2027])
                      .values_list("main_feast_id", flat=True))
    other_years.update(CalendarDay.objects.exclude(date_gregorian__year__in=[2025,2026,2027])
                       .values_list("feasts__id", flat=True))
    other_years.discard(None)
    if other_years & set(review):
        raise RuntimeError("STOP: noncanonical cards linked to years other than 2025")
    old_days = CalendarDay.objects.filter(date_gregorian__year=2025)
    old_main = old_days.filter(main_feast_id__in=review).count()
    through = CalendarDay.feasts.through
    old_links = through.objects.filter(
        calendarday_id__in=old_days.values_list("id", flat=True),
        calendarfeast_id__in=review
    ).count()
    print(f"DB: {db}")
    print(f"KEEP: {len(keep)} | REMOVE: {len(review)} | 2025 main links: {old_main} | 2025 feast links: {old_links}")
    print("All 2026 and 2027 references are protected.")
    if not args.apply:
        print("DRY RUN: no changes. Apply only after checking counts.")
        return
    backup_dir = ROOT / "backups" / "sqlite"
    backup_dir.mkdir(parents=True, exist_ok=True)
    backup = backup_dir / ("before_prune_noncanonical_" + datetime.now().strftime("%Y%m%d_%H%M%S") + ".sqlite3")
    with sqlite3.connect(str(db)) as src, sqlite3.connect(str(backup)) as dst:
        src.backup(dst)
    if backup.stat().st_size < 1024:
        raise RuntimeError("STOP: backup failed")
    print("BACKUP:", backup)
    before_26, before_27 = linked_ids(2026), linked_ids(2027)
    with transaction.atomic():
        # Delete only explicit records from REVIEW_NOT_IN_2026.csv.
        CalendarFeast.objects.filter(pk__in=review).delete()
        if set(CalendarFeast.objects.values_list("pk", flat=True)) != set(keep):
            raise RuntimeError("STOP: remaining set mismatch; rolled back")
        if linked_ids(2026) != before_26 or linked_ids(2027) != before_27:
            raise RuntimeError("STOP: protected year links changed; rolled back")
    print("SUCCESS: removed 722 legacy cards; 3056 canonical cards remain.")
    print("2025 old links cleared; regenerate 2025 separately when ready.")

if __name__ == "__main__":
    main()
