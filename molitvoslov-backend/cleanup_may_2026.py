import os
import re
from datetime import date

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django

django.setup()

from django.db import transaction
from api.models import CalendarDay
from api.sqlite_backup import create_sqlite_backup

days = CalendarDay.objects.filter(
    date_gregorian__range=(date(2026, 5, 1), date(2026, 5, 31))
).select_related("main_feast")

feasts = {day.main_feast.pk: day.main_feast for day in days if day.main_feast_id}

changes = []

for feast in feasts.values():
    original = feast.life_content or ""
    cleaned = original.strip()

    # Убираем только отдельные строки с датами в начале жития.
    cleaned = re.sub(
        r"^\s*(?:\d{1,2}\s+[А-Яа-яЁё]+\s*\n\s*)+",
        "",
        cleaned,
    )

    # Убираем служебное указание источника в самом конце.
    cleaned = re.sub(
        r"\n\s*Источник:\s*[^\n]+\s*$",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )

    # Убираем библиографическое окончание статьи о Вознесении.
    if feast.title in (
        "Вознесение Господне",
        "Попразднство Вознесения Господня",
        "Отдание праздника Вознесения Господня",
    ):
        cleaned = re.sub(
            r"\n\s*По материалам статьи А\. А\. Ткаченко,.*$",
            "",
            cleaned,
            flags=re.DOTALL,
        )

    cleaned = cleaned.strip()

    if cleaned != original:
        changes.append((feast, cleaned))

print("Уникальных главных памятей:", len(feasts))
print("Записей для очистки:", len(changes))

for feast, cleaned in changes:
    print(f"[{feast.pk}] {feast.title}: {len(feast.life_content or '')} -> {len(cleaned)}")

if changes:
    backup = create_sqlite_backup("db.sqlite3", "backups/sqlite")
    print("Резервная копия:", backup)

    with transaction.atomic():
        for feast, cleaned in changes:
            feast.life_content = cleaned
            feast.save(update_fields=["life_content"])

    print("Очистка завершена успешно.")
else:
    print("Изменений не требуется.")
