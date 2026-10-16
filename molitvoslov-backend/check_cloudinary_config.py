import os
from pathlib import Path

print("=== .env ===")
print("Файл существует:", Path(".env").exists())

try:
    from dotenv import dotenv_values

    config = dotenv_values(".env")
except ImportError:
    config = {}
    print("python-dotenv не установлен")

print("\n=== ПЕРЕМЕННЫЕ CLOUDINARY ===")

for name in (
    "CLOUDINARY_URL",
    "CLOUD_NAME",
    "CLOUD_API_KEY",
    "CLOUD_API_SECRET",
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
):
    print(name, "| .env:", bool(config.get(name)), "| окружение:", bool(os.environ.get(name)))

print("\n=== НАСТРОЙКИ DJANGO ===")

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

try:
    import django

    django.setup()
    from django.conf import settings

    for name in (
        "CLOUDINARY_STORAGE",
        "CLOUD_NAME",
        "CLOUD_API_KEY",
        "CLOUD_API_SECRET",
    ):
        value = getattr(settings, name, None)
        print(name, "| задано:", bool(value))
except Exception as exc:
    print("Ошибка загрузки настроек:", type(exc).__name__, str(exc))
