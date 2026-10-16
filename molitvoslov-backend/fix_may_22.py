from datetime import date
from django.db import transaction
from api.models import CalendarDay

day = CalendarDay.objects.prefetch_related("feasts").get(
    date_gregorian=date(2026, 5, 22)
)

matches = [
    feast for feast in day.feasts.all()
    if "Перенесение мощей святителя и чудотворца Николая" in feast.title
]

if len(matches) != 1:
    raise RuntimeError(
        f"Ожидалась одна память Николая Чудотворца, найдено: {len(matches)}"
    )

new_main = matches[0]

print("Дата:", day.date_gregorian)
print("Было:", day.main_feast)
print("Станет:", new_main)

with transaction.atomic():
    day.main_feast = new_main
    day.save(update_fields=["main_feast"])

print("Главная память успешно обновлена.")
print("Всего памятей сохранено:", day.feasts.count())
