#!/usr/bin/env python3
"""Build an offline cross-reference supplement for deuterocanonical books.

Usage (from molitvoslov-app):
    python -X utf8 tools/build_bible_crossrefs_supplement.py

The three upstream source files are independently checked against pinned Git
blob hashes before use. Only exact verse addresses are imported; chapter-only
references and passages with unresolved Vulgate/Septuagint numbering are not
guessed. The OpenBible index and the Scripture texts are never modified.

Catholic Cross References, public domain (Unlicense/CC0):
https://github.com/jesuslovestyler/Catholic-Cross-References
"""
import hashlib
import json
import re
import urllib.request
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUTPUT = HERE.parent / "src" / "data" / "bibleCrossReferencesSupplement.json"
ROOT = "https://raw.githubusercontent.com/jesuslovestyler/Catholic-Cross-References/main/"
SOURCES = (
    ("cross-references.json", "d521f8149efc678b1e2224cc9c156f055e8091d5"),
    ("haydock-references.json", "d7bcbc96f577b3bdc8f5d38171fd713c17ae138d"),
    ("our-references.json", "eb9064e6869d08b7b83e264a585b42943688d010"),
)
BOOK_CODES = {
    "Genesis": "GEN", "Exodus": "EXO", "Leviticus": "LEV",
    "Numbers": "NUM", "Deuteronomy": "DEU", "Josue": "JOS",
    "Judges": "JDG", "Ruth": "RUT", "1 Kings": "1SA",
    "2 Kings": "2SA", "3 Kings": "1KI", "4 Kings": "2KI",
    "1 Paralipomenon": "1CH", "2 Paralipomenon": "2CH",
    "1 Esdras": "EZR", "2 Esdras": "NEH", "3 Esdras": "1ES",
    "4 Esdras": "2ES", "Tobias": "TOB", "Judith": "JDT",
    "Esther": "EST", "Job": "JOB", "Psalms": "PSA",
    "Proverbs": "PRO", "Ecclesiastes": "ECC",
    "Canticle of Canticles": "SNG", "Wisdom": "WIS",
    "Ecclesiasticus": "SIR", "Isaias": "ISA",
    "Jeremias": "JER", "Lamentations": "LAM",
    "Baruch": "BAR", "Ezechiel": "EZK", "Daniel": "DAN",
    "Osee": "HOS", "Joel": "JOL", "Amos": "AMO",
    "Abdias": "OBA", "Jonas": "JON", "Micheas": "MIC",
    "Nahum": "NAM", "Habacuc": "HAB", "Sophonias": "ZEP",
    "Aggeus": "HAG", "Zacharias": "ZEC", "Malachias": "MAL",
    "1 Machabees": "1MA", "2 Machabees": "2MA",
    "Matthew": "MAT", "Mark": "MRK", "Luke": "LUK",
    "John": "JHN", "Acts of the Apostles": "ACT",
    "Romans": "ROM", "1 Corinthians": "1CO",
    "2 Corinthians": "2CO", "Galatians": "GAL",
    "Ephesians": "EPH", "Philippians": "PHP",
    "Colossians": "COL", "1 Thessalonians": "1TH",
    "2 Thessalonians": "2TH", "1 Timothy": "1TI",
    "2 Timothy": "2TI", "Titus": "TIT",
    "Philemon": "PHM", "Hebrews": "HEB", "James": "JAS",
    "1 Peter": "1PE", "2 Peter": "2PE",
    "1 John": "1JN", "2 John": "2JN",
    "3 John": "3JN", "Jude": "JUD", "Apocalypse": "REV",
}
TARGET = re.compile(r"^(.+?)\s+(\d+)(?::(\d+)(?:[-–](\d+))?)?$")
SOURCE = re.compile(r"^(\d+):(\d+)$")


