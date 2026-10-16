"""Curated date-rule overlays over calendar_engine_v2.

Only apply corrections independently confirmed against church calendars. This
module NEVER modifies the source 2026 CalendarDay or CalendarFeast objects.
"""

from __future__ import annotations

from datetime import timedelta

from api.calendar_engine_v2 import (
    REFERENCE_YEAR,
    DateRule,
    Memorial,
    calculate_fasting,
    julian_month_day,
    normalize,
    orthodox_pascha,
    pick_main,
    resolve_readings,
    rule_target,
    year_days,
    classify,
)

# Confirmed: Friday of Bright Week (+5), and 3rd Sunday after Pentecost (+70).
# These titles lacked explicit 'movable' labels in our 2026 card data.
CURATED_PASCHAL_RULES = (
    ("икона богородицы живоносный источник", 5, "Пятница Светлой седмицы"),
    ("собор вологодских святых", 70, "Третье воскресенье по Пятидесятнице"),
    ("собор новгородских святых", 70, "Третье воскресенье по Пятидесятнице"),
    ("собор белорусских святых", 70, "Третье воскресенье по Пятидесятнице"),
    ("собор псковских святых", 70, "Третье воскресенье по Пятидесятнице"),
)


def classify_v3(memory: Memorial) -> DateRule:
    title = normalize(memory.title)
    for label, offset, reason in CURATED_PASCHAL_RULES:
        if title == label:
            # Only activate if curated reference day itself confirms the rule.
            # Unexpected stored cards remain reviewable rather than moved blindly.
            if memory.source_date == orthodox_pascha(REFERENCE_YEAR) + timedelta(days=offset):
                return DateRule(
                    memory.id,
                    "pascha",
                    memory.source_date,
                    offset,
                    "Проверено по церковному календарю: " + reason,
                    memory.is_reference_main,
                    memory.title,
                )
    return classify(memory)


def build_schedule_v3(memories, year):
    """Link (day, feast PK) with curated overlays. Same signature as v2."""
    if year < REFERENCE_YEAR:
        raise ValueError("2026 и ранние годы не генерируются")
    schedule = {d: [] for d in year_days(year)}
    special = []
    seen = set()
    for memory in memories:
        if (memory.source_date, memory.id) in seen:
            continue
        seen.add((memory.source_date, memory.id))
        rule = classify_v3(memory)
        target = rule_target(rule, year)
        if target is None:
            special.append(rule)
        elif target in schedule and not any(x.feast_id == rule.feast_id for x in schedule[target]):
            schedule[target].append(rule)
    return schedule, special
