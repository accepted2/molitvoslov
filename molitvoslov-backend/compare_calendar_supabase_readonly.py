"""Read-only comparison of local SQLite and remote Supabase calendar.

Uses same connection configuration as sync_calendar_to_supabase. Never writes.
"""
import os
import csv
import argparse
from pathlib import Path
from collections import Counter

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
import django
django.setup()

from django.db import connections
from api.calendar_models import CalendarDay, CalendarReading, CalendarFeast
from api.management.commands.sync_calendar_to_supabase import Command as SyncCommand, REMOTE_ALIAS


def readings(alias, year):
    rows = CalendarReading.objects.using(alias).filter(
        day__date_gregorian__year=year
    ).values_list("day__date_gregorian", "kind", "title", "label", "sync_uid")
    passages = {}
    detailed = {}
    for dt, kind, title, label, uid in rows.iterator():
        key = dt.isoformat()
        passages.setdefault(key, Counter())[(kind, title)] += 1
        detailed.setdefault(key, []).append((kind, title, label, str(uid)))
    return passages, detailed


def feast_stats(alias):
    q = CalendarFeast.objects.using(alias)
    return q.count(), q.filter(sync_uid__isnull=True).count()


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--year", type=int, default=2027)
    p.add_argument("--output", default="reports/supabase_calendar_comparison_2027.csv")
    args = p.parse_args()
    if connections["default"].vendor != "sqlite":
        p.error("Local source must be SQLite")
    cmd = SyncCommand()
    cmd._configure_supabase_connection()
    cmd._check_remote()
    local, loc_details = readings("default", args.year)
    remote, rem_details = readings(REMOTE_ALIAS, args.year)
    local_dates = set(CalendarDay.objects.using("default").filter(date_gregorian__year=args.year).values_list("date_gregorian", flat=True))
    remote_dates = set(CalendarDay.objects.using(REMOTE_ALIAS).filter(date_gregorian__year=args.year).values_list("date_gregorian", flat=True))
    rows = []
    all_dates = sorted(local_dates | remote_dates)
    for day in all_dates:
        ds = day.isoformat()
        a, b = local.get(ds, Counter()), remote.get(ds, Counter())
        if day not in local_dates: status = "LOCAL_DAY_MISSING"
        elif day not in remote_dates: status = "REMOTE_DAY_MISSING"
        elif a == b: status = "SAME_PASSAGE_COUNTS"
        elif set(a) == set(b): status = "DUPLICATE_COUNT_DIFFERENCE"
        else: status = "PASSAGE_DIFFERENCE"
        label_diff = status == "SAME_PASSAGE_COUNTS" and sorted((x[0], x[1], x[2]) for x in loc_details.get(ds, [])) != sorted((x[0], x[1], x[2]) for x in rem_details.get(ds, []))
        rows.append(dict(date=ds, status=status, labels_differ=label_diff,
                         local_readings=sum(a.values()), remote_readings=sum(b.values()),
                         missing_remote=repr(list((a-b).elements())),
                         extra_remote=repr(list((b-a).elements()))))
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8-sig", newline="") as fp:
        writer = csv.DictWriter(fp, fieldnames=list(rows[0].keys()) if rows else ["date","status","labels_differ","local_readings","remote_readings","missing_remote","extra_remote"], delimiter=";")
        writer.writeheader()
        writer.writerows(rows)
    print("YEAR:", args.year)
    print("Local calendar days:",len(local_dates),"Remote calendar days:",len(remote_dates))
    print("Local readings:",sum(map(sum, (c.values() for c in local.values()))))
    print("Remote readings:",sum(map(sum, (c.values() for c in remote.values()))))
    print("Daily comparison:",dict(Counter(r["status"] for r in rows)))
    print("Label differences on matched days:",sum(1 for r in rows if r["labels_differ"]))
    print("Canonical cards (all years) local/remote:",feast_stats("default"),feast_stats(REMOTE_ALIAS))
    print("CSV:",out)
    print("READ ONLY: Supabase and SQLite were not modified.")


if __name__ == "__main__":
    main()
