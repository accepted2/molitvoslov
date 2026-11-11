#!/usr/bin/env python3
"""Audit every offline Bible book against actually navigable cross-references.

Run from molitvoslov-app:
    python -X utf8 tools/verify_bible_crossrefs.py --csv reports/bible-crossrefs-coverage.csv

Reads bundled Bibles and the cross-reference files; never modifies them.
"""
import argparse
import csv
import json
from pathlib import Path

APP = Path(__file__).resolve().parent.parent
DATA = APP / "src" / "data"


def load(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def index_verses(bible):
    out = {}
    titles = {}
    for book in bible.get("books", []):
        code = book.get("code")
        if not code:
            continue
        titles[code] = book.get("name", code)
        for chapter in book.get("chapters", []):
            ch = int(chapter.get("number", 0))
            for verse in chapter.get("verses", []):
                n = int(verse.get("number", 0))
                if ch > 0 and n > 0:
                    out[(code, ch, n)] = True
    return out, titles


def map_psalm(psalms, direction, chapter, verse):
    table = psalms["lxxToEnglish" if direction == "source" else "englishToLxx"]
    pair = table.get(f"{chapter}.{verse}", "identity")
    if pair is None:
        return None
    if pair == "identity":
        return int(chapter), int(verse)
    if not isinstance(pair, list) or len(pair) != 2:
        return None
    return int(pair[0]), int(pair[1])


def source_key(code, chapter, verse, psalms):
    if code == "PSA":
        mapped = map_psalm(psalms, "source", chapter, verse)
        if mapped is None:
            return None
        chapter, verse = mapped
    return f"{code}.{chapter}.{verse}"


def valid_target(edge, available, psalms):
    if not isinstance(edge, list) or len(edge) < 6 or int(edge[5]) <= 0:
        return False
    code, ch, verse, end_ch, end_verse = edge[:5]
    ch, verse, end_ch, end_verse = map(int, (ch, verse, end_ch, end_verse))
    if code == "PSA":
        start = map_psalm(psalms, "target", ch, verse)
        end = map_psalm(psalms, "target", end_ch, end_verse)
        if start is None or end is None:
            return False
        ch, verse = start
        end_ch, end_verse = end
    if (end_ch, end_verse) < (ch, verse):
        return False
    return (code, ch, verse) in available and (code, end_ch, end_verse) in available


def audit(bible, fallback, refs, supplementary, curated, psalms, language):
    primary, titles = index_verses(bible)
    russian, _ = index_verses(fallback)
    available = primary | russian if language == "CS" else primary
    rows = refs.get("references", {})
    extra = supplementary.get("references", {})
    checked = curated.get("references", {})
    summary = {}
    totals = {"verses": 0, "with_links": 0, "usable_links": 0}
    for (code, chapter, verse) in primary:
        record = summary.setdefault(code, {
            "language": language, "code": code, "book": titles.get(code, code),
            "verses": 0, "with_links": 0, "usable_links": 0
        })
        record["verses"] += 1
        source = source_key(code, chapter, verse, psalms)
        usable = 0
        if source:
            edges = rows.get(source, []) + extra.get(source, []) + checked.get(source, [])
            seen = set()
            for edge in edges:
                # The UI deduplicates both sources by the displayed passage.
                signature = tuple(edge[:5])
                if signature in seen:
                    continue
                seen.add(signature)
                if valid_target(edge, available, psalms):
                    usable += 1
        if usable:
            record["with_links"] += 1
            record["usable_links"] += usable
    for record in summary.values():
        for key in totals:
            totals[key] += record[key]
    return sorted(summary.values(), key=lambda record: record["code"]), totals


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", help="Write a per-book CSV report")
    args = parser.parse_args()
    refs = load("bibleCrossReferences.json")
    psalms = load("biblePsalmVersification.json")
    supplementary = load("bibleCrossReferencesSupplement.json")
    curated = load("bibleCrossReferencesCurated.json")
    rst = load("offlineBible.json")
    csl = load("offlineBibleCslTraditional.json")
    all_records = []
    for language, bible in (("RU", rst), ("CS", csl)):
        records, totals = audit(bible, rst, refs, supplementary, curated, psalms, language)
        all_records.extend(records)
        covered = 100 * totals["with_links"] / max(1, totals["verses"])
        print(f"{language}: books={len(records)}, verses={totals['verses']}, "
              f"linked={totals['with_links']} ({covered:.1f}%), "
              f"navigable references={totals['usable_links']}")
        for item in records:
            if item["with_links"] == 0:
                print(f"  UNLINKED BOOK: {item['code']} {item['book']}")
    if args.csv:
        output = Path(args.csv)
        output.parent.mkdir(parents=True, exist_ok=True)
        with output.open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=[
                "language", "code", "book", "verses", "with_links", "usable_links"])
            writer.writeheader()
            writer.writerows(all_records)
        print(f"Coverage report: {output}")


if __name__ == "__main__":
    main()
