"""Fill only missing September 2026 icons and October 1 Evmeniy biography.

Run from C:\\m\\repo\\molitvoslov-backend with the active virtualenv:
    python -X utf8 .\\restore_september_icons_and_evmeniy.py

No existing icons, other texts, readings or calendar associations are replaced.
Can be run again safely after partial failures.
"""

from __future__ import annotations

import os
import re
import sqlite3
import sys
import time
from datetime import date, datetime
from pathlib import Path

BASE = Path(__file__).resolve().parent
os.chdir(BASE)
os.environ.setdefault("PYTHONUTF8", "1")
os.environ.setdefault("PYTHONIOENCODING", "utf-8")

# The project uses backend.settings; it does not require python-dotenv.
env_file = BASE / ".env"
if env_file.is_file():
    for line in env_file.read_text(encoding="utf-8-sig").splitlines():
        item = re.match(
            r"^\s*(CLOUD_NAME|CLOUD_API_KEY|CLOUD_API_SECRET|CLOUDINARY_URL)\s*=\s*(.*?)\s*$", line
        )
        if item:
            key, raw = item.groups()
            value = raw.strip().strip("\"'")
            if value and not os.environ.get(key):
                os.environ[key] = value

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")

import django  # noqa: E402

django.setup()

import requests  # noqa: E402
from django.conf import settings  # noqa: E402
from api.calendar_models import CalendarDay, CalendarFeast  # noqa: E402
from api.azbyka_calendar_feasts import fetch_day_saint_links, fetch_saint_content  # noqa: E402
from api.calendar_icon_storage import cloudinary_configured, upload_azbyka_icon  # noqa: E402
from api.management.commands.import_azbyka_calendar_feasts import (  # noqa: E402
    clean_imported_life,
    deterministic_azbyka_day_feast_uid,
)


def report(*items):
    print(*items, flush=True)


report("=== ПРОВЕРКА ===")
if not cloudinary_configured():
    sys.exit("СТОП: не обнаружены ключи Cloudinary. Проверь .env")
try:
    import cloudinary  # noqa: F401
    import cloudinary.uploader  # noqa: F401
except ImportError:
    sys.exit("СТОП: пакет cloudinary не установлен. Выполни: pip install cloudinary")

active_db = settings.DATABASES["default"]
if active_db.get("ENGINE") != "django.db.backends.sqlite3":
    sys.exit("СТОП: активная Django БД не SQLite; изменения не выполняются")
db_path = Path(active_db["NAME"]).resolve()
if not db_path.is_file():
    sys.exit(f"СТОП: файл БД не существует: {db_path}")

days = list(
    CalendarDay.objects.filter(date_gregorian__range=(date(2026, 9, 1), date(2026, 9, 30)))
    .select_related("main_feast")
    .prefetch_related("readings", "feasts")
    .order_by("date_gregorian")
)
readings_ok = sum(bool(d.readings.all()) for d in days)
if len(days) != 30 or readings_ok != 30:
    sys.exit(f"СТОП: сентябрь неполный (дней {len(days)}, чтений {readings_ok}/30)")
report(f"БД: {db_path}")
report("Cloudinary: OK | сентябрь: 30/30 дней с чтениями")

backup_dir = BASE / "backups" / "sqlite"
backup_dir.mkdir(parents=True, exist_ok=True)
backup = backup_dir / f"before_september_icons_{datetime.now():%Y%m%d_%H%M%S}.sqlite3"
with sqlite3.connect(str(db_path)) as src, sqlite3.connect(str(backup)) as dst:
    src.backup(dst)
report("Резервная копия:", backup)

