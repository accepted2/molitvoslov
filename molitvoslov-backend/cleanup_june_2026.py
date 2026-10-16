import re
from datetime import date
from django.db import transaction
from django.conf import settings
from pathlib import Path
import sqlite3
from api.models import CalendarDay

days = list(
    CalendarDay.objects.filter(
        date_gregorian__range=(date(2026, 6, 1), date(2026, 6, 30))
    ).select_related("main_feast")
)

life_updates = {}
fast_updates = []

for day in days:
    feast = day.main_feast

    if feast and feast.life_content:
        original = feast.life_content
        cleaned = original

        if day.date_gregorian.day in (3, 13, 25):
            cleaned = re.sub(
                r"^\s*(?:\d{1,2}\s+[А-Яа-яЁё]+\s*\n\s*)+",
                "",
                cleaned,
            )

        if day.date_gregorian.day == 6:
            cleaned = re.sub(
                r"\n\s*Битбунов Г\.С\.\s*Святая Пятидесятница[^\n]*\s*$",
                "",
                cleaned,
            )

        if day.date_gregorian.day == 13:
            cleaned = re.sub(
                r"\n\s*2\.\s*Архиепископ Димитрий[^\n]*\s*$",
                "",
                cleaned,
            )

        cleaned = cleaned.strip()

        if cleaned != original:
            life_updates[feast.pk] = (feast, cleaned)

    if day.fast_name == "Апостольский пост":
        fast_updates.append(day)

print("Житий к очистке:", len(life_updates))
print("Дней для унификации поста:", len(fast_updates))

for feast, cleaned in life_updates.values():
    print("Житие:", feast.pk, feast.title, len(feast.life_content), "->", len(cleaned))

if life_updates or fast_updates:
    db_path = Path(settings.DATABASES["default"]["NAME"])
    backup_dir = Path("backups/sqlite")
    backup_dir.mkdir(parents=True, exist_ok=True)
    from datetime import datetime

    backup_path = backup_dir / (
        "before_june_cleanup_" + datetime.now().strftime("%Y%m%d_%H%M%S") + ".sqlite3"
    )

    src = sqlite3.connect(str(db_path))
    dst = sqlite3.connect(str(backup_path))
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()

    print("Резервная копия:", backup_path)

    with transaction.atomic():
        for feast, cleaned in life_updates.values():
            feast.life_content = cleaned
            feast.save(update_fields=["life_content"])

        for day in fast_updates:
            day.fast_name = "Петров пост"
            day.save(update_fields=["fast_name"])

    print("Очистка июня завершена успешно.")
else:
    print("Изменений не требуется.")
