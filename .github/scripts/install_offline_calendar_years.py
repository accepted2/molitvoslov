"""Install verified Django calendar exports into APK month JSONs.

Usage from repository root:
 python .github/scripts/install_offline_calendar_years.py --source-dir <directory>
The source must contain calendar_2025.json, calendar_2026.json, calendar_2027.json
created with manage.py export_calendar_offline. No cloud calls or DB changes.
"""
from __future__ import annotations
import argparse
import calendar
import json
import os
from pathlib import Path
import tempfile

ROOT = Path(__file__).resolve().parents[2]
TARGET = ROOT / "molitvoslov-app" / "src" / "data" / "calendar"
YEARS = (2025, 2026, 2027)


def prepare(source_dir: Path):
    outputs = {}
    for year in YEARS:
        source = source_dir / f"calendar_{year}.json"
        if not source.is_file():
            raise ValueError(f"Отсутствует: {source}")
        data = json.loads(source.read_text(encoding="utf-8-sig"))
        days = data.get("days")
        expected = 366 if calendar.isleap(year) else 365
        if int(data.get("year") or 0) != year or not isinstance(days, dict) or len(days) != expected:
            raise ValueError(f"{year}: ожидается {expected} дней в годовом JSON")
        for month in range(1, 13):
            subset = {}
            month_days = calendar.monthrange(year, month)[1]
            for number in range(1, month_days + 1):
                key = f"{year}-{month:02d}-{number:02d}"
                item = days.get(key)
                if not isinstance(item, dict) or not isinstance(item.get("ru"), dict) or not isinstance(item.get("uk"), dict):
                    raise ValueError(f"Нет полных RU/UK данных для {key}")
                if item["ru"].get("date_gregorian") != key or item["uk"].get("date_gregorian") != key:
                    raise ValueError(f"Дата в полезной нагрузке не совпадает: {key}")
                subset[key] = item
            outputs[TARGET / f"{year}-{month:02d}.json"] = json.dumps(
                {"version": data.get("version", 1), "year": year, "month": month,
                 "generated_at": data.get("generated_at"), "days": subset},
                ensure_ascii=False, separators=(",", ":"))
        print(f"{year}: проверено {expected} дней / 12 месяцев")
    return outputs


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path, required=True)
    args = parser.parse_args()
    payloads = prepare(args.source_dir)
    TARGET.mkdir(parents=True, exist_ok=True)
    for target, content in payloads.items():
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=TARGET,
                                         suffix=".tmp", delete=False) as f:
            temp = Path(f.name)
            f.write(content)
        os.replace(temp, target)
    print(f"Готово: {len(payloads)} файлов месяцев, 1095 дней; исходные данные и SQLite не изменены.")
    print("ВАЖНО: иконы в этом этапе не пересобирались; новые изображения могут требовать сети.")


if __name__ == "__main__":
    main()
