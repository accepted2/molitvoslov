#!/usr/bin/env python3
"""Audit canonical 2026 CalendarFeast records and legacy-year references.

Read-only. Never alters CalendarDay, CalendarFeast, or Supabase.
Run: python -X utf8 audit_calendar_canonical.py
"""
import csv
import os
import re
import unicodedata
from collections import defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
import django
django.setup()
from django.db.models import Q
from api.calendar_models import CalendarDay, CalendarFeast


def clean(value):
    value = unicodedata.normalize("NFKC", str(value or "")).casefold().replace("ё", "е")
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", value)).strip()


def rows_to_csv(path, rows, headers):
    with path.open("w", encoding="utf-8-sig", newline="") as fp:
        writer = csv.DictWriter(fp, fieldnames=headers, delimiter=";")
        writer.writeheader()
        writer.writerows(rows)


def main():
    output = ROOT / "reports" / ("calendar_canonical_audit_" + datetime.now().strftime("%Y%m%d_%H%M%S"))
    output.mkdir(parents=True, exist_ok=True)

    by_id = {f.pk: f for f in CalendarFeast.objects.all().iterator()}
    day_dates = defaultdict(set)
    reference_kinds = defaultdict(set)
    main_links = CalendarDay.objects.exclude(main_feast_id=None).values_list("main_feast_id", "date_gregorian")
    for fid, date in main_links.iterator():
        day_dates[fid].add(date)
        reference_kinds[fid].add("main")
    through = CalendarDay.feasts.through
    dates = dict(CalendarDay.objects.values_list("pk", "date_gregorian"))
    for day_id, feast_id in through.objects.values_list("calendarday_id", "calendarfeast_id").iterator():
        day_dates[feast_id].add(dates[day_id])
        reference_kinds[feast_id].add("feasts")

    canonical_ids = {pk for pk, used in day_dates.items() if any(d.year == 2026 for d in used)}
    canonical_2026 = defaultdict(list)
    for pk in canonical_ids:
        f = by_id[pk]
        canonical_2026[clean(f.title)].append(f)

    inventory = []
    proposals = []
    for pk, f in sorted(by_id.items()):
        years = sorted({d.year for d in day_dates[pk]})
        linked_2026 = 2026 in years
        legacy = bool(f.source_id is not None and f.sync_uid is None)
        alternatives = [c for c in canonical_2026[clean(f.title)] if c.pk != pk]
        matching = alternatives if legacy and not linked_2026 else []
        if matching:
            status = "unique_title_candidate" if len(matching) == 1 else "ambiguous_multiple_candidates"
            proposals.append({
                "old_id": pk, "old_title": f.title, "old_source_id": f.source_id,
                "old_years": ",".join(map(str, years)),
                "candidate_ids": ",".join(str(x.pk) for x in matching),
                "candidate_sync_uids": ",".join(str(x.sync_uid or "") for x in matching),
                "status": status, "notice": "REVIEW ONLY: matching title does not prove identical feast",
            })
        inventory.append({
            "id": pk, "title": f.title, "source_id": f.source_id or "",
            "sync_uid": str(f.sync_uid or ""), "years": ",".join(map(str, years)),
            "dates": ",".join(d.isoformat() for d in sorted(day_dates[pk])),
            "reference_kinds": ",".join(sorted(reference_kinds[pk])),
            "linked_2026": linked_2026, "legacy_origin_candidate": legacy,
            "life_length": len(f.life_content or ""), "icon": bool(f.icon_url),
            "troparion_length": len(f.troparion_content or ""),
            "kontakion_length": len(f.kontakion_content or ""),
            "candidate_2026_ids": ",".join(str(x.pk) for x in matching),
        })
    rows_to_csv(output / "all_cards.csv", inventory, list(inventory[0]) if inventory else [
        "id", "title", "source_id", "sync_uid", "years", "dates", "reference_kinds",
        "linked_2026", "legacy_origin_candidate", "life_length", "icon",
        "troparion_length", "kontakion_length", "candidate_2026_ids"])
    rows_to_csv(output / "possible_legacy_duplicates.csv", proposals, list(proposals[0]) if proposals else [
        "old_id", "old_title", "old_source_id", "old_years", "candidate_ids",
        "candidate_sync_uids", "status", "notice"])
    print("READ ONLY — никакие карточки, связи и даты не изменены.")
    print("Карточек всего:", len(by_id))
    print("Используются в календаре 2026:", len(canonical_ids))
    print("Карточек 2026 без sync_uid:", sum(not by_id[pk].sync_uid for pk in canonical_ids))
    print("Непривязанных карточек:", sum(not dates_ for dates_ in day_dates.values()) + sum(pk not in day_dates for pk in by_id))
    print("Старые кандидаты с совпадающим названием в 2026:", len(proposals))
    print("Сводка:", output)


if __name__ == "__main__":
    main()
