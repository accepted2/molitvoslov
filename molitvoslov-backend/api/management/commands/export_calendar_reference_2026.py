"""Export the real 2026 Django calendar to one portable canonical JSON.
Install: api/management/commands/export_calendar_reference_2026.py
Run: python manage.py export_calendar_reference_2026
Read-only; no external requests. Never merges feast records by similar names.
"""
import json
import re
import unicodedata
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db.models import Prefetch

from api.calendar_models import CalendarDay, CalendarFeast, CalendarReading

YEAR = 2026
FESTIVAL_KEYS = {3542: "theophany"}  # confirmed from user's local 2026 DB


def easter(year):
    a, b, c = year % 4, year % 7, year % 19
    d = (19 * c + 15) % 30
    e = (2 * a + 4 * b - d + 34) % 7
    return date(year, (d + e + 114) // 31, (d + e + 114) % 31 + 1) + timedelta(days=13)


def slug(value):
    value = unicodedata.normalize("NFKC", value or "").lower().replace("ё", "е")
    value = re.sub(r"[^\w]+", "-", value, flags=re.UNICODE).strip("-")
    return value[:75] or "untitled"


def feast_key(f):
    if f.pk in FESTIVAL_KEYS:
        return "feast:" + FESTIVAL_KEYS[f.pk]
    # Stable within DB; source_id (when present) can also link imported systems.
    return f"feast:source-{f.source_id}" if f.source_id is not None else f"feast:local-{f.pk}"


def feast_date_rule(f):
    if f.easter_offset is not None:
        return {"type": "easter_offset", "days": f.easter_offset}
    if f.julian_month and f.julian_day:
        return {"type": "julian_fixed", "month": f.julian_month, "day": f.julian_day}
    return {"type": "unclassified", "note": "Set rule manually before generation"}


class Command(BaseCommand):
    help = "Export canonical 2026 calendar to one JSON without changing the DB"

    def add_arguments(self, parser):
        parser.add_argument("--output", default="calendar_reference_2026.json")

    def handle(self, *args, **options):
        days = list(CalendarDay.objects.filter(date_gregorian__year=YEAR)
                    .select_related("main_feast", "fast_type")
                    .prefetch_related("feasts", "readings")
                    .order_by("date_gregorian"))
        if len(days) != 365 or len({d.date_gregorian for d in days}) != 365:
            raise CommandError(f"2026 must have exactly 365 unique days; found {len(days)}")
        ids = {f.pk for d in days for f in d.feasts.all()}
        ids.update(d.main_feast_id for d in days if d.main_feast_id)
        feasts = list(CalendarFeast.objects.filter(pk__in=ids).order_by("pk"))
        feast_by_id = {f.pk: f for f in feasts}
        keys = [feast_key(f) for f in feasts]
        if len(keys) != len(set(keys)):
            raise CommandError("Non-unique canonical keys; export aborted")
        if 3542 in feast_by_id and not any(d.date_gregorian == date(2026,1,19) and d.main_feast_id == 3542 for d in days):
            raise CommandError("Theophany reference differs from confirmed 2026 baseline; review before export")
        fields = ["title", "short_title", "title_uk", "short_title_uk", "date_type", "celebration_type", "celebration_rank", "icon_url", "troparion_title", "troparion_content", "troparion_title_uk", "troparion_content_uk", "kontakion_title", "kontakion_content", "kontakion_title_uk", "kontakion_content_uk", "life_title", "life_content", "life_title_uk", "life_content_uk", "description", "description_uk", "all_dates"]
        catalog = {}
        for f in feasts:
            key = feast_key(f)
            catalog[key] = {"local_id": f.pk, "source_id": f.source_id,
                            "sync_uid": str(f.sync_uid) if f.sync_uid else None,
                            "slug": slug(f.short_title or f.title),
                            "date_rule": feast_date_rule(f),
                            **{field: getattr(f, field) for field in fields}}
        output_days = {}
        problems = []
        for d in days:
            date_key = d.date_gregorian.isoformat()
            linked_ids = {f.pk for f in d.feasts.all()}
            if d.main_feast_id and d.main_feast_id not in linked_ids:
                problems.append({"date": date_key, "issue": "main_feast_not_in_feasts", "local_id": d.main_feast_id})
            fast = {name: getattr(d, name) for name in ("fast_type_code", "fast_type_title", "fast_name", "fast_description", "fast_type_title_uk", "fast_name_uk", "fast_description_uk")}
            fast["fast_type_ref"] = d.fast_type.code if d.fast_type else None
            source = d.source_payload if isinstance(d.source_payload, dict) else {}
            markers = source.get("azbyka_calendar_markers")
            if isinstance(markers, dict):
                fast["azbyka_markers"] = markers
            readings = [{"kind": r.kind, "label": r.label, "title": r.title, "order": r.order,
                         "sync_uid": str(r.sync_uid) if r.sync_uid else None}
                        for r in sorted(d.readings.all(), key=lambda r: (r.order, r.pk))]
            legacy = {name: getattr(d, name) for name in ("gospel_title", "gospel_reading", "apostolic_title", "apostolic_reading", "gospel_title_uk", "gospel_reading_uk", "apostolic_title_uk", "apostolic_reading_uk")}
            output_days[date_key] = {
                "julian_month": d.julian_month, "julian_day": d.julian_day,
                "main_feast": feast_key(feast_by_id[d.main_feast_id]) if d.main_feast_id else None,
                "feasts": [feast_key(f) for f in sorted(d.feasts.all(), key=lambda f: f.pk)],
                "fast": fast, "readings": readings, "legacy_readings": legacy,
            }
        no_rule = [k for k,f in catalog.items() if f["date_rule"]["type"] == "unclassified"]
        reference = {
            "schema_version": 1, "calendar": "Orthodox Julian (Gregorian civil dates)",
            "reference_year": YEAR, "pascha": easter(YEAR).isoformat(),
            "canonical_identity_rule": "Only IDs explicitly mapped are canonical aliases; names never auto-merge",
            "known_canonical_ids": {"theophany": "feast:theophany"},
            "generation_policy": "Use confirmed date_rule only; never infer movable dates from a single 2026 occurrence",
            "counts": {"days": len(days), "unique_feasts": len(feasts), "missing_date_rules": len(no_rule), "integrity_warnings": len(problems)},
            "feasts": catalog, "days": output_days,
            "unclassified_feasts": no_rule, "integrity_warnings": problems,
        }
        dest = Path(options["output"]).expanduser().resolve()
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(json.dumps(reference, ensure_ascii=False, indent=2, default=str) + "\n", encoding="utf-8")
        self.stdout.write(self.style.SUCCESS(f"Created {dest}: 365 days, {len(feasts)} unique cards, {len(no_rule)} cards without date rules, {len(problems)} integrity warnings"))
        self.stdout.write("READ ONLY: database not changed; 2027 not changed")
