#!/usr/bin/env python3
"""Safely reconcile the content_version after intentional local offline JSON edits.

This does not rebuild SQLite and does not export Django. It changes only the
top-level content_version value, after running the same content and regression
preflight checks used for a release APK. Search should be rebuilt separately by
scripts/prepare-search-index.js.

Usage:
  python -X utf8 tools/reconcile_offline_content_version_20261117.py
  python -X utf8 tools/reconcile_offline_content_version_20261117.py --apply
"""
import argparse
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "src" / "data" / "offlineContent.json"
BACKUPS = ROOT.parent / "build-backups"
TOKEN = re.compile(r'("content_version"\s*:\s*")([^"]+)(")')


def fingerprint(data):
    source = {
        key: value for key, value in data.items()
        if key not in ("schema_version", "content_version", "generated_at")
    }
    serialized = json.dumps(
        source, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(serialized).hexdigest()


def change_version_only(raw, old, new):
    matches = list(TOKEN.finditer(raw))
    if len(matches) != 1:
        raise ValueError(
            "Cannot uniquely identify content_version in original JSON; "
            "the source file has not been changed"
        )
    match = matches[0]
    if match.group(2) != old:
        raise ValueError("Actual JSON content_version does not match the parsed value")
    replaced = raw[:match.start(2)] + new + raw[match.end(2):]
    # Compare parsed payloads after removing the intentional version update.
    before = json.loads(raw)
    after = json.loads(replaced)
    if after.get("content_version") != new:
        raise ValueError("Replacement did not update content_version")
    after["content_version"] = old
    if after != before:
        raise ValueError("The proposed write changes fields other than content_version")
    return replaced


def print_summary(prefix, data):
    print(prefix + ":")
    print("  texts:", len(data.get("texts") or {}))
    for field in ("prayer_rules", "akathists", "canons"):
        block = data.get(field) or {}
        print(" ", field + ":", len(block.get("list") or []),
              "details:", len(block.get("by_slug") or {}))
    for field in ("akathists", "canons"):
        rows = list((data.get(field) or {}).get("by_slug", {}).values())
        section_count = sum(len(row.get("sections") or []) for row in rows)
        ru_count = sum(
            bool((section.get("text") or {}).get("translation"))
            for row in rows for section in (row.get("sections") or [])
        )
        cs_count = sum(
            bool((section.get("text") or {}).get("traditional_content"))
            for row in rows for section in (row.get("sections") or [])
        )
        print(" ", field, "sections:", section_count,
              "RU:", ru_count, "CS-trad:", cs_count)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true",
                        help="Write the version only after checks and backup")
    args = parser.parse_args()

    # This imports the exact release preflight validators. We intentionally do
    # not invoke rebuild_seed(), so both existing search SQLite databases remain intact.
    from prepare_offline_apk import validate_public, compare_to_prior_backups

    raw = CONTENT.read_text(encoding="utf-8-sig")
    data = json.loads(raw)
    old = str(data.get("content_version") or "")
    if not re.fullmatch(r"[0-9a-f]{64}", old):
        raise ValueError("Unexpected old content_version; no modifications made")
    actual = fingerprint(data)
    print("Stored public content_version:    ", old)
    print("Computed public content_version:  ", actual)
    print_summary("Current offline catalog", data)

    if old == actual:
        print("CONTENT VERSION ALREADY VALID; no changes needed.")
        return

    candidate = dict(data)
    candidate["content_version"] = actual
    print("Running complete offline-content and prior-backup checks...")
    validate_public(candidate)
    compare_to_prior_backups(candidate)

    proposed = change_version_only(raw, old, actual)
    # On disk only the single metadata field should change; all text is preserved.
    print("PREFLIGHT PASSED: proposed change is the content_version field only.")
    if not args.apply:
        print("DRY RUN: nothing changed. Re-run with --apply to save the valid version.")
        return

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    directory = BACKUPS / ("offline-version-reconcile-" + stamp)
    directory.mkdir(parents=True, exist_ok=False)
    backup = directory / "offlineContent.json"
    shutil.copy2(CONTENT, backup)
    if hashlib.sha256(CONTENT.read_bytes()).digest() != hashlib.sha256(backup.read_bytes()).digest():
        raise RuntimeError("Backup checksum does not match source; original file unchanged")
    target = CONTENT.with_name(".offlineContent.reconcile-" + stamp + ".tmp")
    try:
        with target.open("w", encoding="utf-8", newline="") as stream:
            stream.write(proposed)
            stream.flush()
            os.fsync(stream.fileno())
        written = json.loads(target.read_text(encoding="utf-8-sig"))
        validate_public(written)
        if fingerprint(written) != actual:
            raise ValueError("Staged JSON differs from the computed content version")
        os.replace(target, CONTENT)
        # Verify exact bytes persisted. Restore from backup if a disk error occurred.
        if CONTENT.read_text(encoding="utf-8-sig") != proposed:
            shutil.copy2(backup, CONTENT)
            raise RuntimeError("Verification after write failed; previous JSON restored")
    finally:
        if target.exists():
            target.unlink()

    print("CONTENT VERSION RECONCILED:", actual)
    print("Only top-level content_version was changed; other JSON fields preserved.")
    print("Previous JSON backup:", backup)
    print("NEXT: node scripts/prepare-search-index.js")
    print("NEXT: node scripts/prepare-search-index.js --verify-only")
    print("NEXT: node scripts/copy-search-seed.js")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("OFFLINE VERSION RECONCILE FAILED:", str(error), file=sys.stderr)
        sys.exit(1)
