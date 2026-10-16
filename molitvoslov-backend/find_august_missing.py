from api.models import CalendarFeast, CalendarDay
from datetime import date

print("\n========== ЖИТИЯ ФЕОДОСИЯ ПЕЧЕРСКОГО ==========")

feasts = CalendarFeast.objects.filter(
    title__icontains="Феодосий"
).filter(
    title__icontains="Печерск"
)

for feast in feasts:
    content = feast.life_content or ""
    print("\nID:", feast.pk)
    print("Название:", feast.title)
    print("Житие:", len(content), "символов")
    print("Начало:", repr(content[:250]))
    print("Икона:", repr(feast.icon_url))

print("\n========== ИКОНЫ ПЕРВОМУЧЕНИКА СТЕФАНА ==========")

feasts = CalendarFeast.objects.filter(
    title__icontains="Стефан"
)

for feast in feasts:
    if (
        "первомученик" in feast.title.lower()
        or "первомученика" in feast.title.lower()
        or "архидиакон" in feast.title.lower()
    ):
        print("\nID:", feast.pk)
        print("Название:", feast.title)
        print("Икона:", repr(feast.icon_url))
        print("Житие:", len(feast.life_content or ""))

print("\n========== ПОСТ 14–27 АВГУСТА ==========")

for number in range(14, 28):
    day = CalendarDay.objects.get(
        date_gregorian=date(2026, 8, number)
    )
    print(
        day.date_gregorian,
        day.date_gregorian.strftime("%A"),
        "| код:", repr(day.fast_type_code),
        "| пост:", repr(day.fast_name)
    )
