#!/usr/bin/env python3
"""Read-only side-by-side audit of old and regenerated schema-10 search indexes.

Run from molitvoslov-app:
  & $pythonExe -X utf8 .\tools\audit_search_index_parity_20261117.py --old "..\build-backups\search-seed-before-apk-20261117_174405.db"

This script NEVER changes either database. Uses SQLite mode=ro.
"""
import argparse
from collections import Counter
from pathlib import Path
import sqlite3
import sys
from search_seed_lib import stems

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_NEW = ROOT / "src/data/search_seed.db"
PHRASES = (
    "отче наш", "богородица", "господи помилуй",
    "ангел хранитель", "молитва", "псалом",
    "евангелие", "канон", "покаяние",
    "спаси нас", "аллилуия", "блаженны",
)

def connect(path):
    path = path.resolve()
    if not path.is_file():
        raise ValueError("Missing search database: " + str(path))
    db = sqlite3.connect("file:" + path.as_posix() + "?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    schema = dict(db.execute("SELECT k,v FROM meta"))
    if schema.get("schema") != "10":
        raise ValueError("Expected schema 10: " + str(path))
    if db.execute("PRAGMA quick_check").fetchone()[0] != "ok":
        raise ValueError("SQLite quick_check failed: " + str(path))
    return db, schema

def counts(db):
    rows = db.execute("SELECT grp, kind, bl, ext, lang FROM doc")
    group = Counter()
    codes = Counter()
    identifiers = set()
    for row in rows:
        group[row["grp"]] += 1
        codes.update(row["bl"] or "")
        identifiers.add((row["grp"], row["ext"], row["lang"]))
    return group, codes, identifiers

def query_count(db, phrase, lang):
    items = stems(phrase)
    if not items: return 0
    match = " AND ".join('"' + item.replace('"', '""') + '"' for item in items)
    return db.execute(
        "SELECT COUNT(*) FROM fts JOIN doc d ON d.id=fts.rowid "
        "WHERE fts MATCH ? AND d.lang IN ('', ?)", (match, lang),
    ).fetchone()[0]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--old", type=Path, required=True)
    parser.add_argument("--new", type=Path, default=DEFAULT_NEW)
    args = parser.parse_args()
    before_db, before_meta = connect(args.old)
    after_db, after_meta = connect(args.new)
    try:
        before, old_codes, old_ids = counts(before_db)
        after, new_codes, new_ids = counts(after_db)
        print("OLD:", args.old.resolve())
        print("NEW:", args.new.resolve())
        print("OLD generator:", before_meta.get("generator", "unknown"))
        print("NEW generator:", after_meta.get("generator", "unknown"))
        print("OLD docs:", sum(before.values()), "NEW docs:", sum(after.values()))
        print("Groups (old -> new):")
        for group in sorted(before.keys() | after.keys()):
            print("  %-12s %6d -> %6d %+6d" % (
                group, before[group], after[group], after[group] - before[group]))
        print("Language variant codes (old -> new):")
        for code in sorted(old_codes.keys() | new_codes.keys()):
            print("  %-6s %8d -> %8d %+8d" % (
                code, old_codes[code], new_codes[code],
                new_codes[code] - old_codes[code]))
        lost = old_ids - new_ids
        new = new_ids - old_ids
        print("Exact document IDs missing in new:", len(lost), "new IDs:", len(new))
        by_group = Counter(grp for grp, _ext, _lang in lost)
        for group, n in sorted(by_group.items(), key=lambda pair: -pair[1]):
            print("  missing %-14s %d" % (group, n))
        print("Examples of missing identifiers:")
        for row in sorted(lost)[:12]:
            print(" ", " | ".join(row))
        print("FTS coverage by query, Russian / Ukrainian (old -> new):")
        lower = []
        for lang in ("ru", "uk"):
            for phrase in PHRASES:
                a = query_count(before_db, phrase, lang)
                b = query_count(after_db, phrase, lang)
                if a > b: lower.append((lang, phrase, a, b))
                print("  %-2s %-20s %5d -> %5d %s" % (
                    lang, phrase, a, b, "LOWER" if b < a else ""))
        issues = []
        if old_codes["t"] > 0 and new_codes["t"] == 0:
            issues.append("Traditional Church Slavonic variant coverage disappeared (t).")
        for code in ("c", "r", "u"):
            if old_codes[code] > 100 and new_codes[code] < old_codes[code] * 0.8:
                issues.append("Language variant %s dropped by more than 20%%." % code)
        for group in ("prayers", "scripture", "akathists", "canons", "psalter"):
            if before[group] > 100 and after[group] < before[group] * 0.80:
                issues.append("%s document group shrank more than 20%%." % group)
        if lower:
            print("Queries with fewer indexed matches:", len(lower), "of", len(PHRASES)*2)
        if issues:
            print("SEARCH PARITY: REGRESSION RISK")
            for issue in issues: print("  WARNING:", issue)
            return 2
        if lost or lower:
            print("SEARCH PARITY: DIFFERENCES DETECTED (inspect before release)")
            return 2
        print("SEARCH PARITY: NO LARGE LOSSES DETECTED")
        print("This is not a full UI/ranking test; still check navigation on Android.")
        return 0
    finally:
        before_db.close()
        after_db.close()

if __name__ == "__main__":
    try: sys.exit(main())
    except Exception as exc:
        print("SEARCH PARITY AUDIT FAILED:", exc, file=sys.stderr)
        sys.exit(1)
