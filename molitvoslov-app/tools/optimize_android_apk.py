#!/usr/bin/env python3
"""Remove duplicate search seed from native Android assets, keeping Expo's bundled DB.

Usage: python -X utf8 tools/optimize_android_apk.py APP_ROOT
Only updates scripts/copy-search-seed.js and deletes the redundant native copy
android/app/src/main/assets/search_seed.db after verifying it matches src/data.
"""
from __future__ import annotations

import hashlib
import shutil
import sys
from datetime import datetime
from pathlib import Path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for part in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(part)
    return digest.hexdigest()


def optimize(root: Path) -> None:
    root = root.resolve()
    script = root / "scripts/copy-search-seed.js"
    screen = root / "src/screens/SearchScreen.js"
    src = root / "src/data/search_seed.db"
    meta = root / "src/data/search_seed.meta.json"
    duplicate = root / "android/app/src/main/assets/search_seed.db"

    for path in (script, screen, src, meta):
        if not path.is_file():
            raise RuntimeError(f"Required file not found: {path}")

    search_screen = screen.read_text(encoding="utf-8-sig")
    if (
        "SQLiteProvider" not in search_screen
        or "assetSource=" not in search_screen
        or "require('../data/search_seed.db')" not in search_screen
    ):
        raise RuntimeError("SQLiteProvider assetSource could not be verified; no changes made")

    # Check content equality before changing anything.
    if duplicate.exists() and sha256(src) != sha256(duplicate):
        raise RuntimeError("Native search DB differs from src/data DB; no changes made")

    current = script.read_text(encoding="utf-8-sig")
    anchor = "\nif (!fs.existsSync(path.dirname(dest))) {"
    marker = "Removed redundant native search DB; Expo loads its bundled resource."

    if marker in current:
        print("ALREADY PATCHED: scripts/copy-search-seed.js")
    else:
        if current.count(anchor) != 1:
            raise RuntimeError("Cannot safely locate the asset-copy code; no changes made")
        prefix, tail = current.split(anchor, 1)
        if (
            "fs.copyFileSync(src, dest)" not in tail
            or "Verified search_seed.db copied to Android assets." not in tail
            or not tail.rstrip().endswith("}")
        ):
            raise RuntimeError("Native asset-copy code does not match expected format; no changes made")

        replacement = """
// The same search DB is already bundled by Expo through:
// SQLiteProvider assetSource={{assetId: require('../data/search_seed.db')}}.
// Do not copy it into android/app/src/main/assets a second time.
if (fs.existsSync(dest)) {
  fs.unlinkSync(dest);
  console.log('Removed redundant native search DB; Expo loads its bundled resource.');
} else {
  console.log('Search DB verified for Expo SQLiteProvider; no redundant native copy.');
}
"""
        backup = root.parent / "build-backups" / ("apk-compact-" + datetime.now().strftime("%Y%m%d_%H%M%S"))
        backup.mkdir(parents=True, exist_ok=False)
        shutil.copy2(script, backup / script.name)
        script.write_text(prefix + replacement, encoding="utf-8")
        print(f"PATCHED: {script}")
        print(f"BACKUP:  {backup}")

    if duplicate.exists():
        duplicate.unlink()
        print("REMOVED redundant Android asset: android/app/src/main/assets/search_seed.db")
    else:
        print("Native search DB copy is already absent")

    print("DONE. src/data/search_seed.db and all offline content preserved.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python -X utf8 tools/optimize_android_apk.py APP_ROOT")
    try:
        optimize(Path(sys.argv[1]))
    except (OSError, RuntimeError) as err:
        print(f"OPTIMIZATION FAILED: {err}", file=sys.stderr)
        raise SystemExit(1)
