#!/usr/bin/env python3
"""Safely remove source lectionary notes from the *local* traditional CSL Bible.

Example from molitvoslov-app:
    python -X utf8 tools/clean_offline_csl_lectionary.py --check
    python -X utf8 tools/clean_offline_csl_lectionary.py --apply

The real scriptural words stay unchanged. --apply backs up the JSON first,
then atomically updates only verses with "**(Зача́ло N)**"/"**(Заⷱ҇ N)**".
The Synodal Bible, offlineContent.json, database, IDs and bookmarks are
left untouched. User's local bundled JSON is authoritative.
"""
import argparse
import hashlib
import json
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path

from csl_lectionary_markers import strip_lectionary_annotations

APP_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_BUNDLE = APP_ROOT / "src/data/offlineBibleCslTraditional.json"


def digest(payload):
    source = {key: value for key, value in payload.items() if key != "content_version"}
    compact = json.dumps(source, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(compact.encode("utf-8")).hexdigest()


def clean_bundle(payload):
    if payload.get("translation", {}).get("code") != "csl_traditional":
        raise ValueError("Файл не является церковнославянской Библией (csl_traditional)")
    books = payload.get("books")
    if not isinstance(books, list) or len(books) != 77:
        raise ValueError("Ожидаются 77 книг ЦС-Библии; неполный файл не изменяем")

    edits = []
    count = 0
    verses_scanned = 0
    for book in books:
        code = book.get("code", "")
        for chapter in book.get("chapters", []):
            number = chapter.get("number")
            for verse in chapter.get("verses", []):
                verses_scanned += 1
                old = verse.get("text")
                if not isinstance(old, str):
                    raise ValueError(f"Неверный текст стиха {code} {number}:{verse.get('number')}")
                new, removed = strip_lectionary_annotations(old)
                if not removed:
                    continue
                if not new.strip() or "\ufffd" in new:
                    raise ValueError(f"Повреждён стих {code} {number}:{verse.get('number')}")
                verse["text"] = new
                count += removed
                edits.append(f"{code} {number}:{verse.get('number')} ({removed})")
    return {"markers_removed": count, "verses_updated": len(edits),
            "verses_scanned": verses_scanned, "sample": edits[:18]}


def write_bundle(bundle, payload, expected_original):
    backup_base = (
        Path(r"C:\m\build-backups") if os.name == "nt"
        else APP_ROOT / ".csl-bible-backups"
    )
    backup_base.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    backup = backup_base / ("offlineBibleCslTraditional-before-markers-" + stamp + ".json")
    if bundle.read_bytes() != expected_original:
        raise ValueError("Файл изменился во время проверки; запись отменена")
    shutil.copy2(bundle, backup)
    if backup.read_bytes() != expected_original:
        raise ValueError("Ошибка резервной копии; запись отменена")

    bundle.parent.mkdir(parents=True, exist_ok=True)
    temp = bundle.with_name(bundle.name + ".new-tmp")
    try:
        temp.write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8",
        )
        with temp.open(encoding="utf-8") as stream:
            reread = json.load(stream)
        if digest(reread) != reread.get("content_version"):
            raise ValueError("Контрольная сумма не совпадает; запись отменена")
        if bundle.read_bytes() != expected_original:
            raise ValueError("Исходный файл изменился; запись отменена")
        os.replace(temp, bundle)
    finally:
        if temp.exists():
            temp.unlink()
    return backup


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--apply", action="store_true")
    parser.add_argument("--file", type=Path, default=DEFAULT_BUNDLE)
    args = parser.parse_args()
    bundle = args.file.resolve()
    if not bundle.is_file():
        parser.error(f"Не найден файл {bundle}")
    try:
        raw = bundle.read_bytes()
        data = json.loads(raw.decode("utf-8-sig"))
        before_count = sum(
            len(ch.get("verses", []))
            for book in data.get("books", []) for ch in book.get("chapters", [])
        )
        report = clean_bundle(data)
        print("Книг:", len(data["books"]), "| Стихов:", report["verses_scanned"])
        print("Удаляемых помет зачал:", report["markers_removed"],
              "| Затронутых стихов:", report["verses_updated"])
        print("Примеры:", ", ".join(report["sample"]))

        if before_count != report["verses_scanned"] or report["verses_scanned"] < 36000:
            raise ValueError("Количество стихов не прошло проверку")
        if args.check or not report["markers_removed"]:
            print("ПРОВЕРКА: исходный JSON не изменён."
                  if args.check else "Помет больше нет. Повторная запись не требуется.")
            return
        data["content_version"] = digest(data)
        backup = write_bundle(bundle, data, raw)
        print("ИСПРАВЛЕНО: удалены только служебные пометы.")
        print("Резервная копия:", backup)
        print("Обновлён:", bundle)
        print("Синодальная Библия и все остальные разделы НЕ изменены.")
    except (OSError, ValueError, TypeError, UnicodeDecodeError) as exc:
        parser.exit(1, "ОСТАНОВЛЕНО: " + str(exc) + "\n")


if __name__ == "__main__":
    main()
