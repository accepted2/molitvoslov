import os
from datetime import date

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")

import django

django.setup()

from api.calendar_models import CalendarDay

print("=== ЧЕТЫРЕ ДАТЫ ДЛЯ ИСПРАВЛЕНИЯ ===")

for year, month, day_number in [
    (2026, 1, 18),
    (2026, 3, 7),
    (2026, 4, 12),
    (2026, 11, 7),
]:
    day = CalendarDay.objects.select_related("main_feast").get(
        date_gregorian=date(year, month, day_number)
    )
    main = day.main_feast

    print(f"\n=== {day.date_gregorian} ===")
    print("Главная:", main.pk if main else None)
    print("Название:", main.title if main else "НЕТ")
    print("Житие:", len(main.life_content or "") if main else 0)
    print("Икона:", main.icon_url if main else "")
    print("Чтений:", day.readings.count())

    print("Карточки этого дня:")
    for feast in day.feasts.all():
        print(
            f"  ID {feast.pk} | {feast.title[:100]} "
            f"| икона: {'да' if feast.icon_url else 'нет'} "
            f"| житие: {len(feast.life_content or '')}"
        )

print("\n=== ПОЛНОТА КАЛЕНДАРЯ ЗА 2026 ГОД ===")

for month in range(1, 13):
    days = list(
        CalendarDay.objects.filter(date_gregorian__year=2026, date_gregorian__month=month)
        .select_related("main_feast")
        .prefetch_related("readings")
    )

    reading_count = sum(bool(d.readings.all()) for d in days)
    icon_count = sum(bool(d.main_feast and d.main_feast.icon_url) for d in days)
    life_count = sum(bool(d.main_feast and d.main_feast.life_content) for d in days)

    print(
        f"{month:02d}: дней={len(days)}, "
        f"чтения={reading_count}, "
        f"жития={life_count}, "
        f"иконы={icon_count}"
    )

print("\nГОТОВО. База не изменялась.")
