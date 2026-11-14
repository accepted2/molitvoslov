"""Snapshot, plan and safely rebuild 2026 reading rows using the 2025 dedup strategy.

Preparation fetches all 365 dates once and saves a frozen plan with comparison.
Application restores from this plan, not another fetch. Intentional passage
removals need an explicit --accept-removals confirmation.
"""
import csv
import hashlib
import json
import sqlite3
import time
import uuid
from collections import Counter
from datetime import date, timedelta, datetime
from pathlib import Path

import requests
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connections, transaction
from api.azbyka_calendar_readings import fetch_day_readings, AzbykaReadingsError
from api.calendar_models import CalendarDay, CalendarReading
from api.management.commands.import_2025_unique_readings import distinct_readings
from api.management.commands.import_azbyka_calendar_readings import deterministic_azbyka_reading_uid


def snapshot():
    return [
        dict(id=r.pk, date=r.day.date_gregorian.isoformat(), uid=str(r.sync_uid),
             kind=r.kind, label=r.label, title=r.title, order=r.order)
        for r in CalendarReading.objects.filter(day__date_gregorian__year=2026)
        .select_related("day").order_by("day__date_gregorian", "pk")
    ]


def digest(rows):
    return hashlib.sha256(json.dumps(rows, ensure_ascii=False, sort_keys=True).encode("utf8")).hexdigest()


def reading_key(row):
    return row["kind"], row["title"]


def backup_db():
    db = Path(connections["default"].settings_dict["NAME"])
    folder = Path(settings.BASE_DIR) / "backups" / "sqlite"
    folder.mkdir(parents=True, exist_ok=True)
    dst = folder / ("before_rebuild_2026_readings_" + datetime.now().strftime("%Y%m%d_%H%M%S_%f") + ".sqlite3")
    with sqlite3.connect(str(db)) as source, sqlite3.connect(str(dst)) as target:
        source.backup(target)
    return dst


