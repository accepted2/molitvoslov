import os
import sqlite3
from pathlib import Path
from datetime import date, datetime

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")

import django
django.setup()

from django.conf import settings
from django.db import transaction
from api.calendar_models import CalendarDay, CalendarFeast

TEXTS = {
    date(2026, 4, 12): {
        "id": 236,
        "title": "Светлое Христово Воскресение",
        "text": """Светлое Христово Воскресение — Пасха Господня — величайший праздник Православной Церкви, торжество победы жизни над смертью.

После крестных страданий и погребения Господь наш Иисус Христос воскрес из мертвых в третий день, как предвозвестил Своим ученикам. Ранним утром первого дня недели жены-мироносицы пришли ко гробу Спасителя с благовониями, но нашли камень отваленным, а гроб пустым. Ангел возвестил им, что Христос воскрес.

Воскресший Господь являлся Своим ученикам, укрепляя их веру и открывая смысл совершившегося спасения. Своим Воскресением Христос разрушил власть смерти и даровал человечеству надежду на воскресение и жизнь вечную.

Пасха является средоточием христианской веры и духовной жизни Церкви. В пасхальную ночь верующие собираются на торжественное богослужение, прославляют Воскресшего Спасителя и приветствуют друг друга словами: «Христос воскресе!» — «Воистину воскресе!»

Пасхальная радость продолжается в течение Светлой седмицы и всего пасхального периода до отдания праздника. В 2026 году православная Пасха празднуется 12 апреля.""",
    },
    date(2026, 5, 22): {
        "id": 4482,
        "title": "Перенесение мощей святителя и чудотворца Николая",
        "text": """22 мая Православная Церковь вспоминает перенесение честных мощей святителя Николая Чудотворца из Мир Ликийских в город Бари, совершившееся в 1087 году.

Святитель Николай, архиепископ Мир Ликийских, ещё при земной жизни прославился милосердием, защитой невинно осуждённых, помощью нуждающимся и твёрдым исповеданием православной веры. После блаженной кончины его святые мощи пребывали в городе Миры, где многие верующие получали утешение и помощь по молитвам святителя.

В XI веке, когда положение христианских святынь в Малой Азии становилось всё более тревожным, моряки из итальянского города Бари прибыли в Миры и перенесли мощи святителя Николая на свой корабль. В мае 1087 года святыня была доставлена в Бари, где её торжественно встретили духовенство и жители города.

Для пребывания мощей святителя был воздвигнут величественный храм, который стал местом паломничества христиан из разных стран. Почитание святителя Николая продолжало распространяться, а память о перенесении его мощей стала особым церковным праздником.

В этот день верующие молитвенно обращаются ко святителю Николаю, прося его предстательства перед Господом, помощи в скорбях, укрепления в вере и наставления на путь христианской жизни.""",
    },
}

print("=== ПРОВЕРКА КАРТОЧЕК ===")

pending = []

for target_date, item in TEXTS.items():
    day = CalendarDay.objects.select_related("main_feast").get(
        date_gregorian=target_date
    )

    if day.main_feast_id != item["id"]:
        raise RuntimeError(
            f"СТОП: {target_date}: ID отличается от ожидаемого"
        )

    feast = day.main_feast

    if item["title"].casefold() not in feast.title.casefold():
        raise RuntimeError(
            f"СТОП: {target_date}: название не совпадает"
        )

    if feast.life_content.strip():
        print(f"{target_date}: текст уже заполнен, пропускаем")
    else:
        pending.append((target_date, item))
        print(f"{target_date}: готов к заполнению, {len(item['text'])} символов")

if not pending:
    print("Оба текста уже заполнены. Изменений нет.")
    raise SystemExit(0)

print("\n=== РЕЗЕРВНАЯ КОПИЯ ===")

db = Path(settings.DATABASES["default"]["NAME"]).resolve()
backup_dir = Path("backups/sqlite")
backup_dir.mkdir(parents=True, exist_ok=True)

backup = backup_dir / (
    "before_pascha_nicholas_texts_" +
    datetime.now().strftime("%Y%m%d_%H%M%S") +
    ".sqlite3"
)

with sqlite3.connect(str(db)) as src:
    with sqlite3.connect(str(backup)) as dst:
        src.backup(dst)

print("Backup:", backup)

print("\n=== СОХРАНЕНИЕ ===")

with transaction.atomic():
    for target_date, item in pending:
        changed = CalendarFeast.objects.filter(
            pk=item["id"],
            life_content=""
        ).update(life_content=item["text"])

        if changed != 1:
            raise RuntimeError(
                f"СТОП: {target_date}: текст изменился. Транзакция отменена."
            )

        print(f"OK: {target_date} — сохранено {len(item['text'])} символов")

print("\n=== ИТОГ ===")

for target_date, item in TEXTS.items():
    feast = CalendarFeast.objects.get(pk=item["id"])
    print(
        f"{target_date} | ID {feast.pk} | "
        f"текст {len(feast.life_content or '')} | "
        f"икона {'да' if feast.icon_url else 'нет'}"
    )

print("\nГОТОВО")
