from datetime import date
from api.models import CalendarDay

for month, last_day in ((9, 30), (10, 31)):
    days = list(
        CalendarDay.objects.filter(
            date_gregorian__range=(
                date(2026, month, 1),
                date(2026, month, last_day)
            )
        )
        .select_related("main_feast")
        .prefetch_related("readings", "feasts")
        .order_by("date_gregorian")
    )

    print(f"\n=== {month:02d}.2026 ===")
    print("Дней:", len(days))
    print("С чтениями:", sum(bool(d.readings.all()) for d in days))
    print("С иконами:", sum(bool(d.main_feast and d.main_feast.icon_url) for d in days))
    print("С житиями:", sum(bool(d.main_feast and d.main_feast.life_content) for d in days))

    for d in days:
        if not d.main_feast or not d.main_feast.life_content or not d.main_feast.icon_url or not d.readings.all():
            print(
                "ПРОБЛЕМА:",
                d.date_gregorian,
                "| главная:", d.main_feast.title if d.main_feast else "НЕТ",
                "| житие:", bool(d.main_feast and d.main_feast.life_content),
                "| икона:", bool(d.main_feast and d.main_feast.icon_url),
                "| чтения:", len(d.readings.all())
            )

    for number in (11, 21, 27):
        if month == 9:
            day = next((d for d in days if d.date_gregorian.day == number), None)
            if day:
                print("ГЛАВНЫЙ ПРАЗДНИК:", day.date_gregorian, "|", day.main_feast.title)