class Command(BaseCommand):
    help = "Prepare read-only Azbyka 2026 comparison, then apply with backup and explicit safeguards."

    def add_arguments(self, parser):
        modes = parser.add_mutually_exclusive_group(required=True)
        modes.add_argument("--prepare", action="store_true")
        modes.add_argument("--apply", action="store_true")
        parser.add_argument("--plan", type=Path, default=None)
        parser.add_argument("--accept-removals", action="store_true")
        parser.add_argument("--delay", type=float, default=0.35)

    def handle(self, *args, **opts):
        if connections["default"].vendor != "sqlite":
            raise CommandError("Local SQLite only")
        if opts["prepare"]:
            return self.prepare(opts)
        return self.apply_plan(opts)

    def prepare(self, opts):
        rows = snapshot()
        if CalendarDay.objects.filter(date_gregorian__year=2026).count() != 365:
            raise CommandError("2026 must contain 365 calendar days.")
        folder = Path(settings.BASE_DIR) / "reports" / ("rebuild_2026_" + datetime.now().strftime("%Y%m%d_%H%M%S_%f"))
        folder.mkdir(parents=True, exist_ok=True)
        existing = {}
        for row in rows:
            existing.setdefault(row["date"], []).append(row)
        planned, report, errors = {}, [], []
        with requests.Session() as session:
            current = date(2026, 1, 1)
            last = date(2026, 12, 31)
            while current <= last:
                ds = current.isoformat()
                try:
                    parsed = fetch_day_readings(current, session=session)
                    unique = distinct_readings(parsed.readings)
                    new = [
                        dict(kind=r.kind, label=r.label, title=r.title, order=r.order)
                        for r in unique
                    ]
                    old = existing.get(ds, [])
                    a, b = set(map(reading_key, old)), set(map(reading_key, new))
                    missing, extra = sorted(a-b), sorted(b-a)
                    planned[ds] = new
                    report.append(dict(date=ds, old_count=len(old), new_count=len(new),
                                       to_remove=json.dumps(missing, ensure_ascii=False),
                                       to_add=json.dumps(extra, ensure_ascii=False),
                                       unchanged_passages=len(a&b),
                                       duplicate_source=len(parsed.readings)-len(unique)))
                except (AzbykaReadingsError, requests.RequestException) as error:
                    errors.append((ds, str(error)))
                if opts["delay"] > 0 and current < last:
                    time.sleep(opts["delay"])
                current += timedelta(days=1)
        csv_path = folder / "diff.csv"
        with csv_path.open("w", encoding="utf-8-sig", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=["date","old_count","new_count","to_remove","to_add","unchanged_passages","duplicate_source"],delimiter=";")
            writer.writeheader()
            writer.writerows(report)
        plan = dict(year=2026, baseline_sha256=digest(rows), old_rows=rows,
                    proposed=planned, errors=errors, generated_at=datetime.now().isoformat())
        path = folder / "plan.json"
        path.write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf8")
        removals = sum(len(json.loads(row["to_remove"])) for row in report)
        additions = sum(len(json.loads(row["to_add"])) for row in report)
        self.stdout.write(f"BASELINE: {len(rows)} existing readings")
        self.stdout.write(f"AZBYKA: {sum(len(x) for x in planned.values())} unique readings across {len(planned)} successful days")
        self.stdout.write(f"PROPOSED: remove {removals} distinct passages, add {additions} distinct passages")
        self.stdout.write(f"SOURCE ERRORS: {len(errors)} " + repr(errors[:6]))
        self.stdout.write(f"PLAN: {path}")
        self.stdout.write(f"DIFF: {csv_path}")
        self.stdout.write("PREPARE ONLY: no database changes. Review diff before applying.")

    def apply_plan(self, opts):
        path = opts["plan"]
        if not path or not path.is_file():
            raise CommandError("Supply --plan path from a successful --prepare")
        plan = json.loads(path.read_text(encoding="utf8"))
        if plan.get("year") != 2026 or plan.get("errors") or len(plan.get("proposed", {})) != 365:
            raise CommandError("Plan has source errors or incomplete dates; no changes.")
        original = snapshot()
        if digest(original) != plan.get("baseline_sha256"):
            raise CommandError("SQLite readings changed since --prepare. Rebuild plan; no changes.")
        old_by_date = {}
        for row in original:
            old_by_date.setdefault(row["date"], []).append(row)
        removable = sum(len(set(map(reading_key, old_by_date.get(ds, []))) - set(map(reading_key, new)))
                        for ds, new in plan["proposed"].items())
        if removable and not opts["accept_removals"]:
            raise CommandError(f"Plan would remove {removable} existing passage assignments. Inspect diff.csv and explicitly use --accept-removals to approve.")
        days = dict(CalendarDay.objects.filter(date_gregorian__year=2026).values_list("date_gregorian", "pk"))
        if len(days) != 365:
            raise CommandError("365 days expected")
        # Preserve old UUID for exact content identity whenever possible.
        prior = {}
        for row in original:
            prior.setdefault((row["date"], row["kind"], row["title"]), row["uid"])
        payload = []
        all_uids = set()
        for ds, readings in sorted(plan["proposed"].items()):
            if date.fromisoformat(ds) not in days or not readings:
                raise CommandError("Incomplete day " + ds)
            for reading in readings:
                k = (ds, reading["kind"], reading["title"])
                uid = prior.get(k)
                if uid is None:
                    obj = type("TempReading", (), reading)()
                    uid = str(deterministic_azbyka_reading_uid(date.fromisoformat(ds), obj))
                if uid in all_uids:
                    raise CommandError("Duplicated UUID in proposal")
                all_uids.add(uid)
                payload.append((ds, reading, uid))
        backup = backup_db()
        self.stdout.write(f"BACKUP: {backup}")
        with transaction.atomic():
            CalendarReading.objects.filter(day__date_gregorian__year=2026).delete()
            CalendarReading.objects.bulk_create([
                CalendarReading(sync_uid=uuid.UUID(uid), day_id=days[date.fromisoformat(ds)],
                                kind=r["kind"], label=r["label"], title=r["title"], order=r["order"])
                for ds, r, uid in payload
            ], batch_size=500)
            for ds, readings in plan["proposed"].items():
                gospel = next((r["title"] for r in readings if r["kind"] == "gospel"), "")
                apostle = next((r["title"] for r in readings if r["kind"] == "apostle"), "")
                CalendarDay.objects.filter(pk=days[date.fromisoformat(ds)]).update(
                    gospel_title=gospel, gospel_title_uk=gospel,
                    apostolic_title=apostle, apostolic_title_uk=apostle)
            if CalendarReading.objects.filter(day__date_gregorian__year=2026).count() != len(payload):
                raise CommandError("Count check failed; rolled back")
        self.stdout.write(f"SUCCESS: 2026 reimported, {len(payload)} unique readings; backup: {backup}")
        self.stdout.write("2025 and 2027 untouched; Supabase untouched.")
