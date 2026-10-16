import sqlite3
from pathlib import Path
from datetime import date, datetime
from django.conf import settings
from django.db import transaction
from api.models import CalendarDay

targets = {
    1: "День Святого Духа",
    11: "Святитель Лука (Войно-Ясенецкий)",
    20: "Мученик Феодот Анкирский",
}

changes = []

for day_number, title_fragment in targets.items():
    day = CalendarDay.objects.prefetch_related("feasts").get(
        date_gregorian=date(2026, 6, day_number)
    )

    matches = [
        feast for feast in day.feasts.all()
        if title_fragment in feast.title
    ]

    if len(matches) != 1:
        raise RuntimeError(
            f"{day.date_gregorian}: найдено {len(matches)} совпадений"
        )

    new_main = matches[0]

    print(f"\n{day.date_gregorian}")
    print("Было:", day.main_feast)
    print("Станет:", new_main)

    if day.main_feast_id != new_main.pk:
        changes.append((day, new_main))

if not changes:
    print("Все главные памяти уже установлены.")
else:
    db_path = Path(settings.DATABASES["default"]["NAME"])
    backup_dir = Path("backups/sqlite")
    backup_dir.mkdir(parents=True, exist_ok=True)

    backup_path = backup_dir / (
        "before_june_main_fix_"
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

    print("\nРезервная копия:", backup_path)

    with transaction.atomic():
        for day, feast in changes:
            day.main_feast = feast
            day.save(update_fields=["main_feast"])

    print("Обновлено главных памятей:", len(changes))
