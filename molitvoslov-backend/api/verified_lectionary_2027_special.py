"""Explicitly sourced Scripture readings for five 2027 Great Canon dates.

Azbyka day pages currently show "Великий канон Андрея Критского" in the
Scripture reading section instead of parseable Bible references.
Orthocal's *Slavic / Julian* day pages specify the three Scripture
appointments (6th Hour / Vespers) for each date. These are not guessed.

Only used as a fallback if the Azbyka page specifically lacks Bible
references; newly published Azbyka Scripture appointments take priority.
"""
from datetime import date

from api.calendar_reading_identity import readings_to_add


# Source: https://orthocal.info/readings/slavic/julian/2027/M/D/
# Format: (rubric, Bible reference). All three are OT per day.
VERIFIED_SPECIAL_2027 = {
    date(2027, 3, 15): (
        ("На 6-м часе", "Ис.1:1–20"),
        ("На веч.", "Быт.1:1–13"),
        ("На веч.", "Притч.1:1–20"),
    ),
    date(2027, 3, 16): (
        ("На 6-м часе", "Ис.1:19–2:3"),
        ("На веч.", "Быт.1:14–23"),
        ("На веч.", "Притч.1:20–33"),
    ),
    date(2027, 3, 17): (
        ("На 6-м часе", "Ис.2:3–11"),
        ("На веч.", "Быт.1:24–2:3"),
        ("На веч.", "Притч.2:1–22"),
    ),
    date(2027, 3, 18): (
        ("На 6-м часе", "Ис.2:11–21"),
        ("На веч.", "Быт.2:4–19"),
        ("На веч.", "Притч.3:1–18"),
    ),
    date(2027, 4, 14): (
        ("На 6-м часе", "Ис.41:4–14"),
        ("На веч.", "Быт.17:1–9"),
        ("На веч.", "Притч.15:20–16:9"),
    ),
}


def get_verified_special_readings(day):
    """Return source URL and regular ParsedReading records for a known day."""
    rows = VERIFIED_SPECIAL_2027.get(day)
    if not rows:
        return None

    # Local import avoids cyclic dependency (azbyka -> special -> azbyka).
    from api.azbyka_calendar_readings import ParsedReading

    source = (
        f"https://orthocal.info/readings/slavic/julian/"
        f"{day.year}/{day.month}/{day.day}/"
    )
    readings = tuple(
        ParsedReading(
            kind="old_testament",
            label=label,
            title=title,
            order=(index + 1) * 10,
        )
        for index, (label, title) in enumerate(rows)
    )
    # Ensure the fallback cannot accidentally contain duplicated appointments.
    if readings_to_add([], readings) != list(readings):
        raise ValueError(f"Duplicate fallback readings for {day}")
    return source, readings
