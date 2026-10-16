#!/usr/bin/env python3
"""Generate civil-year Orthodox observance calendar from the permanent catalog.
No Django or DB writes. Uses every valid date rule regardless of provenance/status.
"""
import argparse
import calendar
import json
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

WEEKDAYS = {
    "monday": 0,
    "tuesday": 1,
    "wednesday": 2,
    "thursday": 3,
    "friday": 4,
    "saturday": 5,
    "sunday": 6,
}


def julian_to_gregorian(y, m, d):
    if not 1 <= m <= 12 or not 1 <= d <= 31:
        raise ValueError("invalid Julian month/day")
    a = (14 - m) // 12
    yy = y + 4800 - a
    mm = m + 12 * a - 3
    jdn = d + (153 * mm + 2) // 5 + 365 * yy + yy // 4 - 32083
    value = date.fromordinal(jdn - 1721425)
    # Check round trip to reject nonexistent days, e.g. Apr 31
    if gregorian_to_julian(value) != (y, m, d):
        raise ValueError("nonexistent Julian calendar day")
    return value


def gregorian_to_julian(value):
    jdn = value.toordinal() + 1721425
    c = jdn + 32082
    d = (4 * c + 3) // 1461
    e = c - 1461 * d // 4
    m = (5 * e + 2) // 153
    day = e - (153 * m + 2) // 5 + 1
    month = m + 3 - 12 * (m // 10)
    year = d - 4800 + m // 10
    return year, month, day


def pascha(year):
    a = year % 4
    b = year % 7
    c = year % 19
    d = (19 * c + 15) % 30
    e = (2 * a + 4 * b - d + 34) % 7
    month = (d + e + 114) // 31
    day = (d + e + 114) % 31 + 1
    return julian_to_gregorian(year, month, day)


def resolve(rule, julian_year, depth=0):
    if depth > 12:
        raise ValueError("rule recursion too deep")
    t = rule["type"]
    if t == "julian_fixed":
        return julian_to_gregorian(julian_year, int(rule["month"]), int(rule["day"]))
    if t == "easter_offset":
        return pascha(julian_year) + timedelta(days=int(rule["days"]))
    if t in (
        "weekday_after",
        "weekday_on_or_after",
        "nth_weekday_after",
        "weekday_before",
        "weekday_on_or_before",
    ):
        anchor = resolve(rule["anchor"], julian_year, depth + 1)
        target = WEEKDAYS[str(rule["weekday"]).lower()]
        if t in ("weekday_after", "nth_weekday_after"):
            delta = (target - anchor.weekday()) % 7
            if delta == 0:
                delta = 7
            n = (
                int(rule.get("n", rule.get("offset", 1)))
                if t == "nth_weekday_after"
                else int(rule.get("offset", 0)) + 1
            )
            if n < 1:
                raise ValueError("n must be >=1")
            return anchor + timedelta(days=delta + 7 * (n - 1))
        if t == "weekday_on_or_after":
            return anchor + timedelta(
                days=(target - anchor.weekday()) % 7 + 7 * int(rule.get("offset", 0))
            )
        if t == "weekday_before":
            return anchor - timedelta(
                days=((anchor.weekday() - target - 1) % 7) + 1 + 7 * int(rule.get("offset", 0))
            )
        return anchor - timedelta(
            days=(anchor.weekday() - target) % 7 + 7 * int(rule.get("offset", 0))
        )
    raise ValueError(f"unsupported date rule: {t}")


def fasting(day):
    year = day.year
    eastern = pascha(year)
    prev = pascha(year - 1)

    def j(month, dd, yy=year):
        return julian_to_gregorian(yy, month, dd)

    periods = []
    for p in (prev, eastern):
        if p - timedelta(days=48) <= day <= p - timedelta(days=1):
            periods.append("Великий пост / Страстная седмица")
        start = p + timedelta(days=57)
        ending = j(6, 28, p.year if p.year == year else year - 1)
        if start <= ending and start <= day <= ending:
            periods.append("Петров пост")
    if j(8, 1) <= day <= j(8, 14):
        periods.append("Успенский пост")
    if j(11, 15, year - 1) <= day <= j(12, 24, year - 1) or j(11, 15) <= day <= j(12, 24):
        periods.append("Рождественский пост")
    one_day = {
        j(1, 5): "Крещенский сочельник",
        j(8, 29): "Усекновение главы Иоанна Предтечи",
        j(9, 14): "Воздвижение Креста Господня",
    }
    if day in one_day:
        periods.append(one_day[day])
    solid = False
    # Святки: 7-17 January (modern civil dates, calculated from Julian Dec25 - Jan4)
    if j(12, 25, year - 1) <= day <= j(1, 4):
        solid = True
    # Мытаря и фарисея: Monday-Sunday immediately following its Sunday (P-70)
    if eastern - timedelta(days=69) <= day <= eastern - timedelta(days=63):
        solid = True
    # Сырная: meat-free all week, not equivalent to unrestricted food
    cheese = eastern - timedelta(days=55) <= day <= eastern - timedelta(days=49)
    if cheese:
        solid = True
    if eastern <= day <= eastern + timedelta(days=6):
        solid = True
    if eastern + timedelta(days=50) <= day <= eastern + timedelta(days=56):
        solid = True
    weekly = (day.weekday() in (2, 4)) and not solid
    if weekly and not periods:
        periods.append("Среда/пятница")
    return {
        "periods": periods,
        "weekly_fast": weekly,
        "solid_week": solid,
        "cheese_week": cheese,
        "dietary_severity": None,
        "note": "Уставная степень пищи не рассчитана; праздничные разрешения и исключения требуют отдельных правил",
    }


def generate(db, year):
    if not (1900 <= year <= 2098):
        raise ValueError("Supported civil years: 1900-2098")
    feasts = db["feasts"]
    start = date(year, 1, 1)
    end = date(year, 12, 31)
    days = {
        str(start + timedelta(days=i)): {
            "date": str(start + timedelta(days=i)),
            "julian_date": "%04d-%02d-%02d" % gregorian_to_julian(start + timedelta(days=i)),
            "feasts": [],
            "main_feast": None,
            "fast": fasting(start + timedelta(days=i)),
            "readings": None,
        }
        for i in range((end - start).days + 1)
    }
    errors = []
    observed = 0
    for key, f in feasts.items():
        rules = f.get("date_rules") or [{"rule": f.get("date_rule"), "observance": "primary"}]
        for entry in rules:
            rule = entry.get("rule") if isinstance(entry, dict) else None
            if not rule:
                errors.append({"key": key, "error": "missing date rule"})
                continue
            for jy in (year - 1, year, year + 1):
                try:
                    when = resolve(rule, jy)
                except Exception as exc:
                    errors.append({"key": key, "julian_year": jy, "error": str(exc)})
                    continue
                if not start <= when <= end:
                    continue
                record = {
                    "key": key,
                    "title": f.get("title", ""),
                    "local_id": f.get("local_id"),
                    "celebration_type": f.get("celebration_type", ""),
                    "celebration_rank": f.get("celebration_rank", ""),
                    "observance": entry.get("observance", "primary"),
                    "icon_url": f.get("icon_url", ""),
                }
                if not any(
                    x["key"] == key and x["observance"] == record["observance"]
                    for x in days[str(when)]["feasts"]
                ):
                    days[str(when)]["feasts"].append(record)
                    observed += 1
    for day in days.values():
        day["feasts"].sort(
            key=lambda r: (
                0 if r["key"] == "feast:theophany" or r["celebration_type"] == "great" else 1,
                r["title"],
            )
        )
        great = [r for r in day["feasts"] if r["celebration_type"] == "great"]
        if len(great) == 1:
            day["main_feast"] = great[0]["key"]
    return {
        "schema_version": 1,
        "kind": "orthodox_calendar_year",
        "year": year,
        "pascha": str(pascha(year)),
        "catalog_kind": db.get("kind"),
        "days": days,
        "diagnostics": {
            "catalog_cards": len(feasts),
            "occurrences": observed,
            "days": len(days),
            "days_without_feasts": sum(not x["feasts"] for x in days.values()),
            "rule_errors": errors,
            "readings": "not implemented",
            "fasting_degrees": "not implemented",
            "main_feast": "only uniquely identified great feast is assigned",
        },
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, required=True)
    ap.add_argument("--database", default="molitvoslov_calendar_database_v6_REVIEWED.json")
    ap.add_argument("--output")
    a = ap.parse_args()
    db = json.loads(Path(a.database).read_text(encoding="utf-8"))
    obj = generate(db, a.year)
    out = Path(a.output or f"calendar_{a.year}.json")
    out.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"{out}: days={len(obj['days'])}, occurrences={obj['diagnostics']['occurrences']}, empty_days={obj['diagnostics']['days_without_feasts']}, errors={len(obj['diagnostics']['rule_errors'])}, pascha={obj['pascha']}"
    )
    print("SQLite unchanged. Scripture readings and detailed dietary grades are not generated.")


if __name__ == "__main__":
    main()
