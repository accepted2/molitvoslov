#!/usr/bin/env python3
"""Install the user-supplied prayer of St Philaret in Misc Prayers offline.

No remote fetch; reads only a reviewed manifest committed with this script.
Creates one standalone Russian Text + one CategoryText under "Разные молитвы".
A complete text already present elsewhere is reused, not duplicated.

  py -3.14 -X utf8 tools/import_filaret_daily_prayer_20261119.py --dry-run
  py -3.14 -X utf8 tools/import_filaret_daily_prayer_20261119.py

This changes PUBLIC offline content only. It never touches Django, user data,
personal notes, favorites, or installed APKs. Backups precede atomic writes.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile
import unicodedata
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "src" / "data" / "offlineContent.json"
SOURCE = ROOT / "tools" / "prayer_sources" / "filaret_daily_prayer_20261119.json"
BACKUPS = ROOT.parent / "build-backups"


def normalized(value):
    value = unicodedata.normalize("NFD", str(value or "").lower())
    value = "".join(ch for ch in value if unicodedata.category(ch) not in ("Mn", "Me"))
    return re.sub(r"\s+", " ", re.sub(
        r"[^a-zа-я0-9іїєґ]+", " ", value.replace("ё", "е")
    )).strip()


def canonical_version(payload):
    content = {
        key: value for key, value in payload.items()
        if key not in ("schema_version", "content_version", "generated_at")
    }
    return hashlib.sha256(json.dumps(
        content, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")).hexdigest()


def prayer_bodies(text):
    return [normalized(text.get(field) or "") for field in
            ("translation", "content", "traditional_content", "translation_uk")]


def load_prayer(source=SOURCE):
    obj = json.loads(Path(source).read_text(encoding="utf-8-sig"))
    if (obj.get("version") != 1 or
            obj.get("category_slug") != "raznye-molitvy" or
            obj.get("language") != "ru" or
            obj.get("slug") != "ezhednevnaya-molitva-svyatitelya-filareta-drozdova" or
            obj.get("title") != "Ежедневная молитва Святителя Филарета (Дроздова)" or
            not isinstance(obj.get("text"), str) or len(obj["text"]) < 450 or
            not obj["text"].startswith("Господи, не знаю чего мне просить у Тебя.") or
            not obj["text"].endswith("Сам во мне молись! Аминь.")):
        raise ValueError("Unexpected source-manifest data. Nothing modified.")
    if "\u00ad" in obj["text"]:
        raise ValueError("Soft hyphens from the scanned image must not be retained.")
    return obj


def add_to_payload(payload, source):
    """Mutate in memory only, and return an audit description.

    The existing catalog is never replaced with a partial export.
    """
    if (payload.get("schema_version") != 1 or
            not isinstance(payload.get("categories"), list) or
            not isinstance(payload.get("category_texts"), dict) or
            not isinstance(payload.get("texts"), dict)):
        raise ValueError("Unexpected public content structure. No changes made.")
    parent = next((c for c in payload["categories"]
                   if isinstance(c, dict) and c.get("slug") == source["category_slug"]), None)
    if not parent or not isinstance(parent.get("id"), int):
        raise ValueError("Missing existing Разные молитвы category. No fake category created.")
    links = payload["category_texts"].get(source["category_slug"])
    if not isinstance(links, list):
        raise ValueError("Missing existing Misc Prayers category links.")
    texts = payload["texts"]
    desired_body = normalized(source["text"])
    if len(desired_body) < 300:
        raise ValueError("Prayer source is incomplete.")
    target = texts.get(source["slug"])
    status = ""
    if target is not None:
        if desired_body not in prayer_bodies(target):
            raise ValueError("This prayer slug exists with different text; refusing overwrite.")
        status = "EXISTING_SLUG"
    else:
        duplicates = [
            row for row in texts.values()
            if isinstance(row, dict) and desired_body in prayer_bodies(row)
        ]
        if duplicates:
            # Do not create a second Text record for identical full text.
            duplicates.sort(key=lambda row: (
                "филарет" not in normalized(row.get("title", "")),
                int(row.get("id") or 0),
            ))
            target = duplicates[0]
            status = "EXACT_TEXT_REUSED"
        else:
            new_id = max(
                [int(row.get("id") or 0) for row in texts.values()
                 if isinstance(row, dict)] + [0]
            ) + 1
            target = {
                "id": new_id,
                "slug": source["slug"],
                "title": source["title"],
                "title_uk": "",
                "traditional_title": "",
                "description": "",
                "description_uk": "",
                "description_position": "after",
                "content": "",
                "traditional_content": "",
                "translation": source["text"],
                "translation_uk": "",
                "language": "ru",
                "is_visible": True,
                "categories": [parent.copy()],
            }
            texts[source["slug"]] = target
            status = "NEW_TEXT"

    slug = target.get("slug")
    target_id = int(target.get("id") or 0)
    if not slug or target_id <= 0:
        raise ValueError("Matched Text has no stable slug or ID.")
    links_matching = [row for row in links if
                      isinstance(row, dict) and
                      ((row.get("text") or {}).get("slug") == slug or
                       int((row.get("text") or {}).get("id") or 0) == target_id)]
    if len(links_matching) > 1:
        raise ValueError("Duplicate Misc Prayer links already exist for Text " + slug)
    changed = status == "NEW_TEXT"
    if not links_matching:
        all_links = payload["category_texts"]
        next_id = max([
            int(row.get("id") or 0)
            for group in all_links.values() if isinstance(group, list)
            for row in group if isinstance(row, dict)
        ] + [0]) + 1
        order = max([int(row.get("order") or 0) for row in links] + [0]) + 10
        if not isinstance(target.get("categories"), list):
            raise ValueError("Existing Text lacks categories array; refuse implicit repair.")
        if not any(int(x.get("id") or 0) == parent["id"] for x in target["categories"]):
            target["categories"].append(parent.copy())
        # Embedded text snapshots in other category links must reflect new membership.
        for group in all_links.values():
            if isinstance(group, list):
                for row in group:
                    embedded = row.get("text") or {}
                    if int(embedded.get("id") or 0) == target_id and isinstance(embedded.get("categories"), list):
                        if not any(int(x.get("id") or 0) == parent["id"] for x in embedded["categories"]):
                            embedded["categories"].append(parent.copy())
        links.append({
            "id": next_id,
            "category": parent.copy(),
            "text": target.copy(),
            "order": order,
        })
        changed = True
        status += "_LINKED"
    else:
        if int((links_matching[0].get("text") or {}).get("id") or 0) != target_id:
            raise ValueError("Linked Text ID conflicts with existing entry.")
        status += "_ALREADY_LINKED"
    return {
        "status": status,
        "slug": slug,
        "id": target_id,
        "new_content": changed,
        "count": len(texts),
        "category": parent["name"],
    }


def install(public_path=PUBLIC, source_path=SOURCE, dry_run=False):
    manifest = load_prayer(source_path)
    public_path = Path(public_path)
    original = public_path.read_bytes()
    bom = b"\xef\xbb\xbf" if original.startswith(b"\xef\xbb\xbf") else b""
    source_data = original[len(bom):].decode("utf-8")
    payload = json.loads(source_data)
    previous_version = payload.get("content_version")
    if previous_version != canonical_version(payload):
        raise RuntimeError(
            "The local content_version is already stale. Run the existing "
            "content-version check before importing; do not overwrite unverified JSON."
        )
    result = add_to_payload(payload, manifest)
    payload["content_version"] = canonical_version(payload)  # Python's canonical hash
    if result["new_content"]:
        payload["generated_at"] = datetime.now(timezone.utc).isoformat()
    # Recheck all previously preserved prayers, akathists, prayer rules.
    from prepare_offline_apk import validate_public
    validate_public(payload)

    print("FILARET IMPORT:", result)
    if not result["new_content"]:
        print("PASS: the complete prayer is already linked in Misc Prayers. NO FILES MODIFIED.")
        return result
    if dry_run:
        print("DRY RUN PASS: one prayer will be linked. NO FILES MODIFIED.")
        return result
    pretty = bool(re.search(r"^\s*\{\s*\n", source_data))
    text = (json.dumps(payload, ensure_ascii=False, indent=2 if pretty else None,
                       separators=None if pretty else (",", ":")) + "\n")
    new = bom + text.encode("utf-8")
    checked = json.loads(new.decode("utf-8-sig"))
    if checked.get("content_version") != canonical_version(checked):
        raise RuntimeError("New catalog version failed verification; no files modified.")
    if normalized(checked["texts"][result["slug"]].get("translation", "")) != normalized(manifest["text"]):
        raise RuntimeError("The prayer text changed in serialization; no files modified.")

    BACKUPS.mkdir(parents=True, exist_ok=True)
    backup = BACKUPS / (
        "offline-before-filaret-" + datetime.now().strftime("%Y%m%d_%H%M%S_%f") + ".json"
    )
    shutil.copy2(public_path, backup)
    if backup.read_bytes() != original:
        raise RuntimeError("Backup failed; the original catalog was not overwritten.")
    descriptor, temporary = tempfile.mkstemp(
        prefix=".filaret-prayer-", suffix=".tmp", dir=public_path.parent
    )
    try:
        with os.fdopen(descriptor, "wb") as file:
            file.write(new)
            file.flush()
            os.fsync(file.fileno())
        if public_path.read_bytes() != original:
            raise RuntimeError("Offline content changed concurrently. Nothing overwritten.")
        os.replace(temporary, public_path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print("PASS: Filaret's prayer added to Разные молитвы; other texts preserved.")
    print("BACKUP:", backup)
    print("NEXT: run scripts/prepare-search-index.js to regenerate the packaged search index.")
    return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    install(dry_run=args.dry_run)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("FILARET IMPORT ERROR:", error, file=sys.stderr)
        sys.exit(1)
