import os
import re
from pathlib import Path

print("=== DJANGO_SETTINGS_MODULE ===")

manage = Path("manage.py").read_text(encoding="utf-8-sig")
match = re.search(
    r'setdefault\(["\']DJANGO_SETTINGS_MODULE["\'],\s*["\']([^"\']+)',
    manage
)

print("Модуль:", match.group(1) if match else "Не определён")

print("\n=== CLOUDINARY В .env ===")

path = Path(".env")

if path.exists():
    names = set()

    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()

        if not line or line.startswith("#") or "=" not in line:
            continue

        key = line.split("=", 1)[0].strip()
        names.add(key)

    for key in (
        "CLOUDINARY_URL",
        "CLOUD_NAME",
        "CLOUD_API_KEY",
        "CLOUD_API_SECRET",
        "CLOUDINARY_CLOUD_NAME",
        "CLOUDINARY_API_KEY",
        "CLOUDINARY_API_SECRET",
    ):
        print(key, ":", "ЕСТЬ" if key in names else "НЕТ")
else:
    print(".env отсутствует")

print("\n=== НАСТРОЙКИ ИМПОРТЁРА ===")

source = Path(
    "api/management/commands/import_azbyka_calendar_day.py"
)

for number, line in enumerate(
    source.read_text(encoding="utf-8-sig").splitlines(), 1
):
    if (
        "CLOUDINARY" in line.upper()
        or "CLOUD_NAME" in line.upper()
        or "CLOUD_API_KEY" in line.upper()
        or "CLOUD_API_SECRET" in line.upper()
    ):
        print(f"{number}: {line.strip()[:180]}")
