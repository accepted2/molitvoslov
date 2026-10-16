import re
import sqlite3
from pathlib import Path
from datetime import date, datetime

from django.conf import settings
from django.db import transaction
from api.models import CalendarDay

updates = {}
rules = {
    9: "sm_also",
    15: "intro",
    21: "kazan",
    29: "date",
}

for day_number, rule in rules.items():
    day = CalendarDay.objects.select_related("main_feast").get(
        date_gregorian=date(2026, 7, day_number)
    )

    feast = day.main_feast
    original = feast.life_content or ""
    cleaned = original

    if rule == "sm_also":
        cleaned = re.sub(
            r"\n\s*См\.\s*также:.*$",
            "",
            cleaned,
            flags=re.DOTALL,
        )

    elif rule == "intro":
        cleaned = re.sub(
            r"^\s*См\.\s*Риза Богородицы\s*",
            "",
            cleaned,
        )

    elif rule == "kazan":
        cleaned = re.sub(
            r"\n\s*См\.\s*также:.*$",
            "",
            cleaned,
            flags=re.DOTALL,
        )

    elif rule == "date":
        cleaned = re.sub(
            r"^\s*29 июля\s*",
            "",
            cleaned,
        )

    cleaned = cleaned.strip()

    if cleaned == original:
        raise RuntimeError(
            f"{day.date_gregorian}: ожидаемый фрагмент не найден"
        )

    updates[feast.pk] = (feast, cleaned)

# Проверяем главную память 12 июля
day_12 = CalendarDay.objects.prefetch_related("feasts").get(
    date_gregorian=date(2026, 7, 12)
)

matches = [
    feast for feast in day_12.feasts.all()
    if feast.pk == 4923
    and "Петра и Павла" in feast.title
]

if len(matches) != 1:
    raise RuntimeError(
        "Не найдена ожидаемая память апостолов Петра и Павла"
    )

new_main = matches[0]

print("ИСПРАВЛЕНИЯ ИЮЛЯ 2026")

for feast, cleaned in updates.values():
    print(
        f"Житие [{feast.pk}]: "
        f"{len(feast.life_content or '')} -> {len(cleaned)}"
    )

print("12 июля:")
print("Было:", day_12.main_feast)
print("Станет:", new_main)

# Резервная копия SQLite
db_path = Path(settings.DATABASES["default"]["NAME"])
backup_dir = Path("backups/sqlite")
backup_dir.mkdir(parents=True, exist_ok=True)

backup_path = backup_dir / (
    "before_july_fix_"
    + datetime.now().strftime("%Y%m%d_%H%M%S")
    + ".sqlite3"
)

source = sqlite3.connect(str(db_path))
backup = sqlite3.connect(str(backup_path))

try:
    source.backup(backup)
finally:
    backup.close()
    source.close()

print("Резервная копия:", backup_path)

with transaction.atomic():
    for feast, cleaned in updates.values():
        feast.life_content = cleaned
        feast.save(update_fields=["life_content"])

    day_12.main_feast = new_main
    day_12.save(update_fields=["main_feast"])

print("Успешно: очищено житий:", len(updates))
print("Успешно: главная память 12 июля исправлена.")
