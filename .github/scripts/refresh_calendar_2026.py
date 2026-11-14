#!/usr/bin/env python3
"""Refresh the complete 2026 RU/UK bundled calendar from the deployed API.

Run from repository root:
    py .github/scripts/refresh_calendar_2026.py --api https://molitvoslov-3o9d.onrender.com

This script never rewrites the existing bundle unless ALL 24 month requests
validate successfully. Commit the resulting data and rebuilt assets separately.
"""
import argparse
import json
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TARGET = ROOT / "molitvoslov-app" / "src" / "data" / "calendar_2026.json"
YEAR = 2026

def download(url):
    request = urllib.request.Request(url, headers={"User-Agent": "MolitvoslovCalendarRefresh/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", required=True, help="Backend API origin (not the Supabase dashboard URL)")
    args = parser.parse_args()
    base = args.api.rstrip("/")
    days = {}
    for month in range(1, 13):
        for lang in ("ru", "uk"):
            url = f"{base}/api/calendar/month/?year={YEAR}&month={month}&lang={lang}"
            result = download(url)
            entries = result.get("days")
            if not isinstance(entries, list):
                raise RuntimeError(f"{url}: expected days array")
            expected = (date(YEAR + (month == 12), month % 12 + 1, 1) - date(YEAR, month, 1)).days
            if len(entries) != expected:
                raise RuntimeError(f"{url}: expected {expected} days, got {len(entries)}")
            seen = set()
            for day in entries:
                key = day.get("date_gregorian")
                if not key or not key.startswith(f"{YEAR}-{month:02d}-") or key in seen:
                    raise RuntimeError(f"{url}: invalid / duplicate date {key!r}")
                seen.add(key)
                if not isinstance(day.get("all_feasts"), list):
                    raise RuntimeError(f"{url}: missing all_feasts for {key}")
                if not isinstance(day.get("readings"), list):
                    raise RuntimeError(f"{url}: missing readings for {key}")
                days.setdefault(key, {})[lang] = day
            print(f"{YEAR}-{month:02d} {lang}: {len(entries)} days")
    if len(days) != 365 or any(set(x) != {"ru", "uk"} for x in days.values()):
        raise RuntimeError("Incomplete bilingual 2026 calendar; nothing was overwritten")
    payload = {"version": 2, "year": YEAR, "days": dict(sorted(days.items()))}
    temporary = TARGET.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    temporary.replace(TARGET)
    print(f"OK: refreshed {len(days)} bilingual days -> {TARGET}")
    print("Next: py .github/scripts/build_calendar_offline_bundle.py")

if __name__ == "__main__":
    main()
