"""Read-only, diagnostic-first annual lectionary candidate builder.

The 2026 CalendarReading data is an observation, not a complete Typikon.
No database code lives here; never mark inferred assignments verified.
"""
from __future__ import annotations
import calendar
from collections import defaultdict
from datetime import date, timedelta


def orthodox_pascha(year: int) -> date:
    if not 1902 <= year <= 2097:
        raise ValueError("Supported years: 1902..2097")
    a, b, c = year % 4, year % 7, year % 19
    d = (19 * c + 15) % 30
    e = (2 * a + 4 * b - d + 34) % 7
    month = (d + e + 114) // 31
    day = (d + e + 114) % 31 + 1
    return date(year, month, day) + timedelta(days=13)


def dates_of(year: int):
    first = date(year, 1, 1)
    for offset in range(366 if calendar.isleap(year) else 365):
        yield first + timedelta(days=offset)


def liturgical_slot(day: date):
    """Candidate source slot only, not a complete liturgical rubric."""
    current = orthodox_pascha(day.year)
    if day < current:
        previous, following = orthodox_pascha(day.year - 1), current
    else:
        previous, following = current, orthodox_pascha(day.year + 1)
    after = (day - previous).days
    before = (day - following).days
    if -70 <= before < 0:
        return ("triodion", before, day.weekday())
    if 0 <= after <= 49:
        return ("pentecostarion", after, day.weekday())
    # Luke transition, winter jumps and feast collisions NOT implemented.
    return ("after_pentecost_unverified", (after - 50) // 7, day.weekday())


def build_preview(year: int, source_readings: list[dict]):
    if not 1902 <= year <= 2097:
        raise ValueError("Unsupported year")
    indexes = defaultdict(list)
    observed = defaultdict(list)
    for row in source_readings:
        source_day = date.fromisoformat(str(row["date"]))
        if source_day.year != 2026:
            continue
        kind = str(row.get("kind", ""))
        if kind not in ("gospel", "apostle", "old_testament"):
            continue
        item = {k: row.get(k) for k in ("kind", "label", "title", "order")}
        if not item["title"]:
            continue
        observed[str(source_day)].append(item)
        indexes[(*liturgical_slot(source_day), kind)].append(item)

    days = {}
    totals = {"source_replay": 0, "unverified_candidates": 0, "days_without_readings": 0}
    for current in dates_of(year):
        key = str(current)
        assigned = []
        diagnostics = []
        if year == 2026:
            assigned = [dict(r, confidence="observed_reference") for r in observed.get(key, [])]
            totals["source_replay"] += len(assigned)
        elif current == orthodox_pascha(year):
            assigned = [
                dict(kind="apostle", label="", title="Деян.1:1–8 (зач. 1)", order=10,
                     confidence="verified_rule", service="liturgy"),
                dict(kind="gospel", label="", title="Ин.1:1–17 (зач. 1)", order=20,
                     confidence="verified_rule", service="liturgy"),
                dict(kind="gospel", label="На веч.", title="Ин.20:19–25 (зач. 65)", order=30,
                     confidence="verified_rule", service="vespers"),
            ]
            diagnostics.append("ADDITIONAL_PASCHAL_SERVICES_NOT_AUDITED")
        else:
            slot = liturgical_slot(current)
            for kind in ("apostle", "gospel"):
                possibilities = indexes.get((*slot, kind), [])
                if len(possibilities) == 1:
                    assigned.append(dict(possibilities[0], confidence="unverified_candidate"))
                    totals["unverified_candidates"] += 1
                else:
                    diagnostics.append(f"UNRESOLVED_{kind.upper()}_SLOT")
            diagnostics.append("FULL_TYPIKON_AND_FEAST_COLLISIONS_NOT_IMPLEMENTED")
        if not assigned:
            totals["days_without_readings"] += 1
        days[key] = {
            "date": key, "readings": assigned,
            "diagnostics": diagnostics, "review_status": "requires_review",
        }
    return {
        "schema_version": 1,
        "kind": "molitvoslov_lectionary_year_candidate",
        "year": year,
        "pascha": str(orthodox_pascha(year)),
        "status": "PREVIEW_UNVERIFIED_READ_ONLY",
        "approved_for_database_import": False,
        "summary": {"total_days": len(days), **totals},
        "days": days,
    }
