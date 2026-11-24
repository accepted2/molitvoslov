#!/usr/bin/env python3
"""Check the full St Philaret prayer, its category, and packaged search index.

Run AFTER:
  python -X utf8 tools/import_filaret_daily_prayer_20261119.py
  node tools/apply_filaret_daily_prayer_search_20261119.js
  node scripts/prepare-search-index.js
"""
import json
from pathlib import Path
import sqlite3
import sys

from import_filaret_daily_prayer_20261119 import normalized, load_prayer

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "src" / "data" / "offlineContent.json"
SEED = ROOT / "src" / "data" / "search_seed.db"


def verify():
    prayer = load_prayer()
    payload = json.loads(CONTENT.read_text(encoding="utf-8-sig"))
    catalog = payload["texts"]
    body = normalized(prayer["text"])
    candidates = [
        (slug, row) for slug, row in catalog.items()
        if body == normalized(row.get("translation") or "")
    ]
    if not candidates:
        raise RuntimeError("Exact full prayer is missing from offline Text records")
    linked = [
        row for row in payload["category_texts"].get("raznye-molitvy", [])
        if (row.get("text") or {}).get("slug") in {
            slug for slug, _ in candidates
        }
    ]
    if len(linked) != 1:
        raise RuntimeError(
            f"Expected one root-category link to full St Philaret prayer, found {len(linked)}"
        )
    text_record = linked[0]["text"]
    text_id = int(text_record.get("id") or 0)
    if text_id <= 0:
        raise RuntimeError("Prayer Text ID missing")
    with sqlite3.connect(SEED) as db:
        meta = dict(db.execute("SELECT k, v FROM meta"))
        if meta.get("public_content_version") != payload["content_version"]:
            raise RuntimeError("Search database belongs to a different public catalog")
        if db.execute("PRAGMA quick_check").fetchone()[0] != "ok":
            raise RuntimeError("Search database integrity check failed")
        indexed = db.execute(
            "SELECT title, bl, lang FROM doc WHERE grp='prayers' AND ext=?",
            (f"text:{text_id}",),
        ).fetchall()
    if not indexed or not any("r" in (item[1] or "") for item in indexed):
        raise RuntimeError(
            "Full St Philaret prayer is not indexed in Russian. "
            "Apply search patch and rebuild the offline search seed."
        )
    print("PASS: Russian St Philaret prayer text preserved exactly")
    print("PASS: exactly one Разные молитвы category link, text ID:", text_id)
    print("PASS: bundled search index belongs to current offline catalog")
    print("PASS: prayer indexed for Russian queries, entries:", len(indexed))
    print("Search title:", indexed[0][0])


if __name__ == "__main__":
    try:
        verify()
    except Exception as e:
        print("FILARET VERIFICATION FAILED:", e, file=sys.stderr)
        sys.exit(1)
