from datetime import date
from api.models import CalendarDay

for month, last_day in [(9, 30), (10, 31), (11, 30), (12, 31)]:
    days = list(
        CalendarDay.objects.filter(
            date_gregorian__range=(
                date(2026, month, 1),
                date(2026, month, last_day),
            )
        )
        .select_related("main_feast")
        .prefetch_related("feasts", "readings")
        .order_by("date_gregorian")
    )

    print(f"\n========== {month:02d}.2026 ==========")
    print("Дней:", len(days), "/", last_day)
    print("С чтениями:", sum(bool(d.readings.all()) for d in days))
    print("С памятями:", sum(bool(d.feasts.all()) for d in days))
    print("С иконами:", sum(bool(d.main_feast and d.main_feast.icon_url) for d in days))
    print("С житиями:", sum(bool(d.main_feast and d.main_feast.life_content) for d in days))

    for d in days:
        print(
            d.date_gregorian,
            "| памятей:", len(d.feasts.all()),
            "| чтений:", len(d.readings.all()),
            "| главная:", d.main_feast.title if d.main_feast else "НЕТ",
        )