def fetch(filename, expected_sha):
    request = urllib.request.Request(
        ROOT + filename, headers={"User-Agent": "Molitvoslov-offline-crossrefs/1"}
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        raw = response.read()
    actual = hashlib.sha1(f"blob {len(raw)}\0".encode() + raw).hexdigest()
    if actual != expected_sha:
        raise RuntimeError(
            f"Upstream source changed: {filename}: {actual}. "
            "Review and update source hashes deliberately; do not import blindly."
        )
    return json.loads(raw.decode("utf-8-sig"))


def address(book, chapter, verse, end=None):
    code = BOOK_CODES.get(book)
    if not code or code == "PSA" or code == "EST" and chapter > 10 or code == "DAN" and chapter > 12:
        # Douay/Vulgate Psalm verse numbering is not a safe identity
        # conversion. Daniel/Esther additions need separate verse mapping.
        return None
    if code == "BAR" and chapter == 6:
        return "LJE", 1, verse, 1, end if end is not None else verse
    return code, chapter, verse, chapter, end if end is not None else verse


def build():
    # Each source verse points to a dict of unique destination ranges.
    links = defaultdict(dict)
    counts = {}
    for name, source_sha in SOURCES:
        corpus = fetch(name, source_sha)
        n = {"read": 0, "added": 0, "unanchored": 0,
             "unsupported": 0, "duplicates": 0}
        for book, verses in corpus["references"].items():
            for location, groups in verses.items():
                match = SOURCE.fullmatch(location)
                if not match:
                    raise RuntimeError(f"Unexpected source address: {book} {location}")
                source = address(book, int(match[1]), int(match[2]))
                for group in groups:
                    targets = group.get("targets")
                    if targets is None:
                        targets = [group["target"]] if group.get("target") else []
                    for item in targets:
                        n["read"] += 1
                        found = TARGET.fullmatch(item)
                        if not found:
                            raise RuntimeError(f"Unknown target format: {item}")
                        if found[3] is None:
                            n["unanchored"] += 1
                            continue
                        chapter, first = int(found[2]), int(found[3])
                        last = int(found[4]) if found[4] else first
                        target = address(found[1], chapter, first, last)
                        if source is None or target is None:
                            n["unsupported"] += 1
                            continue

                        def add(src, dest):
                            code, ch, verse, _, _ = src
                            dc, dch, dv, de_ch, de_verse = dest
                            if (code, ch, verse) == (dc, dch, dv) and (dch, dv) == (de_ch, de_verse):
                                return False
                            key = f"{code}.{ch}.{verse}"
                            edge = (dc, dch, dv, de_ch, de_verse, 1)
                            signature = edge[:5]
                            if signature in links[key]:
                                return False
                            links[key][signature] = edge
                            return True

                        if add(source, target):
                            n["added"] += 1
                        else:
                            n["duplicates"] += 1
                        if target[1:3] == target[3:5]:
                            reverse = (source[0], source[1], source[2], source[1], source[2])
                            if add(target, reverse):
                                n["added"] += 1
                            else:
                                n["duplicates"] += 1
        counts[name] = n

    ordered = {
        key: [list(edge) for _, edge in sorted(
            items.items(), key=lambda p: (p[0][0], p[0][1], p[0][2])
        )]
        for key, items in sorted(links.items())
    }
    total = sum(len(items) for items in ordered.values())
    if total < 30000 or not all(any(k.startswith(code + ".") for k in ordered)
                                for code in ("TOB", "JDT", "SIR", "WIS", "BAR", "LJE", "1MA", "2MA", "1ES")):
        raise RuntimeError(f"Supplement incomplete: {total} links")

    payload = {
        "schemaVersion": 1,
        "source": "Catholic Cross References v4: Douay-Rheims margins, Haydock commentary and curated allusions",
        "sourceUrl": "https://github.com/jesuslovestyler/Catholic-Cross-References",
        "license": "Public domain (Unlicense/CC0)",
        "originBlobSha": {
            "douay-margin": SOURCES[0][1], "haydock": SOURCES[1][1],
            "verified-parallels": SOURCES[2][1],
        },
        "restrictions": "Only verse-anchored targets; Psalms and Daniel/Esther additions withheld pending exact versification; Baruch 6 mapped to Epistle of Jeremiah. Reciprocal single-verse links are derivative.",
        "references": ordered,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUTPUT.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    tmp.replace(OUTPUT)
    print(f"OK: {len(ordered)} source verses, {total} supplement links")
    for key, stats in counts.items():
        print(key, stats)
    print("Created:", OUTPUT)


if __name__ == "__main__":
    build()
