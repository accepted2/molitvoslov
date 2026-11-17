#!/usr/bin/env python3
"""Release gate: read-only search parity check against the last working index.

Requires a real backed-up, previously working schema-10 database. Check both
Russian and Ukrainian query coverage, immutable core records, and preserved
calendar title/text. Calendar IDs may change when translated text changes.

Example:
  python -X utf8 tools/verify_search_calendar_parity_20261117.py --old PATH
"""
import argparse
from collections import Counter
from pathlib import Path
import sqlite3
import sys
from search_seed_lib import stems

ROOT = Path(__file__).resolve().parents[1]
QUERIES = (
    "отче наш", "богородица", "господи помилуй",
    "ангел хранитель", "молитва", "псалом",
    "евангелие", "канон", "покаяние",
    "спаси нас", "аллилуия", "блаженны",
)


def connect(file):
    file = file.resolve()
    if not file.is_file():
        raise ValueError("Missing previous search index: " + str(file))
    db = sqlite3.connect("file:" + file.as_posix() + "?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    meta = dict(db.execute("SELECT k,v FROM meta"))
    if meta.get("schema") != "10":
        raise ValueError("Not a schema-10 database: " + str(file))
    if db.execute("PRAGMA quick_check").fetchone()[0] != "ok":
        raise ValueError("SQLite integrity failure in " + str(file))
    return db


def query_count(db, query, language):
    words = stems(query)
    if not words:
        return 0
    match = " AND ".join('"' + word.replace('"', '""') + '"' for word in words)
    record = db.execute(
        "SELECT COUNT(*) FROM fts JOIN doc d ON d.id=fts.rowid "
        "WHERE fts MATCH ? AND d.lang IN ('', ?)",
        (match, language),
    ).fetchone()
    return record[0]


def core_signature(db):
    return {
        (row["grp"], row["ext"], row["lang"]): (row["title"], row["title_uk"], row["body"], row["bl"])
        for row in db.execute(
            "SELECT grp, ext, lang, title, title_uk, body, bl FROM doc "
            "WHERE grp != 'calendar'"
        )
    }


def calendar_signatures(db):
    return Counter(
        (row["title"], row["body"], row["bl"])
        for row in db.execute(
            "SELECT title, body, bl FROM doc WHERE grp = 'calendar'"
        )
    )


def fallback_misses(db):
    ru = [row[0] for row in db.execute(
        "SELECT ext FROM doc WHERE grp='calendar' AND lang='ru'"
    )]
    uk = {row[0] for row in db.execute(
        "SELECT ext FROM doc WHERE grp='calendar' AND lang='uk'"
    )}
    return sum(ext not in uk for ext in ru)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--old", type=Path, required=True)
    p.add_argument("--new", type=Path, default=ROOT / "src/data/search_seed.db")
    args = p.parse_args()
    old, new = connect(args.old), connect(args.new)
    try:
        problems = []
        old_count = old.execute("SELECT COUNT(*) FROM doc").fetchone()[0]
        new_count = new.execute("SELECT COUNT(*) FROM doc").fetchone()[0]
        print("Old documents:", old_count, "New documents:", new_count)
        if new_count < old_count:
            problems.append("New corpus has fewer documents")
        old_core, new_core = core_signature(old), core_signature(new)
        gone = old_core.keys() - new_core.keys()
        changed = [key for key in old_core.keys() & new_core.keys()
                   if old_core[key] != new_core[key]]
        print("Missing non-calendar IDs:", len(gone))
        print("Changed non-calendar title/body pairs:", len(changed))
        if gone or changed:
            problems.append("Missing/modified non-calendar search documents")
        old_cal, new_cal = calendar_signatures(old), calendar_signatures(new)
        lost_cal = sum((old_cal - new_cal).values())
        print("Missing calendar title/body pairs:", lost_cal)
        if lost_cal:
            problems.append("Previously indexed calendar texts are missing")
        missing_fallback = fallback_misses(new)
        print("Russian calendar rows hidden without UK counterpart:", missing_fallback)
        if missing_fallback:
            problems.append("Old Ukrainian-locale calendar fallback is missing")
        for language in ("ru", "uk"):
            for query in QUERIES:
                old_hits, new_hits = (
                    query_count(old, query, language),
                    query_count(new, query, language),
                )
                print("  %-2s %-20s %5d -> %5d" % (
                    language, query, old_hits, new_hits))
                if new_hits < old_hits:
                    problems.append("%s query '%s': %d -> %d" % (
                        language, query, old_hits, new_hits))
        if problems:
            print("SEARCH PARITY: FAILED")
            for problem in problems[:30]:
                print("  -", problem)
            return 2
        print("SEARCH PARITY: PASS — previous coverage preserved for tested queries")
        print("This does not replace search ranking/navigation tests on Android.")
        return 0
    finally:
        old.close()
        new.close()


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        print("SEARCH PARITY ERROR:", error, file=sys.stderr)
        sys.exit(1)
