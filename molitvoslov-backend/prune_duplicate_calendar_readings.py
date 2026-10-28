"""Safely remove excess per-day reading records using a saved Azbyka comparison.

Read-only by default. Accepts reports from verify_2027_readings (old/new formats).
Never deletes an occurrence unless the source contains that same passage and
the SQLite multiplicity exceeds the source multiplicity. Ambiguous days skipped.
"""
import argparse
import ast
import csv
import json
import os
import sqlite3
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
import django
django.setup()
from django.conf import settings
from django.db import connections, transaction
from api.calendar_models import CalendarDay, CalendarReading


def parse_items(value):
    if not value:
        return []
    try:
        rows = json.loads(value)
    except (ValueError, TypeError):
        rows = ast.literal_eval(value)
    if not isinstance(rows, (list, tuple)):
        raise ValueError("Invalid reading sequence")
    for row in rows:
        if len(row) != 4:
            raise ValueError("Expected kind/label/title/order tuples")
    return [tuple(row) for row in rows]


def key_of(obj):
    return (obj.kind, obj.title)


def audit(report, year):
    rows = list(csv.DictReader(report.open(encoding="utf-8-sig", newline=""), delimiter=";"))
    dates = set()
    proposed, skipped, analyzed = [], Counter(), 0
    for row in rows:
        ds = row["date"]
        if ds in dates:
            raise ValueError("Duplicate day in report: " + ds)
        dates.add(ds)
        if not ds.startswith(str(year) + "-"):
            raise ValueError("Wrong year in report: " + ds)
        status = row["status"]
        if status in {"SOURCE_ERROR", "UNEXPECTED_ERROR", "MISSING_DAY"}:
            skipped[status] += 1
            continue
        if status in {"EXACT_MATCH"}:
            analyzed += 1
            continue
        if status not in {"DIFFERENT", "PASSAGE_DIFFERENCE", "DUPLICATE_COUNT_DIFFERENCE", "LABEL_OR_ORDER_DIFFERENCE"}:
            raise ValueError("Unexpected report status " + status)
        expected = parse_items(row.get("source") or row.get("source_or_error"))
        if not expected:
            skipped["EMPTY_SOURCE"] += 1
            continue
        day = CalendarDay.objects.filter(date_gregorian=ds).first()
        if not day:
            skipped["NO_DAY"] += 1
            continue
        stored = list(day.readings.all().order_by("pk"))
        source_counts = Counter((r[0], r[2]) for r in expected)
        stored_counts = Counter(key_of(r) for r in stored)
        # Source and stored must share exactly the same passage identities.
        # A day with parser errors, omitted readings, etc. is NEVER changed.
        if set(source_counts) != set(stored_counts):
            skipped["PASSAGE_MISMATCH"] += 1
            continue
        if any(stored_counts[k] < n for k, n in source_counts.items()):
            skipped["SOURCE_HAS_MORE"] += 1
            continue
        keep_ids = set()
        for k, needed in source_counts.items():
            candidates = [r for r in stored if key_of(r) == k]
            source_labels = {r[1] for r in expected if (r[0], r[2]) == k}
            candidates.sort(key=lambda r: (r.label not in source_labels, r.order, r.pk))
            keep_ids.update(r.pk for r in candidates[:needed])
        excess = [r for r in stored if r.pk not in keep_ids]
        if excess:
            proposed.extend((ds, r.pk, r.kind, r.label, r.title) for r in excess)
        analyzed += 1
    return proposed, skipped, analyzed, len(rows)


def backup_sqlite():
    db = connections["default"]
    if db.vendor != "sqlite":
        raise ValueError("Only local SQLite is supported")
    src = Path(db.settings_dict["NAME"])
    dst_dir = Path(settings.BASE_DIR) / "backups" / "sqlite"
    dst_dir.mkdir(parents=True, exist_ok=True)
    dst = dst_dir / ("before_prune_duplicate_readings_" + datetime.now().strftime("%Y%m%d_%H%M%S_%f") + ".sqlite3")
    with sqlite3.connect(str(src)) as a, sqlite3.connect(str(dst)) as b:
        a.backup(b)
    return dst


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", type=int, default=2027)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if connections["default"].vendor != "sqlite":
        parser.error("Only local SQLite is supported")
    proposal, skipped, analyzed, report_rows = audit(args.report, args.year)
    print(f"REPORT: {args.report} | rows: {report_rows} | analyzed: {analyzed}")
    print(f"REMOVE proposed: {len(proposal)} | affected days: {len(set(x[0] for x in proposal))}")
    print("SKIPPED:", dict(skipped))
    print("Examples:", proposal[:8])
    if not args.apply:
        print("DRY RUN: no database changes. Run --apply after reviewing.")
        return
    if not proposal:
        print("NOTHING TO DELETE")
        return
    path = backup_sqlite()
    print("BACKUP:", path)
    ids = [r[1] for r in proposal]
    with transaction.atomic():
        current = {r.pk: r for r in CalendarReading.objects.filter(pk__in=ids)}
        if len(current) != len(ids):
            raise ValueError("DB changed since audit, aborted")
        for ds, pk, kind, label, title in proposal:
            r = current[pk]
            if r.day.date_gregorian.isoformat() != ds or (r.kind, r.label, r.title) != (kind, label, title):
                raise ValueError("Reading changed since audit, aborted")
        deleted, _ = CalendarReading.objects.filter(pk__in=ids).delete()
        if deleted != len(ids):
            raise ValueError(f"Unexpected delete count {deleted}, rolled back")
    print(f"SUCCESS: deleted {deleted} excess readings; source-ambiguous days untouched.")


if __name__ == "__main__":
    main()
