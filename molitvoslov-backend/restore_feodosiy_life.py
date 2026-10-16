import sqlite3
from pathlib import Path
from datetime import datetime

import requests
from bs4 import BeautifulSoup

from django.conf import settings
from django.db import transaction
from api.models import CalendarFeast

URL = "https://azbyka.ru/days/sv-feodosij-pecherskij"
TARGET_IDS = (4437, 5328)

response = requests.get(
    URL,
    timeout=40,
    headers={"User-Agent": "Mozilla/5.0"}
)
response.raise_for_status()

soup = BeautifulSoup(response.text, "html.parser")

heading = next(
    (
        h for h in soup.find_all(["h2", "h3", "h4"])
        if h.get_text(" ", strip=True)
        == "Полное житие преподобного Феодосия Печерского"
    ),
    None
)

if heading is None:
    raise RuntimeError("Заголовок полного жития не найден")

container = heading.find_parent(
    "div",
    class_="expandable"
)

if container is None:
    raise RuntimeError("Контейнер полного жития не найден")

paragraphs = []

for paragraph in container.find_all("p"):
    text = paragraph.get_text(" ", strip=True)
    if text:
        paragraphs.append(text)

life = "\n\n".join(paragraphs).strip()

print("Абзацев:", len(paragraphs))
print("Символов:", len(life))
print("Начало:", repr(life[:350]))
print("Конец:", repr(life[-350:]))

if len(life) < 5000:
    raise RuntimeError("Житие подозрительно короткое")

if life.lower().count("феодос") < 5:
    raise RuntimeError("Имя Феодосия встречается слишком редко")

feasts = list(
    CalendarFeast.objects.filter(pk__in=TARGET_IDS)
)

if len(feasts) != len(TARGET_IDS):
    raise RuntimeError("Не найдены обе карточки Феодосия")

for feast in feasts:
    if "Феодосий Печерский" not in feast.title:
        raise RuntimeError(
            f"Неожиданная карточка: {feast.pk} {feast.title}"
        )

# Сохраняем извлечённый текст отдельно для проверки
output = Path("feodosiy_pecherskiy_full_life.txt")
output.write_text(life, encoding="utf-8")
print("Текст сохранён:", output)

# Создаём резервную копию
db_path = Path(settings.DATABASES["default"]["NAME"])
backup_dir = Path("backups/sqlite")
backup_dir.mkdir(parents=True, exist_ok=True)

backup_path = backup_dir / (
    "before_feodosiy_life_"
    + datetime.now().strftime("%Y%m%d_%H%M%S")
    + ".sqlite3"
)

with sqlite3.connect(str(db_path)) as source:
    with sqlite3.connect(str(backup_path)) as backup:
        source.backup(backup)

print("Резервная копия:", backup_path)

with transaction.atomic():
    for feast in feasts:
        feast.life_content = life
        feast.save(update_fields=["life_content"])
        print("Обновлено житие:", feast.pk, feast.title)

print("Житие Феодосия Печерского восстановлено.")
