import os
import re
import sys
from pathlib import Path

for line in Path(".env").read_text(encoding="utf-8-sig").splitlines():
    match = re.match(r"^\s*(CLOUD_NAME|CLOUD_API_KEY|CLOUD_API_SECRET)\s*=\s*(.*?)\s*$", line)
    if match:
        key, value = match.groups()
        os.environ.setdefault(key, value.strip().strip('"').strip("'"))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")

import django
django.setup()

import requests
from django.conf import settings
from api.calendar_models import CalendarDay, CalendarFeast
from api.calendar_icon_storage import upload_azbyka_icon
from api.sqlite_backup import create_sqlite_backup
from datetime import date

source_url = "https://azbyka.ru/days/storage/images/icons-of-holidays/15/p1bdgqi9c21ijacrq1ub5a11fqb3.jpg"
page_url = "https://azbyka.ru/days/prazdnik-svetloe-hristovo-voskresenie-pasha"

day = CalendarDay.objects.get(date_gregorian=date(2026, 4, 12))

if day.main_feast_id != 236:
    sys.exit("СТОП: главная память Пасхи имеет другой ID")

feast = CalendarFeast.objects.get(pk=236)

if feast.title != "Светлое Христово Воскресение":
    sys.exit("СТОП: неожиданное название праздника")

if feast.icon_url:
    sys.exit("Икона уже имеется. Ничего не изменено.")

response = requests.get(source_url, timeout=30, stream=True)
response.raise_for_status()

if not response.headers.get("Content-Type", "").lower().startswith("image/"):
    sys.exit("СТОП: ссылка не вернула изображение")

response.close()

backup, digest = create_sqlite_backup(
    settings.DATABASES["default"]["NAME"],
    Path("backups/sqlite")
)

print("Backup:", backup)

url = upload_azbyka_icon(source_url, page_url)

if not url.startswith("https://res.cloudinary.com/"):
    sys.exit("СТОП: неожиданный URL Cloudinary")

CalendarFeast.objects.filter(pk=236, icon_url="").update(icon_url=url)

print("ГОТОВО: икона Пасхи сохранена")
print("Cloudinary:", url)
print("Житие/праздничный текст:", len(feast.life_content or ""))
