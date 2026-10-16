from datetime import date
from api.models import CalendarDay

print("\n========== 15 АВГУСТА: ИКОНЫ ==========")

day = CalendarDay.objects.prefetch_related("feasts").get(
    date_gregorian=date(2026, 8, 15)
)

for feast in day.feasts.all():
    print(
        ("★ " if feast.pk == day.main_feast_id else "  "),
        feast.pk,
        "|", feast.title,
        "| икона:", repr(feast.icon_url)
    )

print("\n========== 27 АВГУСТА: ЖИТИЯ ==========")

day = CalendarDay.objects.prefetch_related("feasts").get(
    date_gregorian=date(2026, 8, 27)
)

for feast in day.feasts.all():
    content = feast.life_content or ""
    print("\nID:", feast.pk)
    print("Название:", feast.title)
    print("Главная:", feast.pk == day.main_feast_id)
    print("Длина жития:", len(content))
    print("Начало:", repr(content[:300]))
    print("Конец:", repr(content[-200:]))

print("\n========== ОКОНЧАНИЯ ЖИТИЙ ==========")

for number in (5, 16, 18, 28, 31):
    day = CalendarDay.objects.select_related("main_feast").get(
        date_gregorian=date(2026, 8, number)
    )

    content = day.main_feast.life_content or ""

    print("\n", day.date_gregorian)
    print("Память:", day.main_feast.title)
    print("Конец:", repr(content[-750:]))

print("\n========== ПРОВЕРКА ОШИБОК В ПОСТАХ ==========")

for number in (5, 7, 12, 14, 15, 19, 27, 28):
    day = CalendarDay.objects.get(
        date_gregorian=date(2026, 8, number)
    )
    print(
        day.date_gregorian,
        "| день недели:", day.date_gregorian.strftime("%A"),
        "| код:", repr(day.fast_type_code),
        "| пост:", repr(day.fast_name),
        "| описание:", repr(day.fast_description)
    )
