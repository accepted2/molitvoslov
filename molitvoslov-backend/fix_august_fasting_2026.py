import sqlite3
from pathlib import Path
from datetime import date, datetime

from django.conf import settings
from django.db import transaction
from api.models import CalendarDay

codes = {
    14: "dry",
    15: "oil",
    16: "oil",
    17: "dry",
    18: "no-oil",
    19: "fish",
    20: "no-oil",
    21: "dry",
    22: "oil",
    23: "oil",
    24: "dry",
    25: "no-oil",
    26: "dry",
    27: "no-oil",
    28: "fish",
}

changes = []

for number, code in codes.items():
    day = CalendarDay.objects.get(
        date_gregorian=date(2026, 8, number)
    )

    expected_name = "Успенский пост" if number <= 27 else ""

    if day.fast_name != expected_name:
        raise RuntimeError(
            f"{day.date_gregorian}: неожиданное название поста: "
            f"{day.fast_name!r}"
        )

    if day.fast_type_code != code:
        changes.append((day, code))

print("ПЛАН ИСПРАВЛЕНИЙ")

for day, code in changes:
    print(
        day.date_gregorian,
        repr(day.fast_type_code),
        "->",
        repr(code)
    )

if changes:
    db_path = Path(settings.DATABASES["default"]["NAME"])
    backup_dir = Path("backups/sqlite")
    backup_dir.mkdir(parents=True, exist_ok=True)

    backup_path = backup_dir / (
        "before_august_fast_"
        + datetime.now().strftime("%Y%m%d_%H%M%S")
        + ".sqlite3"
    )

    with sqlite3.connect(str(db_path)) as source:
        with sqlite3.connect(str(backup_path)) as backup:
            source.backup(backup)

    print("Резервная копия:", backup_path)

    with transaction.atomic():
        for day, code in changes:
            day.fast_type_code = code
            day.save(update_fields=["fast_type_code"])

print("\nИТОГОВАЯ ПРОВЕРКА")

for number, expected_code in codes.items():
    day = CalendarDay.objects.get(
        date_gregorian=date(2026, 8, number)
    )

    assert day.fast_type_code == expected_code
    assert day.fast_name == (
        "Успенский пост" if number <= 27 else ""
    )

    print(
        day.date_gregorian,
        "|", day.fast_type_code,
        "|", day.fast_name or "Без названия многодневного поста"
    )

print("\nУспешно. Исправлено дней:", len(changes))
