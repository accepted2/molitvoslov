#!/usr/bin/env python3
"""Promote a complete LOCAL Django public snapshot into the APK JSON.

Read ONLY the configured local SQLite-backed Django source. Never call a remote
server, never delete user content, and never overwrite offlineContent.json
unless every previously bundled public identity is still present.
Modified texts and newly published texts are allowed and reported.
"""
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path

from restore_misc_prayers import validate_offline_snapshot
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
BACKEND = Path(r"C:\m\repo\molitvoslov-backend")
MANAGE = BACKEND / "manage.py"
PYTHON = BACKEND / "venv" / "Scripts" / "python.exe"
CURRENT = ROOT / "src" / "data" / "offlineContent.json"
BACKUP_ROOT = ROOT.parent / "build-backups"
TARGET = "akafist-bogoroditse-izbavlenie-ot-bed-strazhdushchikh"
TEST = "test-ota-sync-2026"


def load(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def slug_map(snapshot, section):
    listing = snapshot.get(section, {}).get("list")
    details = snapshot.get(section, {}).get("by_slug")
    if not isinstance(listing, list) or not isinstance(details, dict):
        raise RuntimeError("Invalid " + section + " section in offline payload")
    keys = [str(item.get("slug", "")) for item in listing]
    if len(keys) != len(set(keys)) or not all(keys):
        raise RuntimeError("Duplicate or empty " + section + " slugs")
    if any(k not in details for k in keys):
        raise RuntimeError("Missing details for " + section)
    return {str(item["slug"]): item for item in listing}


def canonical_hash(snapshot):
    body = {key: value for key, value in snapshot.items()
            if key not in ("schema_version", "generated_at", "content_version")}
    return hashlib.sha256(json.dumps(
        body, ensure_ascii=False, sort_keys=True,
        separators=(",", ":")
    ).encode("utf-8")).hexdigest()


def ensure_valid(snapshot):
    if int(snapshot.get("schema_version", 0)) != 1:
        raise RuntimeError("Unsupported offline content schema")
    if canonical_hash(snapshot) != snapshot.get("content_version"):
        raise RuntimeError("The content_version checksum does not match public content")
    akathists = slug_map(snapshot, "akathists")
    for section in ("canons", "prayer_rules"):
        slug_map(snapshot, section)
    if not isinstance(snapshot.get("texts"), dict):
        raise RuntimeError("No public text catalog")
    if TEST in akathists:
        raise RuntimeError("TEST OTA sync akathist would be included in the APK")
    return akathists


def original_keys(snapshot, section):
    if section in ("akathists", "canons", "prayer_rules"):
        return set(slug_map(snapshot, section))
    if section == "texts":
        return set(snapshot.get("texts", {}))
    if section == "psalters":
        return set(snapshot.get("psalters", {}).get("by_slug", {}))
    if section == "kathismas":
        return set(snapshot.get("kathismas", {}).get("by_number", {}))
    if section == "categories":
        return {str(v.get("slug", "")) for v in snapshot.get("categories", [])}
    if section == "category_texts":
        return set(snapshot.get("category_texts", {}))
    if section == "app_assets":
        return set(snapshot.get("app_assets", {}))
    return set()


def compare_without_loss(old, new):
    for section in (
        "akathists", "canons", "prayer_rules", "texts", "psalters",
        "kathismas", "categories", "category_texts", "app_assets",
    ):
        missing = original_keys(old, section) - original_keys(new, section)
        if missing:
            sample = ", ".join(sorted(missing)[:12])
            raise RuntimeError(
                "REFUSING DATA LOSS: " + section + " has " + str(len(missing)) +
                " missing entries in Django export: " + sample
            )
    # Existing category-text relationships and prayer rule items are not
    # compared structurally: deliberate editing is allowed. Missing top-level
    # identities, however, always block promotion.
    before_a = slug_map(old, "akathists")
    after_a = slug_map(new, "akathists")
    changes = {}
    for section in ("akathists", "canons", "prayer_rules", "texts"):
        previous = original_keys(old, section)
        latest = original_keys(new, section)
        changes[section + "_added"] = len(latest - previous)
    changes["akathists_added_titles"] = [
        after_a[k].get("title", k) for k in sorted(set(after_a) - set(before_a))
    ]
    changes["texts_changed"] = sum(
        old["texts"].get(k) != new["texts"].get(k)
        for k in set(old.get("texts", {})) & set(new.get("texts", {}))
    )
    changes["akathists_changed"] = sum(
        before_a.get(k) != after_a.get(k) or
        old["akathists"]["by_slug"].get(k) != new["akathists"]["by_slug"].get(k)
        for k in set(before_a) & set(after_a)
    )
    return changes


def run_export(candidate):
    result = subprocess.run(
        [str(PYTHON), "-X", "utf8", str(MANAGE),
         "export_mobile_content", "--output", str(candidate)],
        cwd=BACKEND, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, encoding="utf-8", errors="replace",
        env={**os.environ, "PYTHONIOENCODING": "utf-8"},
    )
    if result.stdout.strip():
        print(result.stdout.strip())
    if result.returncode:
        raise RuntimeError("Django offline export failed: " + result.stderr[-2200:])
    if not candidate.is_file():
        raise RuntimeError("Django did not create the offline candidate")


def main():
    if not all(p.is_file() for p in (PYTHON, MANAGE, CURRENT)):
        raise RuntimeError("Missing local Django or bundled offlineContent.json")
    # The exporter repair module validates local SQLite identity and compares
    # its direct ORM queries with the actual output in the same process.
    from repair_local_mobile_export import check
    diagnostics = check()
    if diagnostics["missing_from_export"] or diagnostics["extra_in_export"]:
        raise RuntimeError("Local Django exporter still excludes published akathists")
    old = load(CURRENT)
    old_akathists = ensure_valid(old)
    BACKUP_ROOT.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    candidate = BACKUP_ROOT / ("offline-django-apk-candidate-" + stamp + ".json")
    run_export(candidate)
    new = load(candidate)
    new_akathists = ensure_valid(new)
    validate_offline_snapshot(new)
    if TARGET not in new_akathists or not new_akathists[TARGET].get("is_visible"):
        raise RuntimeError("APK would omit the published 'Избавление от бед страждущих'")
    sections = new["akathists"]["by_slug"][TARGET].get("sections", [])
    if len(sections) not in (26, 28):
        raise RuntimeError("APK would contain an incomplete 'Избавление от бед страждущих'")
    if len(new_akathists) != len(diagnostics["visible"]):
        raise RuntimeError("Django exported an unexpected count of published akathists")
    if set(new_akathists) != set(diagnostics["visible"]):
        raise RuntimeError("Django exported different akathists than the local SQLite ORM")
    if len(new["texts"]) != diagnostics["exported_text_count"]:
        raise RuntimeError("Django exported a different text count than the verified SQLite source")
    if len(new["texts"]) != diagnostics["visible_text_count"]:
        raise RuntimeError("Django failed to bundle all visible local prayer texts")
    changes = compare_without_loss(old, new)
    print("Previous offline JSON:", len(old_akathists), "akathists;",
          len(old["texts"]), "texts")
    print("Current Django export:", len(new_akathists), "akathists;",
          len(new["texts"]), "texts")
    print("PUBLIC CONTENT CHANGES:", json.dumps(changes, ensure_ascii=False))
    if old.get("content_version") == new.get("content_version"):
        print("Already current: same content_version; no JSON write.")
        print("LOCAL APK PUBLIC SNAPSHOT VERIFIED")
        return
    backup = BACKUP_ROOT / ("offline-before-django-promote-" + stamp + ".json")
    shutil.copy2(CURRENT, backup)
    temp = CURRENT.with_name(".offlineContent.django.tmp")
    try:
        shutil.copyfile(candidate, temp)
        os.replace(temp, CURRENT)
    finally:
        if temp.exists():
            temp.unlink()
    if canonical_hash(load(CURRENT)) != new["content_version"]:
        raise RuntimeError("APK offline JSON checksum failed after replacement")
    print("SAVED BACKUP:", backup)
    print("APK PUBLIC JSON UPDATED:", CURRENT)
    print("LOCAL APK PUBLIC SNAPSHOT VERIFIED")



if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("LOCAL APK PUBLIC SNAPSHOT FAILED:", error, file=sys.stderr)
        sys.exit(1)
