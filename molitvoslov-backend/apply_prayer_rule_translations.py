import json
from pathlib import Path
from django.db import transaction
from api.models import Text

JSON_PATH = Path("prayer_rules_translation_ready.json")

if not JSON_PATH.exists():
    raise SystemExit(f"Не найден файл: {JSON_PATH.resolve()}")

rows = json.loads(JSON_PATH.read_text(encoding="utf-8"))

updated = 0
unchanged = 0
missing = []
content_mismatch = []

with transaction.atomic():
    for row in rows:
        text_id = row["id"]
        expected_content = row["content"]
        translation = (row.get("translation") or "").strip()

        if not translation:
            raise RuntimeError(f"Пустой translation для Text ID {text_id}")

        try:
            obj = Text.objects.get(pk=text_id)
        except Text.DoesNotExist:
            missing.append(text_id)
            continue

        # Не обновляем не ту запись, если локальная БД уже отличается от экспортированной.
        if (obj.content or "") != expected_content:
            content_mismatch.append(text_id)
            continue

        if (obj.translation or "").strip() == translation:
            unchanged += 1
            continue

        obj.translation = translation
        obj.save(update_fields=["translation"])
        updated += 1

    if missing or content_mismatch:
        transaction.set_rollback(True)

if missing or content_mismatch:
    print("ОТМЕНЕНО: база не совпадает с экспортом.")
    print("Отсутствуют ID:", missing or "нет")
    print("Не совпал content у ID:", content_mismatch or "нет")
else:
    print("Готово.")
    print("Обновлено:", updated)
    print("Уже совпадало:", unchanged)
    print("Всего в JSON:", len(rows))