report("\n=== СЕНТЯБРЬ: ЗАПОЛНЯЕМ ТОЛЬКО ПУСТЫЕ ICON_URL ===")
stat = {"saved": 0, "no_source_icon": 0, "unmatched": 0, "errors": 0}
cache: dict[str, str] = {}
with requests.Session() as session:
    session.headers.update({"User-Agent": "Mozilla/5.0"})
    for day in days:
        candidates = list(day.feasts.all())
        if day.main_feast and all(f.pk != day.main_feast_id for f in candidates):
            candidates.append(day.main_feast)
        by_uid = {str(f.sync_uid): f for f in candidates if f.sync_uid}
        missing_before = sum(not f.icon_url for f in candidates)
        if missing_before == 0:
            report(f"{day.date_gregorian}: все иконы уже есть")
            continue
        try:
            sources = fetch_day_saint_links(day.date_gregorian, session=session, timeout=30)
        except Exception as exc:
            report(f"{day.date_gregorian}: ошибка списка ({type(exc).__name__}: {str(exc)[:160]})")
            stat["errors"] += 1
            continue
        daily_saved = 0
        for source in sources:
            uid = str(deterministic_azbyka_day_feast_uid(day.date_gregorian, source.url))
            feast = by_uid.get(uid)
            if feast is None:
                stat["unmatched"] += 1
                continue
            if feast.icon_url:
                continue
            try:
                if source.url not in cache:
                    parsed = fetch_saint_content(source.url, session=session, timeout=30)
                    if parsed.icon_source_url:
                        cache[source.url] = upload_azbyka_icon(parsed.icon_source_url, source.url)
                    else:
                        cache[source.url] = ""
                    time.sleep(0.15)
                new_url = cache[source.url]
                if not new_url:
                    stat["no_source_icon"] += 1
                    continue
                changed = CalendarFeast.objects.filter(pk=feast.pk, icon_url="").update(
                    icon_url=new_url
                )
                if changed:
                    feast.icon_url = new_url
                    stat["saved"] += 1
                    daily_saved += 1
            except Exception as exc:
                stat["errors"] += 1
                report(
                    f"  {day.date_gregorian}: ошибка [{source.title[:55]}]: {type(exc).__name__} {str(exc)[:160]}"
                )
        report(
            f"{day.date_gregorian}: икон добавлено {daily_saved}; доступных памятей {len(candidates)}"
        )

report("\nРезультат икон:", stat)

report("\n=== 1 ОКТЯБРЯ: ЕВМЕНИЙ ГОРТИНСКИЙ ===")
try:
    ev_day = CalendarDay.objects.select_related("main_feast").get(date_gregorian=date(2026, 10, 1))
    feast = ev_day.main_feast
    if (
        not feast
        or feast.pk != 2331
        or "евмен" not in feast.title.casefold()
        or "гортин" not in feast.title.casefold()
    ):
        report("Житие не изменено: ID или имя главной памяти дня отличается от ожидаемого")
    elif feast.life_content.strip():
        report("Житие уже заполнено; ничего не меняем")
    else:
        url = "https://azbyka.ru/days/sv-evmenij-gortinskij"
        parsed = fetch_saint_content(url, timeout=30)
        title = parsed.title or ""
        life = clean_imported_life(parsed.life_content or "")
        report("Источник:", url)
        report("Заголовок:", title)
        report("Объём текста:", len(life), "символов")
        report("Начало:", life[:180].replace("\n", " "))
        report("Конец:", life[-160:].replace("\n", " "))
        title_ok = "евмен" in title.casefold() and "гортин" in title.casefold()
        body_ok = 150 <= len(life) <= 20000 and "евмен" in life[:1500].casefold()
        if title_ok and body_ok:
            rows = CalendarFeast.objects.filter(pk=2331, life_content="").update(life_content=life)
            report("Сохранено житие:", "ДА" if rows == 1 else "НЕТ")
        else:
            report("ТРЕБУЕТ РУЧНОЙ ПРОВЕРКИ: житие автоматически не сохранено")
except Exception as exc:
    report("Евмений: ошибка", type(exc).__name__, str(exc)[:200])

report("\n=== ИТОГ ===")
fresh_days = list(
    CalendarDay.objects.filter(date_gregorian__range=(date(2026, 9, 1), date(2026, 9, 30)))
    .select_related("main_feast")
    .prefetch_related("readings")
)
report("Чтения главных дней:", sum(bool(d.readings.all()) for d in fresh_days), "/30")
report(
    "Жития главных памятей:",
    sum(bool(d.main_feast and d.main_feast.life_content) for d in fresh_days),
    "/30",
)
report(
    "Иконы главных памятей:",
    sum(bool(d.main_feast and d.main_feast.icon_url) for d in fresh_days),
    "/30",
)
report(
    "Без главной иконы:",
    ", ".join(
        str(d.date_gregorian) for d in fresh_days if not d.main_feast or not d.main_feast.icon_url
    )
    or "нет",
)
try:
    oct_feast = CalendarFeast.objects.get(pk=2331)
    report("Житие Евмения:", len(oct_feast.life_content or ""), "символов")
except CalendarFeast.DoesNotExist:
    report("Житие Евмения: отсутствует карточка 2331")
report("Готово. Чтения, существующие жития и связи календарных дней не изменялись.")
