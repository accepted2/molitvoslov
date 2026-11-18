#!/usr/bin/env python3
"""Repair ONLY the stale SHA256 metadata of the local offline content bundle.

This is not a Django export. No catalog entries, prayer text, category IDs,
saved data, or other JSON bytes are rewritten. Requires complete content
validation before writing. A byte-exact backup is created first.

  python -X utf8 tools/refresh_offline_content_version_20261118.py --dry-run
  python -X utf8 tools/refresh_offline_content_version_20261118.py
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
from datetime import datetime

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "src" / "data" / "offlineContent.json"
BACKUPS = ROOT.parent / "build-backups"
VERSION_FIELD = re.compile(rb'("content_version"\s*:\s*")([0-9a-fA-F]{64})(")')


def canonical_version(data):
    content = {
        key: value for key, value in data.items()
        if key not in ("schema_version", "content_version", "generated_at")
    }
    return hashlib.sha256(json.dumps(
        content, sort_keys=True, ensure_ascii=False, separators=(",", ":")
    ).encode("utf-8")).hexdigest()


def patch_version_only(original):
    data = json.loads(original.decode("utf-8-sig"))
    if not isinstance(data, dict) or data.get("schema_version") != 1:
        raise RuntimeError("Unexpected offlineContent.json schema. No files modified.")
    existing = data.get("content_version")
    if not isinstance(existing, str) or not re.fullmatch("[0-9a-fA-F]{64}", existing):
        raise RuntimeError("Missing or invalid content_version. No files modified.")

    expected = canonical_version(data)
    matches = list(VERSION_FIELD.finditer(original))
    if len(matches) != 1 or matches[0].group(2).decode("ascii") != existing:
        raise RuntimeError(
            "Content version cannot be located uniquely in original file. "
            "No files modified."
        )
    match = matches[0]
    updated = (
        original[:match.start(2)] + expected.encode("ascii") + original[match.end(2):]
    )
    verified = json.loads(updated.decode("utf-8-sig"))
    if verified.get("content_version") != expected:
        raise RuntimeError("Version verification failed. No files modified.")
    stripped = lambda row: {k: v for k, v in row.items() if k != "content_version"}
    if stripped(data) != stripped(verified):
        raise RuntimeError("Non-version data changed. No files modified.")
    return updated, data, verified, existing, expected


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if not SOURCE.is_file():
        raise RuntimeError("Local bundled public catalog is missing: " + str(SOURCE))
    before = SOURCE.read_bytes()
    after, old_data, checked_data, old_version, expected = patch_version_only(before)
    print("CURRENT VERSION:", old_version)
    print("ACTUAL CONTENT:", expected)

    # The existing release guard verifies the whole public catalog and
    # five protected prayers. It is deliberately NOT bypassed here.
    from prepare_offline_apk import validate_public
    validate_public(checked_data)

    if before == after:
        print("PASS: content_version already matches the exact local JSON. No changes.")
        return
    if args.dry_run:
        print("DRY RUN PASS: would update only the 64-byte version field.")
        print("NO FILES MODIFIED.")
        return

    BACKUPS.mkdir(parents=True, exist_ok=True)
    backup = BACKUPS / (
        "offline-content-version-before-" +
        datetime.now().strftime("%Y%m%d_%H%M%S_%f") + ".json"
    )
    shutil.copy2(SOURCE, backup)
    if backup.read_bytes() != before:
        raise RuntimeError("Backup differs from original. No source changes made.")

    descriptor, temporary = tempfile.mkstemp(
        prefix=".offlineContent-version-", suffix=".tmp", dir=SOURCE.parent
    )
    try:
        with os.fdopen(descriptor, "wb") as file:
            file.write(after)
            file.flush()
            os.fsync(file.fileno())
        if Path(temporary).read_bytes() != after:
            raise RuntimeError("Temporary copy checksum differs; no source changes made.")
        # Refuse an overwrite if any concurrent editor/import modified the JSON.
        if SOURCE.read_bytes() != before:
            raise RuntimeError("Local catalog changed during verification. Nothing overwritten.")
        os.replace(temporary, SOURCE)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)

    print("PASS: updated ONLY content_version; all original JSON content preserved.")
    print("BACKUP:", backup)
    print("NEXT: rebuild search_seed.db and its manifest from this version.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("OFFLINE CONTENT VERSION ERROR:", exc, file=sys.stderr)
        sys.exit(1)
