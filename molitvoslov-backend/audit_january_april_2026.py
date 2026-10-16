import os
import re
import sqlite3
from datetime import date, datetime
from pathlib import Path

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")

import django

django.setup()

from django.conf import settings
from api.calendar_models import CalendarDay, CalendarFeast

print("=== 7 НОЯБРЯ ===")
day = CalendarDay.objects.select_related("main_feast").get(date_gregorian=date(2026, 11, 7))
main = day.main_feast


def norm(text):
    return re.sub(r"\s+", " ", (text or "").casefold().replace("ё", "е")).strip()


print("ID:", main.pk)
print("Название:", main.title)
print("Икона:", bool(main.icon_url))

if not main.icon_url:
    candidates = [
        f
        for f in CalendarFeast.objects.exclude(icon_url="")
        if f.pk != main.pk and norm(f.title) == norm(main.title)
    ]
    urls = sorted(set(f.icon_url for f in candidates))
    print("Точных совпадений:", len(candidates))

    if len(urls) == 1:
        db = Path(settings.DATABASES["default"]["NAME"])
        backup_dir = Path("backups/sqlite")
        backup_dir.mkdir(parents=True, exist_ok=True)
        backup = backup_dir / (
            "before_nov7_icon_" + datetime.now().strftime("%Y%m%d_%H%M%S") + ".sqlite3"
        )
        with sqlite3.connect(str(db)) as src:
            with sqlite3.connect(str(backup)) as dst:
                src.backup(dst)
        changed = CalendarFeast.objects.filter(pk=main.pk, icon_url="").update(icon_url=urls[0])
        print("Икона восстановлена:", bool(changed))
        print("Backup:", backup)
    else:
        print("Икона не изменена: нужен отдельный подбор изображения")

print("\n=== ЯНВАРЬ–АПРЕЛЬ 2026 ===")

for month, total in ((1, 31), (2, 28), (3, 31), (4, 30)):
    days = list(
        CalendarDay.objects.filter(
            date_gregorian__range=(date(2026, month, 1), date(2026, month, total))
        )
        .select_related("main_feast")
        .prefetch_related("readings", "feasts")
    )

    readings = sum(bool(d.readings.all()) for d in days)
    icons = sum(bool(d.main_feast and d.main_feast.icon_url) for d in days)
    lives = sum(bool(d.main_feast and d.main_feast.life_content) for d in days)

    print(
        f"\n{month:02d}.2026: дней {len(days)}/{total}, "
        f"чтения {readings}, жития {lives}, иконы {icons}"
    )

    missing = [
        d.date_gregorian.isoformat()
        for d in days
        if not d.readings.all()
        or not d.main_feast
        or not d.main_feast.life_content
        or not d.main_feast.icon_url
    ]
    print("Неполные даты:", ", ".join(missing) if missing else "нет")

print("\n=== ФИНАЛЬНАЯ ПРОВЕРКА НОЯБРЯ ===")
day.refresh_from_db()
main.refresh_from_db()
print("7 ноября, главная икона:", bool(main.icon_url))
print("ГОТОВО")
