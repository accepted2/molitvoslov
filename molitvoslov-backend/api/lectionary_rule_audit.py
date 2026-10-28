"""Conservative calendar-reading rule discovery from verified year observations.

No guessed reading is ever considered approved. This module never touches a database.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date
from .management.commands.generate_calendar_year import pascha


def reading_signature(items):
    """Compare exact ordered reading assignments, including labels and services."""
    return tuple(
        (str(item.get("kind") or ""), str(item.get("label") or ""),
         str(item.get("title") or ""), int(item.get("order") or 0))
        for item in sorted(items, key=lambda x: (int(x.get("order") or 0),
                                                 str(x.get("kind") or ""),
                                                 str(x.get("title") or "")))
    )


def day_rule_keys(day):
    """Potential keys, not proof that a reading is governed by either rule."""
    if isinstance(day, str):
        day = date.fromisoformat(day)
    return (
        ("pascha_offset", (day - pascha(day.year)).days),
        ("julian_fixed", (day.month, day.day)),
    )


def audit_observations(years):
    """Report evidence and conflicting assignments without inventing rules.

    years: mapping int -> mapping ISO date -> list of reading dictionaries.
    A candidate is repeatable only when >=2 distinct years agree exactly.
    """
    observations = defaultdict(list)
    totals = {}
    for year, days in sorted(years.items()):
        totals[str(year)] = {
            "days": len(days),
            "days_with_readings": sum(bool(items) for items in days.values()),
            "reading_assignments": sum(len(items) for items in days.values()),
        }
        for day_iso, readings in days.items():
            d = date.fromisoformat(day_iso)
            if d.year != int(year):
                raise ValueError(f"Date {day_iso} outside {year}")
            if not readings:
                continue
            signature = reading_signature(readings)
            for key in day_rule_keys(d):
                observations[key].append((int(year), day_iso, signature))

    repeated = []
    collisions = []
    for key, rows in sorted(observations.items(), key=lambda item: str(item[0])):
        years_present = {year for year, _, _ in rows}
        if len(years_present) < 2:
            continue
        signatures = {signature for _, _, signature in rows}
        record = {
            "rule_kind": key[0],
            "rule_value": key[1],
            "years": sorted(years_present),
            "dates": [day for _, day, _ in rows],
            "distinct_assignments": len(signatures),
        }
        (repeated if len(signatures) == 1 else collisions).append(record)
    return {
        "status": "DIAGNOSTIC_ONLY_NOT_APPROVED_FOR_IMPORT",
        "years": totals,
        "repeated_matching_rule_slots": repeated,
        "conflicting_rule_slots": collisions,
        "warnings": [
            "Matching slots are observations, not verified Typikon rules.",
            "Fixed dates here use Gregorian month/day; Julian-date normalization requires a separate rubric pass.",
            "Luke transition, skips, transfers, fixed-feast and service precedence are NOT implemented.",
        ],
    }
