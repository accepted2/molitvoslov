"""Build a safe, read-only calendar preview from Molitvoslov catalog v3.
Usage: python build_calendar_from_json.py --year 2027 --catalog molitvoslov_calendar_database_v3.json
By default ONLY confirmed date rules appear in generated days.
--include-unverified adds candidate dates for review, never for production import.
"""

import argparse
import calendar
import collections
import datetime as dt
import json
from pathlib import Path

WEEKDAYS = {
    x: i
    for i, x in enumerate(
        ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
    )
}


def jdn_to_gregorian(jdn):
    a = jdn + 32044
    b = (4 * a + 3) // 146097
    c = a - (146097 * b) // 4
    d = (4 * c + 3) // 1461
    e = c - (1461 * d) // 4
    m = (5 * e + 2) // 153
    return dt.date(100 * b + d - 4800 + m // 10, m + 3 - 12 * (m // 10), e - (153 * m + 2) // 5 + 1)


def julian_to_gregorian(year, month, day):
    if not (1 <= month <= 12):
        raise ValueError("Invalid Julian month")
    mdays = [31, 29 if year % 4 == 0 else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    if not (1 <= day <= mdays[month - 1]):
        raise ValueError("Invalid Julian day")
    a = (14 - month) // 12
    y = year + 4800 - a
    m = month + 12 * a - 3
    jdn = day + (153 * m + 2) // 5 + 365 * y + y // 4 - 32083
    return jdn_to_gregorian(jdn)


def pascha(year):
    a = year % 4
    b = year % 7
    c = year % 19
    d = (19 * c + 15) % 30
    e = (2 * a + 4 * b - d + 34) % 7
    month = (d + e + 114) // 31
    day = (d + e + 114) % 31 + 1
    return julian_to_gregorian(year, month, day)


def resolve(rule, year, easter):
    t = rule.get("type")
    if t == "julian_fixed":
        # A Julian observance may fall in Jan of civil year from previous Julian year.
        dates = [julian_to_gregorian(y, rule["month"], rule["day"]) for y in (year - 1, year)]
        hits = [d for d in dates if d.year == year]
        if not hits:
            return []
        return hits
    if t == "easter_offset":
        return [easter + dt.timedelta(days=int(rule["days"]))]
    if t in ("weekday_after", "weekday_on_or_after", "nth_weekday_after"):
        anchors = resolve(rule["anchor"], year, easter)
        weekday = WEEKDAYS[rule["weekday"].lower()]
        out = []
        for a in anchors:
            delta = (weekday - a.weekday()) % 7
            if t != "weekday_on_or_after" and delta == 0:
                delta = 7
            if t == "nth_weekday_after":
                delta += 7 * (int(rule["n"]) - 1)
            else:
                delta += 7 * int(rule.get("offset", 0))
            out.append(a + dt.timedelta(days=delta))
        return out
    raise ValueError(f"Unknown rule type {t!r}")


def main():
    ap = argparse.ArgumentParser(
        description="Safe, read-only year preview from Molitvoslov JSON v3"
    )
    ap.add_argument("--year", type=int, required=True)
    ap.add_argument("--catalog", default="molitvoslov_calendar_database_v3.json")
    ap.add_argument("--output", default=None)
    ap.add_argument(
        "--include-unverified",
        action="store_true",
        help="Add UNVERIFIED candidate observances for review only",
    )
    args = ap.parse_args()
    if not 1900 <= args.year <= 2099:
        ap.error("Supported years: 1900–2099")
    catalog = json.loads(Path(args.catalog).read_text(encoding="utf-8-sig"))
    if catalog.get("schema_version") != 3:
        ap.error("Expected schema_version 3")
    easter = pascha(args.year)
    days = {
        dt.date(args.year, 1, 1) + dt.timedelta(days=i): []
        for i in range(366 if calendar.isleap(args.year) else 365)
    }
    skipped = []
    errors = []
    candidates = 0
    confirmed = 0
    for key, feast in catalog["feasts"].items():
        rules = feast.get("date_rules") or [
            {"rule": feast.get("date_rule"), "status": feast.get("date_rule_status", "unknown")}
        ]
        for entry in rules:
            status = entry.get("status", "unknown")
            if status != "confirmed_rule" and not args.include_unverified:
                skipped.append({"key": key, "title": feast.get("title", ""), "status": status})
                continue
            try:
                found = resolve(entry["rule"], args.year, easter)
                if not found:
                    errors.append({"key": key, "error": "No occurrence in civil year"})
                for date in found:
                    if date.year == args.year:
                        record = {
                            "key": key,
                            "title": feast.get("title", ""),
                            "local_id": feast.get("local_id"),
                            "rule_status": status,
                            "icon_url": feast.get("icon_url", ""),
                        }
                        if not any(f["key"] == key for f in days[date]):
                            days[date].append(record)
                        if status == "confirmed_rule":
                            confirmed += 1
                        else:
                            candidates += 1
            except Exception as exc:
                errors.append({"key": key, "error": str(exc)})
    for fs in days.values():
        fs.sort(key=lambda f: (f["rule_status"] != "confirmed_rule", f["title"], f["key"]))
    result = {
        "schema_version": 1,
        "kind": "calendar_year_preview",
        "year": args.year,
        "pascha": str(easter),
        "safety": "READ_ONLY; NOT APPROVED FOR DATABASE IMPORT",
        "include_unverified": args.include_unverified,
        "days": {str(d): fs for d, fs in days.items()},
        "diagnostics": {
            "total_days": len(days),
            "confirmed_occurrences": confirmed,
            "unverified_candidate_occurrences": candidates,
            "unverified_rules_skipped": len(skipped),
            "days_without_observances": sum(not v for v in days.values()),
            "errors": errors,
            "skipped_unverified": skipped,
        },
    }
    dest = Path(args.output or f"calendar_preview_{args.year}.json")
    dest.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Пасха {args.year}: {easter}")
    print(
        f"Дней: {len(days)} | подтверждённых памятей: {confirmed} | непроверенных кандидатов: {candidates}"
    )
    print(
        f'Пропущено неподтверждённых правил: {len(skipped)} | дней без памятей: {result["diagnostics"]["days_without_observances"]} | ошибок: {len(errors)}'
    )
    print(f"Превью: {dest.resolve()}")
    print("База SQLite не изменялась. Главные праздники, посты и чтения этот скрипт не назначает.")


if __name__ == "__main__":
    main()
