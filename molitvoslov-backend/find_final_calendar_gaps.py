import os
import re
from datetime import date
from difflib import SequenceMatcher

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")

import django
django.setup()

from api.calendar_models import CalendarDay, CalendarFeast

def normalize(value):
    value = (value or "").casefold().replace("ё", "е")
    value = re.sub(r"[\u0300-\u036f]", "", value)
    return re.sub(r"\s+", " ", value).strip()

targets = [
    (date(2026,1,18), ["богоявлен", "крещен"]),
    (date(2026,3,7), ["во евгении", "обретение мощей мучеников"]),
    (date(2026,4,12), ["воскресение христово", "пасха", "светлое христово воскресение"]),
    (date(2026,11,7), ["родительская суббота", "поминовение усопших"]),
]

print("=== МАЙ: НЕДОСТАЮЩЕЕ ЖИТИЕ ===")

may = CalendarDay.objects.filter(
    date_gregorian__range=(date(2026,5,1),date(2026,5,31))
).select_related("main_feast")

for day in may:
    feast = day.main_feast
    if not feast or not feast.life_content:
        print("Дата:", day.date_gregorian)
        print("ID:", feast.pk if feast else None)
        print("Название:", feast.title if feast else "НЕТ")
        print("Икона:", bool(feast and feast.icon_url))
        print("Чтения:", day.readings.count())

print("\n=== ЧЕТЫРЕ ДАТЫ: КАНДИДАТЫ ===")

all_feasts = list(
    CalendarFeast.objects.exclude(icon_url="")
    .only("id","title","icon_url","life_content")
)

for target, keywords in targets:
    day = CalendarDay.objects.select_related("main_feast").get(
        date_gregorian=target
    )
    main = day.main_feast
    print(f"\n{target}: {main.title} [ID {main.pk}]")

    found = []
    for feast in all_feasts:
        if feast.pk == main.pk:
            continue

        title = normalize(feast.title)
        score = SequenceMatcher(
            None, normalize(main.title), title
        ).ratio()

        keyword_match = any(normalize(k) in title for k in keywords)

        if keyword_match or score >= 0.76:
            found.append((score, keyword_match, feast))

    found.sort(key=lambda x: (x[1],x[0]), reverse=True)

    for score, matched, feast in found[:10]:
        print(
            f"  ID {feast.pk} | совпадение {score:.2f} "
            f"| житие {len(feast.life_content or '')} "
            f"| {feast.title[:110]}"
        )
        print("  URL:", feast.icon_url[:200])

    if not found:
        print("  Подходящих карточек с иконами не найдено")

print("\nГОТОВО. Данные не изменялись.")
