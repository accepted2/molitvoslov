#!/usr/bin/env python3
"""Prepare an audited Akathist batch, or merge its new items into offline JSON.

The merge is deliberately additive: it does NOT replace other text collections,
prayer rules, existing Akathists, their sections, or local personal data.
Use the existing create-only Django importer for actual database writes.
"""
import argparse
import copy
import hashlib
import json
import os
import shutil
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

SOURCE = "https://azbyka.ru/molitvoslov/akafisty-v-pravoslavnom-kalendare.html"


def read_json(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8-sig"))
    except (OSError, ValueError) as exc:
        raise ValueError(f"Не удалось прочитать JSON {path}: {exc}") from exc


def verified(item):
    if not isinstance(item, dict):
        return False
    checks = item.get("checks") or {}
    return (
        item.get("status") == "checked"
        and checks.get("kontakia") == 13
        and checks.get("ikoses") == 12
        and len(str(item.get("content_sha256", ""))) == 64
        and isinstance(item.get("slug"), str)
        and bool(item.get("slug"))
    )


def write_json_atomic(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + ".tmp")
    with temp.open("w", encoding="utf-8", newline="\n") as output:
        json.dump(value, output, ensure_ascii=False, indent=2)
        output.write("\n")
    os.replace(temp, path)


def prepare(args):
    audit = read_json(args.audit)
    if audit.get("source") != SOURCE or len(audit.get("pages", {})) < 100:
        raise ValueError("Неизвестный источник или неполный аудит.")
    entries = list(audit["pages"].values())
    selected = [item["slug"] for item in entries if verified(item)]
    if len(set(selected)) != len(selected):
        raise ValueError("В аудите обнаружены повторяющиеся slug.")
    if not selected:
        raise ValueError("Нет успешно проверенных акафистов.")
    write_json_atomic(args.output, selected)
    statuses = Counter(item.get("status", "unknown") for item in entries)
    print(f"Аудит: {len(entries)} страниц; статусы: {dict(statuses)}")
    print(f"Список успешно проверенных для create-only импорта: {len(selected)}")
    print(f"Манифест: {args.output}")
    print("Это только список разрешённых к рассмотрению записей; Django и APK не изменены.")


def verify_detail(detail):
    if not isinstance(detail, dict):
        return False
    sections = detail.get("sections")
    if not isinstance(sections, list):
        return False
    kontakion_numbers = set()
    ikos_numbers = set()
    for section in sections:
        if not isinstance(section, dict):
            return False
        name = section.get("section_type")
        number = section.get("number")
        if name not in ("kontakion", "ikos", "prayer"):
            return False
        if name == "kontakion":
            kontakion_numbers.add(number)
        elif name == "ikos":
            ikos_numbers.add(number)
        text_obj = section.get("text")
        if not isinstance(text_obj, dict) or not str(text_obj.get("content") or "").strip():
            return False
    return (
        kontakion_numbers == set(range(1, 14))
        and ikos_numbers == set(range(1, 13))
    )


def content_fingerprint(payload):
    content = {
        key: value for key, value in payload.items()
        if key not in ("schema_version", "content_version", "generated_at")
    }
    serialized = json.dumps(
        content, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(serialized).hexdigest()


def akathist_index(payload):
    block = payload.get("akathists")
    if not isinstance(block, dict):
        raise ValueError("В offline JSON отсутствует каталог акафистов.")
    entries = block.get("list")
    details = block.get("by_slug")
    if not isinstance(entries, list) or not isinstance(details, dict):
        raise ValueError("Некорректная структура списка/by_slug акафистов.")
    index = {}
    ids = set()
    for item in entries:
        if not isinstance(item, dict) or not item.get("slug"):
            raise ValueError("Некорректная запись списка акафистов.")
        slug = item["slug"]
        if slug in index or slug not in details:
            raise ValueError("Несогласованный список и by_slug: " + str(slug))
        if item.get("id") != details[slug].get("id"):
            raise ValueError("ID списка и карточки не совпадают: " + slug)
        if item.get("id") in ids:
            raise ValueError("Повтор ID акафиста в существующем JSON.")
        ids.add(item.get("id"))
        index[slug] = item
    if set(index) != set(details):
        raise ValueError("В by_slug есть акафисты без списка или наоборот.")
    return index


def next_available(used, floor=100_000_000):
    num = max([floor - 1] + [x for x in used if isinstance(x, int)]) + 1
    used.add(num)
    return num


def merge(args):
    current_path = Path(args.existing).resolve()
    stage = read_json(args.staged)
    existing = read_json(current_path)
    report = read_json(args.report)
    if report.get("source") != SOURCE or not isinstance(report.get("pages"), dict):
        raise ValueError("Отчёт импорта не от проверенного источника.")
    if existing.get("schema_version") != stage.get("schema_version"):
        raise ValueError("Версии схемы offline JSON различаются.")
    if existing.get("schema_version") != 1:
        raise ValueError("Неподдерживаемая версия схемы offline JSON.")
    current_index = akathist_index(existing)
    stage_index = akathist_index(stage)
    before = copy.deepcopy(existing)
    imported = {
        item.get("slug") for item in report["pages"].values()
        if isinstance(item, dict) and item.get("status") == "imported" and item.get("slug")
    }
    if not imported:
        print("В отчёте нет успешно импортированных записей; JSON не изменён.")
        return
    missing = imported - set(stage_index)
    if missing:
        raise ValueError("Импортированные акафисты отсутствуют в экспорте Django: "
                         + ", ".join(sorted(missing)[:8]))
    new_slugs = sorted(imported - set(current_index))
    print(f"В текущем JSON: {len(current_index)} акафистов")
    print(f"В отчёте Django: {len(imported)} успешно импортированных")
    print(f"Новых для добавления в JSON: {len(new_slugs)}")
    if not new_slugs:
        print("Все импортированные акафисты уже в JSON. Перезапись не требуется.")
        return

    used_akathist_ids = {item.get("id") for item in current_index.values()}
    used_section_ids = set()
    used_text_ids = set()
    for detail in existing["akathists"]["by_slug"].values():
        for section in detail.get("sections", []):
            used_section_ids.add(section.get("id"))
            used_text_ids.add((section.get("text") or {}).get("id"))
        for key in ("troparion", "kontakion_before"):
            if isinstance(detail.get(key), dict):
                used_text_ids.add(detail[key].get("id"))
    for text_obj in (existing.get("texts") or {}).values():
        if isinstance(text_obj, dict):
            used_text_ids.add(text_obj.get("id"))
    for entry in (existing.get("canons") or {}).get("by_slug", {}).values():
        for section in entry.get("sections", []):
            used_text_ids.add((section.get("text") or {}).get("id"))

    # Avoid ID collisions even when the existing offline JSON contains
    # additional user-curated Akathists missing from this Django database.
    reused_text_ids = {}
    for slug in new_slugs:
        row = copy.deepcopy(stage_index[slug])
        detail = copy.deepcopy(stage["akathists"]["by_slug"][slug])
        if not verify_detail(detail):
            raise ValueError("Неполные 13 кондаков / 12 икосов в Django: " + slug)
        if row.get("slug") != slug or detail.get("slug") != slug:
            raise ValueError("Slug не совпадает для " + slug)
        raw_id = row.get("id")
        if not isinstance(raw_id, int) or raw_id <= 0 or raw_id != detail.get("id"):
            raise ValueError("Некорректный ID акафиста: " + slug)
        if raw_id in used_akathist_ids:
            raw_id = next_available(used_akathist_ids)
        else:
            used_akathist_ids.add(raw_id)
        row["id"] = raw_id
        detail["id"] = raw_id
        for section in detail["sections"]:
            sid = section.get("id")
            if not isinstance(sid, int) or sid <= 0:
                raise ValueError("Некорректный ID раздела: " + slug)
            if sid in used_section_ids:
                section["id"] = next_available(used_section_ids)
            else:
                used_section_ids.add(sid)
            text_obj = section["text"]
            tid = text_obj.get("id")
            if not isinstance(tid, int) or tid <= 0:
                raise ValueError("Некорректный ID текста: " + slug)
            if tid in reused_text_ids:
                text_obj["id"] = reused_text_ids[tid]
            elif tid in used_text_ids:
                fresh = next_available(used_text_ids)
                reused_text_ids[tid] = fresh
                text_obj["id"] = fresh
            else:
                used_text_ids.add(tid)
                reused_text_ids[tid] = tid
        for key in ("troparion", "kontakion_before"):
            text_obj = detail.get(key)
            if not isinstance(text_obj, dict):
                continue
            tid = text_obj.get("id")
            if not isinstance(tid, int) or tid <= 0:
                raise ValueError("Некорректный ID дополнительного текста: " + slug)
            if tid in reused_text_ids:
                text_obj["id"] = reused_text_ids[tid]
            elif tid in used_text_ids:
                fresh = next_available(used_text_ids)
                reused_text_ids[tid] = fresh
                text_obj["id"] = fresh
            else:
                used_text_ids.add(tid)
                reused_text_ids[tid] = tid
        existing["akathists"]["list"].append(row)
        existing["akathists"]["by_slug"][slug] = detail

    after_index = akathist_index(existing)
    if len(after_index) != len(current_index) + len(new_slugs):
        raise ValueError("Ошибка количества акафистов после объединения.")
    for slug in current_index:
        if existing["akathists"]["by_slug"][slug] != before["akathists"]["by_slug"][slug]:
            raise ValueError("Попытка изменить уже существующий акафист: " + slug)
    for key in before:
        if key in ("akathists", "generated_at", "content_version"):
            continue
        if before[key] != existing[key]:
            raise ValueError("Неожиданное изменение данных вне акафистов: " + key)
    existing["generated_at"] = datetime.now(timezone.utc).isoformat()
    existing["content_version"] = content_fingerprint(existing)
    print("Сохранено без изменений: все прежние акафисты, молитвы, правила и другие разделы.")
    print("Новые акафисты:")
    for slug in new_slugs[:12]:
        print("  + " + slug)
    if len(new_slugs) > 12:
        print(f"  ...ещё {len(new_slugs) - 12}")
    if not args.apply:
        print("ПРОВЕРКА: JSON не изменён. Передайте --apply для сохранения.")
        return

    backup_dir = Path(args.backup_dir).resolve()
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    backup_path = backup_dir / ("offlineContent-before-akathists-" + stamp + ".json")
    shutil.copy2(current_path, backup_path)
    if not backup_path.is_file() or backup_path.stat().st_size == 0:
        raise ValueError("Не удалось создать резервную копию offline JSON.")
    write_json_atomic(current_path, existing)
    check = read_json(current_path)
    if content_fingerprint(check) != check.get("content_version"):
        raise ValueError("Ошибка контрольной суммы записанного offline JSON.")
    if len(akathist_index(check)) != len(after_index):
        raise ValueError("Ошибка проверки объединённого файла.")
    print(f"ДОБАВЛЕНО В OFFLINE JSON: {len(new_slugs)}")
    print(f"Резервная копия: {backup_path}")
    print(f"Готовый файл: {current_path}")
    print("Поисковый индекс НЕ изменён — обновите его отдельно перед выпуском APK.")


def repair(args):
    """Patch only exact previously-imported text values in the current APK JSON."""
    path = Path(args.existing).resolve()
    data = read_json(path)
    before = copy.deepcopy(data)
    patch = read_json(args.patch)
    if patch.get("source") != SOURCE or not isinstance(patch.get("changes"), list):
        raise ValueError("Неизвестный источник или некорректный формат исправления.")
    index = akathist_index(data)
    counts = Counter()
    for item in patch["changes"]:
        slug = item.get("slug")
        if slug not in index:
            counts["not_in_offline"] += 1
            continue
        detail = data["akathists"]["by_slug"][slug]
        if detail.get("id") != item.get("akathist_id"):
            raise ValueError("ID акафиста не совпал: " + slug)
        for correction in item.get("sections", []):
            section_type = correction.get("section_type")
            number = correction.get("number")
            if section_type in ("troparion", "kontakion_before"):
                target = detail.get(section_type)
                if not isinstance(target, dict):
                    raise ValueError("Не найден дополнительный текст " + slug)
                texts = [target]
            else:
                texts = [
                    row.get("text") for row in detail.get("sections", [])
                    if row.get("section_type") == section_type and row.get("number") == number
                ]
                if not texts or any(not isinstance(text, dict) for text in texts):
                    raise ValueError("Нет раздела для исправления " + slug)
            old = (correction["old_content"], correction["old_translation"])
            new = (correction["new_content"], correction["new_translation"])
            for text in texts:
                current = (text.get("content", ""), text.get("translation", ""))
                if current != old and current != new:
                    raise ValueError(
                        "Локальный текст изменён вручную; не перезаписываем: %s %s %s"
                        % (slug, section_type, number)
                    )
                if current == old and current != new:
                    text["content"], text["translation"] = new
                    counts["updated_sections"] += 1
                else:
                    counts["already_updated"] += 1
        counts["akathists"] += 1
    for key in before:
        if key in ("akathists", "generated_at", "content_version"):
            continue
        if before[key] != data[key]:
            raise ValueError("Обнаружена попытка изменения посторонних молитв: " + key)
    for slug in index:
        if all(row.get("slug") != slug for row in patch["changes"]):
            if data["akathists"]["by_slug"][slug] != before["akathists"]["by_slug"][slug]:
                raise ValueError("Неожиданное изменение другого акафиста: " + slug)
    if not counts["updated_sections"]:
        print("Нет изменений для offline JSON: " + str(dict(counts)))
        return
    data["generated_at"] = datetime.now(timezone.utc).isoformat()
    data["content_version"] = content_fingerprint(data)
    print("Акафистов в патче: %s; исправлено частей: %s; уже исправлено: %s"
          % (counts["akathists"], counts["updated_sections"], counts["already_updated"]))
    if not args.apply:
        print("ПРОВЕРКА: offline JSON не изменён.")
        return
    backup_dir = Path(args.backup_dir).resolve()
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    backup_path = backup_dir / ("offlineContent-before-akathist-repair-" + stamp + ".json")
    shutil.copy2(path, backup_path)
    if not backup_path.exists() or not backup_path.stat().st_size:
        raise ValueError("Не удалось сохранить копию offline JSON.")
    write_json_atomic(path, data)
    persisted = read_json(path)
    if content_fingerprint(persisted) != persisted.get("content_version"):
        raise ValueError("Контрольная сумма исправленного JSON неверна.")
    if len(akathist_index(persisted)) != len(index):
        raise ValueError("Изменилось количество акафистов.")
    print("Исправленный offline JSON: " + str(path))
    print("Резервная копия: " + str(backup_path))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="operation", required=True)
    prep = sub.add_parser("prepare", help="Составить список проверенных slug.")
    prep.add_argument("--audit", required=True)
    prep.add_argument("--output", required=True)
    prep.set_defaults(func=prepare)
    join = sub.add_parser("merge", help="Добавить только импортированные акафисты в offline JSON.")
    join.add_argument("--existing", required=True)
    join.add_argument("--staged", required=True)
    join.add_argument("--report", required=True)
    join.add_argument("--backup-dir", required=True)
    join.add_argument("--apply", action="store_true")
    join.set_defaults(func=merge)
    fix = sub.add_parser("repair", help="Исправить только подтверждённые старые значения в offline JSON.")
    fix.add_argument("--existing", required=True)
    fix.add_argument("--patch", required=True)
    fix.add_argument("--backup-dir", required=True)
    fix.add_argument("--apply", action="store_true")
    fix.set_defaults(func=repair)
    args = parser.parse_args()
    try:
        args.func(args)
    except (ValueError, TypeError, KeyError) as exc:
        parser.exit(1, "ОСТАНОВЛЕНО БЕЗ ПЕРЕЗАПИСИ: " + str(exc) + "\n")


if __name__ == "__main__":
    main()
