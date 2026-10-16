import sqlite3
from pathlib import Path
from datetime import datetime
import requests
from bs4 import BeautifulSoup

from django.conf import settings
from django.db import transaction
from api.models import CalendarFeast

source = CalendarFeast.objects.get(pk=3456)
target = CalendarFeast.objects.get(pk=5223)

assert "Стефан" in source.title
assert "Стефан" in target.title
assert source.icon_url
assert not target.icon_url

db_path = Path(settings.DATABASES["default"]["NAME"])
backup_dir = Path("backups/sqlite")
backup_dir.mkdir(parents=True, exist_ok=True)
backup_path = backup_dir / (
    "before_august_final_"
    + datetime.now().strftime("%Y%m%d_%H%M%S")
    + ".sqlite3"
)

with sqlite3.connect(str(db_path)) as src:
    with sqlite3.connect(str(backup_path)) as dst:
        src.backup(dst)

with transaction.atomic():
    target.icon_url = source.icon_url
    target.save(update_fields=["icon_url"])

print("Икона 15 августа восстановлена.")
print("Резервная копия:", backup_path)
print("Икона:", target.icon_url)

print("\n=== ИСТОЧНИК ЖИТИЯ ФЕОДОСИЯ ===")
url = "https://azbyka.ru/days/sv-feodosij-pecherskij"

try:
    response = requests.get(
        url, timeout=25,
        headers={"User-Agent": "Mozilla/5.0"}
    )
    print("HTTP:", response.status_code)
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")

    for heading in soup.find_all(
        ["h1", "h2", "h3", "h4", "h5"]
    ):
        title = heading.get_text(" ", strip=True)
        if "житие" in title.lower() and "Феодос" in title:
            print("Заголовок:", title)
            print("HTML:", str(heading)[:600])

except requests.RequestException as exc:
    print("Не удалось получить HTML:", exc)

print("\n=== ДОСТУПНЫЕ КОДЫ ПОСТА ===")
from api.models import CalendarDay

codes = (
    CalendarDay.objects.exclude(fast_type_code="")
    .values_list("fast_type_code", flat=True)
    .distinct()
)

print(sorted(codes))
