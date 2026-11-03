#!/usr/bin/env python3
"""Read-only inventory of prior LOCAL public-content snapshots and SQLite files.

This detects prayers/akathists that disappeared from the current Django DB.
It does not contact any server and never edits an APK or a database.
"""
import json
import os
from pathlib import Path
import sqlite3
import sys

ROOT = Path(__file__).resolve().parents[1]
BACKEND = Path(r"C:\m\repo\molitvoslov-backend")
DB = BACKEND / "db.sqlite3"
BACKUP_ROOT = ROOT.parent / "build-backups"
SKIP_DIRS = {".git", "node_modules", "venv", ".venv", "android", ".gradle", "build", "__pycache__"}
MAX_SOURCES = 200


def visible_records(db_path, table):
    uri = "file:" + db_path.resolve().as_posix() + "?mode=ro"
    with sqlite3.connect(uri, uri=True, timeout=1) as db:
        tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if "api_akathist" not in tables or "api_text" not in tables:
            return None
        rows = db.execute(
            "SELECT slug, title FROM " + table + " WHERE is_visible=1"
        ).fetchall()
        return {slug: title for slug, title in rows if slug}


def list_sqlite_paths(root, depth):
    if not root.is_dir():
        return
    base_depth = len(root.parts)
    for directory, child_dirs, filenames in os.walk(root):
        folder = Path(directory)
        child_dirs[:] = [x for x in child_dirs
                         if x.lower() not in SKIP_DIRS and len(folder.parts) - base_depth < depth]
        for filename in filenames:
            if not filename.lower().endswith((".sqlite3", ".sqlite", ".db")):
                continue
            if "search_seed" in filename or "fts" in filename:
                continue
            path = folder / filename
            try:
                if 4096 < path.stat().st_size < 3_000_000_000:
                    yield path
            except OSError:
                continue


def compare_rows(current, other, section):
    missing = {slug: title for slug, title in other.items() if slug not in current}
    return missing


def public_json_records(path, section):
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    if section == "akathists":
        return {x["slug"]: x.get("title", "") for x in data.get("akathists", {}).get("list", [])
                if isinstance(x, dict) and x.get("slug")}
    return {x["slug"]: x.get("title", "") for x in data.get("texts", {}).values()
            if isinstance(x, dict) and x.get("slug")}


def report(title, missing):
    if not missing:
        return
    print("ADDITIONAL LOCAL " + title + " FOUND:", len(missing))
    for key, name in list(sorted(missing.items()))[:30]:
        print("  +", name or "(без названия)", "(" + key + ")")
    if len(missing) > 30:
        print("  ... and", len(missing) - 30, "more")


def main():
    if not DB.is_file():
        print("Local Django SQLite not present:", DB)
        return
    baseline = {}
    for section, table in (("akathists", "api_akathist"), ("texts", "api_text")):
        baseline[section] = visible_records(DB, table)
    if not baseline["texts"]:
        raise RuntimeError("Local Django SQLite has no visible texts")
    print("Current SQLite:", DB)
    print("Current published akathists:", len(baseline["akathists"]))
    print("Current published prayer texts:", len(baseline["texts"]))

    sources = set()
    for root, depth in ((BACKUP_ROOT, 5), (BACKEND, 3), (ROOT.parent, 2)):
        for candidate in list_sqlite_paths(root, depth):
            if candidate.resolve() != DB.resolve():
                sources.add(candidate.resolve())
    count = 0
    found = 0
    for path in sorted(sources, key=lambda p: -p.stat().st_mtime)[:MAX_SOURCES]:
        count += 1
        try:
            akathists = visible_records(path, "api_akathist")
            if akathists is None:
                continue
            texts = visible_records(path, "api_text")
        except (OSError, sqlite3.Error):
            continue
        missing_a = compare_rows(baseline["akathists"], akathists, "akathists")
        missing_t = compare_rows(baseline["texts"], texts, "texts")
        if missing_a or missing_t:
            found += 1
            print("\nPOSSIBLY RICHER SQLITE SNAPSHOT:", path)
            print("Published akathists/texts:", len(akathists), len(texts))
            report("AKATHISTS", missing_a)
            report("TEXTS", missing_t)

    if BACKUP_ROOT.is_dir():
        for path in list(BACKUP_ROOT.rglob("*.json"))[:MAX_SOURCES]:
            try:
                if path.stat().st_size < 100_000 or "offline" not in path.name.lower():
                    continue
                a = public_json_records(path, "akathists")
                t = public_json_records(path, "texts")
                missing_a = compare_rows(baseline["akathists"], a, "akathists")
                missing_t = compare_rows(baseline["texts"], t, "texts")
                if missing_a or missing_t:
                    found += 1
                    print("\nPOSSIBLY RICHER OFFLINE JSON:", path)
                    report("AKATHISTS", missing_a)
                    report("TEXTS", missing_t)
            except (OSError, ValueError, TypeError, KeyError):
                continue
    print("\nLOCAL PUBLIC SOURCES REVIEWED:", count, "SQLite candidates")
    if not found:
        print("No richer local snapshot found. Older phone-only records may require an app-data export.")
    else:
        print("Richer sources found:", found, "- compare before choosing a recovery base.")
    print("READ-ONLY LOCAL CONTENT AUDIT COMPLETE")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("LOCAL CONTENT AUDIT FAILED:", exc, file=sys.stderr)
        sys.exit(1)
