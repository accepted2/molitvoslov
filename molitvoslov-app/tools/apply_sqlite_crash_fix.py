#!/usr/bin/env python3
"""Apply Expo SDK 57 FTS close workaround with STABLE SQLiteProvider options.

- Safe for both unpatched SearchScreen and the older inline-options patch.
- Preserves existing search provider placement and unrelated local changes.
- Does not touch the database or any user data.
"""
from datetime import datetime
from pathlib import Path
import re
import shutil
import sys

CONSTANT = """const SEARCH_SQLITE_OPTIONS = Object.freeze({
  finalizeUnusedStatementsBeforeClosing: false,
});

"""
OLD_INLINE = "options={{finalizeUnusedStatementsBeforeClosing: false}}"
NEW_PROP = "options={SEARCH_SQLITE_OPTIONS}"


def main():
    root = Path(__file__).resolve().parents[1]
    target = root / "src/screens/SearchScreen.js"
    source = target.read_text(encoding="utf-8-sig")
    if source.count("<SQLiteProvider") != 1 or source.count("</SQLiteProvider>") != 1:
        raise RuntimeError("Expected exactly one SQLiteProvider; no files changed")

    open_at = source.index("<SQLiteProvider")
    close_at = source.index(">", open_at)
    # The opening tag contains JSX braces, so limit inspection to the
    # following provider's children to avoid accidentally editing other code.
    provider_region = source[open_at:source.index("</SQLiteProvider>",open_at)]
    if "assetSource=" not in provider_region:
        raise RuntimeError("Bundled SQLite assetSource missing; no files changed")

    if NEW_PROP in provider_region and CONSTANT.strip() in source:
        print("ALREADY PATCHED: stable SQLiteProvider options")
        return 0

    if "const SEARCH_SQLITE_OPTIONS" in source and CONSTANT.strip() not in source:
        raise RuntimeError("SEARCH_SQLITE_OPTIONS already defined differently")

    if OLD_INLINE in provider_region:
        updated = source.replace(OLD_INLINE, NEW_PROP, 1)
    elif re.search(r"\boptions\s*=", provider_region):
        raise RuntimeError("Unexpected existing provider options; no files changed")
    else:
        # Insert before the provider's assetSource prop, independent of the
        # dynamic databaseName or search generation used by the local app.
        asset = re.search(r"(?m)^([ \t]*)assetSource=", provider_region)
        if not asset:
            raise RuntimeError("Cannot find assetSource prop on its own line")
        abs_at = open_at + asset.start()
        updated = source[:abs_at] + asset.group(1) + NEW_PROP + "\n" + source[abs_at:]

    if CONSTANT.strip() not in updated:
        anchor = "const copyForLanguage ="
        if updated.count(anchor) != 1:
            raise RuntimeError("Cannot locate insertion for stable options; no files changed")
        updated = updated.replace(anchor, CONSTANT + anchor, 1)

    if updated.count(NEW_PROP) != 1 or updated.count("const SEARCH_SQLITE_OPTIONS") != 1:
        raise RuntimeError("Unexpected provider structure after transformation")

    backup_dir = root.parent / "build-backups" / (
        "sqlite-crash-fix-" + datetime.now().strftime("%Y%m%d_%H%M%S")
    )
    backup_dir.mkdir(parents=True, exist_ok=False)
    shutil.copy2(target, backup_dir / target.name)
    target.write_text(updated, encoding="utf-8")
    print("PATCHED:", target)
    print("BACKUP:", backup_dir)
    print("Provider options use a STABLE module constant, preventing reconnect on render")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print("PATCH FAILED:", exc, file=sys.stderr)
        sys.exit(1)
