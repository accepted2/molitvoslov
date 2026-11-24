#!/usr/bin/env python3
"""Read-only diagnostic: distinguish search regressions from calendar retranslation.

Usage:
  python -X utf8 tools/diagnose_search_language_changes_20261117.py --old PATH

No writes. Both databases are opened in mode=ro.
"""
import argparse
from collections import Counter
import hashlib
from pathlib import Path
import sqlite3
import sys
from search_seed_lib import stems

ROOT = Path(__file__).resolve().parents[1]
QUERIES = [
    ("ru", "отче наш"),
    ("ru", "богородица"),
    ("ru", "евангелие"),
    ("ru", "молитва"),
    ("ru", "псалом"),
    ("ru", "господи помилуй"),
    ("uk", "отче наш"),
    ("uk", "богородиця"),
    ("uk", "євангеліє"),
    ("uk", "покаяння"),
    ("uk", "блаженні"),
    ("uk", "алілуя"),
]
GROUPS = ["scripture", "psalter", "canons", "akathists", "prayers", "calendar"]


def connect(path):
    path = path.resolve()
    if not path.is_file():
        raise ValueError("Database not found: " + str(path))
    db = sqlite3.connect("file:" + path.as_posix() + "?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    metadata = dict(db.execute("SELECT k,v FROM meta"))
    if metadata.get("schema") != "10":
        raise ValueError("Expected schema=10: " + str(path))
    check = db.execute("PRAGMA quick_check").fetchone()[0]
    if check != "ok":
        raise ValueError("Integrity error in " + str(path) + ": " + check)
    return db, metadata


def catalog(db):
    sizes = Counter()
    identities = set()
    fingerprints = {}
    calendar_titles = Counter()
    for row in db.execute("SELECT grp,lang,ext,title,title_uk,body,bl FROM doc"):
        grp, lang, ext = row["grp"], row["lang"], row["ext"]
        sizes[(grp, lang or "shared")] += 1
        key = (grp, ext, lang)
        identities.add(key)
        if grp == "calendar":
            calendar_titles[(row["title"], row["bl"])] += 1
        else:
            blob = "\x1e".join(str(row[k] or "") for k in ("title", "title_uk", "body", "bl"))
            fingerprints[key] = hashlib.sha256(blob.encode("utf-8")).hexdigest()
    return sizes, identities, fingerprints, calendar_titles


def matching_groups(db, language, phrase):
    normalized = stems(phrase)
    if not normalized:
        return Counter()
    match = " AND ".join('"' + stem.replace('"', '""') + '"' for stem in normalized)
    query = (
        "SELECT d.grp,COUNT(*) AS n FROM fts "
        "JOIN doc d ON d.id=fts.rowid "
        "WHERE fts MATCH ? AND d.lang IN ('', ?) GROUP BY d.grp"
    )
    return Counter({row["grp"]: row["n"] for row in db.execute(query, (match, language))})


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--old", type=Path, required=True)
    p.add_argument("--new", type=Path, default=ROOT / "src/data/search_seed.db")
    args = p.parse_args()
    old, old_meta = connect(args.old)
    new, new_meta = connect(args.new)
    try:
        a_sizes, a_ids, a_data, a_calendar = catalog(old)
        b_sizes, b_ids, b_data, b_calendar = catalog(new)
        print("Generators:", old_meta.get("generator"), "->", new_meta.get("generator"))
        print("Documents by group and language scope (old -> new):")
        for grp in GROUPS:
            fields = []
            for lang in ("shared", "ru", "uk"):
                a, b = a_sizes[(grp, lang)], b_sizes[(grp, lang)]
                if a or b:
                    fields.append("%s %d->%d" % (lang, a, b))
            print("  %-12s %s" % (grp, ", ".join(fields) or "(empty)"))

        missed = a_ids - b_ids
        stable_missing = sorted(item for item in missed if item[0] != "calendar")
        print("Non-calendar document keys missing:", len(stable_missing))
        for key in stable_missing[:10]:
            print("  MISSING:", " | ".join(key))
        shared_stable = a_data.keys() & b_data.keys()
        changed = [key for key in shared_stable if a_data[key] != b_data[key]]
        by_group = Counter(key[0] for key in changed)
        print("Stable non-calendar IDs with updated title/text:", len(changed))
        for grp, n in sorted(by_group.items()):
            print("  CHANGED:", grp, n)
        calendar_lost = sum((a_calendar - b_calendar).values())
        calendar_added = sum((b_calendar - a_calendar).values())
        print("Calendar title/variant pairs removed:", calendar_lost)
        print("Calendar title/variant pairs added:", calendar_added)
        print("Note: calendar changes may reflect updated RU/UK translations.")

        print("Search by locale, split into calendar and the remaining corpus:")
        regressions = []
        for lang, phrase in QUERIES:
            a = matching_groups(old, lang, phrase)
            b = matching_groups(new, lang, phrase)
            acal, bcal = a["calendar"], b["calendar"]
            acore, bcore = sum(a.values()) - acal, sum(b.values()) - bcal
            marker = "CORE LOWER" if bcore < acore else ""
            print("  %-2s %-18s core %5d -> %5d ; calendar %5d -> %5d %s" % (
                lang, phrase, acore, bcore, acal, bcal, marker))
            if bcore < acore:
                regressions.append((lang, phrase, acore, bcore))
        if stable_missing or regressions:
            print("RESULT: INVESTIGATE CORE SEARCH CHANGES BEFORE APK")
            print("Core query decreases:", len(regressions))
            return 2
        print("RESULT: CORE SEARCH PRESERVED FOR THESE QUERIES")
        print("Calendar query changes require review as translated or edited content.")
        print("Final UI search, result ranking and navigation must still be checked on Android.")
        return 0
    finally:
        old.close()
        new.close()


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print("LANGUAGE DIAGNOSTIC ERROR:", exc, file=sys.stderr)
        sys.exit(1)
