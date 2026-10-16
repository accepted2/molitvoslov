import re
import sqlite3
from pathlib import Path
from datetime import date, datetime

from django.conf import settings
from django.db import transaction
from api.models import CalendarDay

main_targets = {
    10: 5167,  # Смоленская икона Божией Матери
    12: 5200,  # Мученик Иоанн Воин
}

life_rules = {
    5: "source",
    6: "date",
    18: "bibliography",
    19: "bibliography",
    24: "bibliography",
    25: "bibliography",
    26: "bibliography",
    31: "note",
}

main_changes = []
life_changes = {}
fast_changes = []

# 1. Главные памяти
for number, feast_id in main_targets.items():
    day = CalendarDay.objects.prefetch_related("feasts").get(date_gregorian=date(2026, 8, number))

    matches = [feast for feast in day.feasts.all() if feast.pk == feast_id]

    if len(matches) != 1:
        raise RuntimeError(f"{day.date_gregorian}: память {feast_id} не найдена")

    if day.main_feast_id != feast_id:
        main_changes.append((day, matches[0]))

# 2. Очистка житий
for number, rule in life_rules.items():
    day = CalendarDay.objects.select_related("main_feast").get(date_gregorian=date(2026, 8, number))

    feast = day.main_feast
    original = feast.life_content or ""
    cleaned = original

    if rule == "source":
        cleaned = re.sub(
            r"\n\s*Источник:\s*st-nikolas\.orthodoxy\.ru\s*$",
            "",
            cleaned,
        )

    elif rule == "date":
        cleaned = re.sub(
            r"^\s*6 августа\s*",
            "",
            cleaned,
        )

    elif rule == "bibliography":
        cleaned = re.sub(
            r"\n\s*Для любознательных читателей:\s*.*$",
            "",
            cleaned,
            flags=re.DOTALL,
        )

    elif rule == "note":
        cleaned = re.sub(
            r"\n\s*Примечание\s*\n\s*\[1\].*$",
            "",
            cleaned,
            flags=re.DOTALL,
        )

    cleaned = cleaned.strip()

    if cleaned == original:
        raise RuntimeError(f"{day.date_gregorian}: ожидаемый фрагмент не найден")

    if feast.pk in life_changes:
        if life_changes[feast.pk][1] != cleaned:
            raise RuntimeError(f"Конфликт очистки жития {feast.pk}")
    else:
        life_changes[feast.pk] = (feast, cleaned)

# 3. Исправление названия поста до 14 августа
for number in (5, 7, 12):
    day = CalendarDay.objects.get(date_gregorian=date(2026, 8, number))

    if day.fast_name != "Успенский пост":
        raise RuntimeError(f"{day.date_gregorian}: неожиданное название поста")

    fast_changes.append(day)

print("ПЛАН ИСПРАВЛЕНИЙ")

for day, feast in main_changes:
    print(day.date_gregorian, "->", feast.title)

for feast, cleaned in life_changes.values():
    print("Житие", feast.pk, len(feast.life_content or ""), "->", len(cleaned))

for day in fast_changes:
    print("Исправление названия поста:", day.date_gregorian)

# 4. Резервная копия
db_path = Path(settings.DATABASES["default"]["NAME"])
backup_dir = Path("backups/sqlite")
backup_dir.mkdir(parents=True, exist_ok=True)

backup_path = backup_dir / (
    "before_august_cleanup_" + datetime.now().strftime("%Y%m%d_%H%M%S") + ".sqlite3"
)

source = sqlite3.connect(str(db_path))
backup = sqlite3.connect(str(backup_path))

try:
    source.backup(backup)
finally:
    backup.close()
    source.close()

print("Резервная копия:", backup_path)

# 5. Сохранение
with transaction.atomic():
    for day, feast in main_changes:
        day.main_feast = feast
        day.save(update_fields=["main_feast"])

    for feast, cleaned in life_changes.values():
        feast.life_content = cleaned
        feast.save(update_fields=["life_content"])

    for day in fast_changes:
        day.fast_name = ""
        day.save(update_fields=["fast_name"])

print("Исправление завершено.")
print("Главных памятей:", len(main_changes))
print("Очищено житий:", len(life_changes))
print("Исправлено названий поста:", len(fast_changes))
