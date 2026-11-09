#!/usr/bin/env python3
"""Build a complete offline Church Slavonic Bible from a pinned Unicode source.

Source: Ponomar Project, Elizabeth Bible, GPL-3.0-or-later.
https://github.com/typiconman/ponomar/tree/0af645f438856f45c22026912d2e4a9ce495e531/Ponomar/languages/cu/bible/elis

This tool never modifies the existing Synodal Bible.
"""
import argparse
import concurrent.futures
import hashlib
import json
import re
import sys
import time
import unicodedata
from pathlib import Path
from urllib.request import Request, urlopen

SOURCE_COMMIT = "0af645f438856f45c22026912d2e4a9ce495e531"
SOURCE_REPOSITORY = "https://github.com/typiconman/ponomar"
SOURCE_FOLDER = "Ponomar/languages/cu/bible/elis"
SOURCE_RAW = (
    "https://raw.githubusercontent.com/typiconman/ponomar/"
    + SOURCE_COMMIT + "/" + SOURCE_FOLDER
)
BOOK_FILES = tuple(tuple(line.split()) for line in """
GEN Gen
EXO Ex
LEV Lev
NUM Num
DEU Deut
JOS Josh
JDG Judg
RUT Ruth
1SA I_Kings
2SA II_Kings
1KI III_Kings
2KI IV_Kings
1CH I_Paral
2CH II_Paral
EZR I_Esdra
NEH Nehem
1ES II_Esdra
TOB Tobit
JDT Judith
EST Esther
JOB Job
PSA Psalm
PRO Prov
ECC Eccles
SNG Song
WIS Wisd
SIR Sirach
ISA Isa
JER Jerem
LAM Lamen
LJE Epistle
BAR Baruch
EZK Ezek
DAN Dan
HOS Hos
JOL Joel
AMO Amos
OBA Obad
JON Jona
MIC Mica
NAM Nahum
HAB Habak
ZEP Zeph
HAG Hagg
ZEC Zech
MAL Mal
1MA I_Macc
2MA II_Macc
3MA III_Macc
2ES III_Esdra
MAT Mt
MRK Mk
LUK Lk
JHN Jn
ACT Acts
JAS Jas
1PE I_Pet
2PE II_Pet
1JN I_Jn
2JN II_Jn
3JN III_Jn
JUD Jude
ROM Rom
1CO I_Cor
2CO II_Cor
GAL Gal
EPH Eph
PHP Philip
COL Col
1TH I_Thess
2TH II_Thess
1TI I_Tim
2TI II_Tim
TIT Tit
PHM Philemon
HEB Heb
REV Apoc
""".strip().splitlines())

BOOK_NAME_OVERRIDES = {
    "GEN": ("Книга Бытія", "Быт."),
    "PSA": ("Псалтирь", "Пс."),
    "MAT": ("Евангеліе от Матѳея", "Мѳ."),
    "2ES": ("Третья книга Ездры", "3Ездр."),
}
CHAPTER_PATTERN = re.compile(r"^#([1-9]\d*)$")
VERSE_PATTERN = re.compile(r"^(\d+)\|\s*(.*)$")
NONVERSE_COLOPHON = re.compile(r"^Коне́цъ\b")
# Ponomar's Elizabeth Bible has lectionary boundary notes inside verses:
#   **(Зача́ло 1)** Зача́ло є҆ѵⷢ҇лїа...
#   ... **(Заⷱ҇ 2)** И҆ бы́сть...
# The asterisks are source Markdown, and the parenthesis gives the
# pericope number. They are NOT words of Scripture.
LECTIONARY_MARKER = re.compile(r"\*\*\(\s*([^()\n]{1,45}?)\s*\)\*\*")


def strip_lectionary_annotations(value):
    """Remove only numbered lectionary markers, never biblical verse words.

    The genuine opening 'Зача́ло є҆ѵⷢ҇лїа' at Mark 1:1 remains intact.
    """
    text = str(value)
    def is_lectionary(label):
        folded = "".join(
            char for char in unicodedata.normalize("NFD", label)
            if unicodedata.category(char) not in ("Mn", "Me", "Mc")
        )
        return bool(re.fullmatch(r"(?:Зачало|За)\s+[0-9]{1,4}", folded, re.I))

    matches = [
        match for match in LECTIONARY_MARKER.finditer(text)
        if is_lectionary(match.group(1))
    ]
    if not matches:
        return text, 0

    # Keep the original text and spacing untouched except where a marker
    # occupied the boundary. In particular, preserve all titla/accents.
    pieces = []
    cursor = 0
    for match in matches:
        before = text[cursor:match.start()]
        pieces.append(before)
        cursor = match.end()
    pieces.append(text[cursor:])
    cleaned = "".join(pieces)
    cleaned = re.sub(r" {2,}", " ", cleaned).strip()
    return cleaned, len(matches)



def get_client_id(kind, order, chapter=0, verse=0):
    if kind == "book":
        return 500_000 + order
    if kind == "chapter":
        return 10_000_000 + order * 1000 + chapter
    if kind == "verse":
        return 100_000_000 + order * 1_000_000 + chapter * 1000 + verse
    raise ValueError(kind)


def parse_source(source, code):
    chapters = []
    current = None
    ignored_lines = []
    seen_chapters = set()
    seen_verses = set()
    for index, raw in enumerate(source.splitlines(), start=1):
        line = raw.strip()
        if not line:
            continue
        match = CHAPTER_PATTERN.fullmatch(line)
        if match:
            number = int(match.group(1))
            if number in seen_chapters:
                raise ValueError(f"{code}: repeated chapter {number}")
            seen_chapters.add(number)
            chapters.append(current := {"number": number, "verses": []})
            seen_verses = set()
            continue

        match = VERSE_PATTERN.fullmatch(line)
        if match:
            if current is None:
                raise ValueError(f"{code}:{index}: verse before chapter")
            number = int(match.group(1))
            text, _removed_markers = strip_lectionary_annotations(
                unicodedata.normalize("NFC", match.group(2).strip())
            )
            if number == 0:
                # Psalm headings and other unnumbered superscriptions are not
                # verse zero: keep them as chapter metadata, not a fake verse.
                current["heading"] = (current.get("heading", "") + " " + text).strip()
                continue
            if not text:
                raise ValueError(f"{code} {current['number']}:{number}: empty verse")
            if number in seen_verses:
                raise ValueError(f"{code} {current['number']}:{number}: duplicate verse")
            if "\ufffd" in text or "\uf8ff" in text:
                raise ValueError(f"{code} {current['number']}:{number}: broken Unicode")
            if number >= 1000:
                raise ValueError(f"{code} {current['number']}:{number}: verse number too large")
            seen_verses.add(number)
            current["verses"].append({"number": number, "text": text})
            continue

        if NONVERSE_COLOPHON.match(line):
            ignored_lines.append(f"{index}: {line[:80]}")
            continue
        # Do not silently drop textual lines: attach continuations to prior verse
        # while recording them for human editorial review.
        if current is None or not current["verses"]:
            raise ValueError(f"{code}:{index}: unexpected text outside verse: {line[:50]}")
        current["verses"][-1]["text"] += " " + unicodedata.normalize("NFC", line)
        ignored_lines.append(f"{index}: joined to previous verse: {line[:50]}")

    if not chapters:
        raise ValueError(f"{code}: no chapters")
    if [ch["number"] for ch in chapters] != list(range(1, len(chapters) + 1)):
        raise ValueError(f"{code}: missing/unsorted chapters")
    missing = {}
    for ch in chapters:
        numbers = [v["number"] for v in ch["verses"]]
        if not numbers or numbers != sorted(numbers):
            raise ValueError(f"{code} {ch['number']}: no verses or unsorted verses")
        gaps = sorted(set(range(1, max(numbers) + 1)) - set(numbers))
        if gaps:
            missing[str(ch["number"])] = gaps
    return chapters, {"missing_verse_numbers": missing, "other_lines": ignored_lines}


def fetch_one(name, source_dir):
    if source_dir:
        p = source_dir / (name + ".text")
        return p.read_bytes().decode("utf-8-sig")
    url = SOURCE_RAW + "/" + name + ".text"
    error = None
    for attempt in range(5):
        try:
            request = Request(url, headers={
                "User-Agent": "Molitvoslov-offline-CSL-importer/1.0"
            })
            with urlopen(request, timeout=40) as response:
                return response.read().decode("utf-8-sig")
        except Exception as exc:
            error = exc
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"Unable to download {name}.text: {error}")


def build(args):
    offline = json.loads(args.synodal.read_text(encoding="utf-8"))
    if offline.get("translation", {}).get("code") != "rst":
        raise ValueError("Synodal bundle must be rst. It is READ ONLY.")
    synodal_books = {b["code"]: b for b in offline["books"]}
    if len(BOOK_FILES) != 77 or len({code for code, _ in BOOK_FILES}) != 77:
        raise ValueError("Incomplete mapping of 77 Church Slavonic books")
    if any(code not in synodal_books for code, _ in BOOK_FILES):
        raise ValueError("Some Church Slavonic book codes do not match rst")

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
        futures = {
            name: executor.submit(fetch_one, name, args.source_dir)
            for code, name in BOOK_FILES
        }
        sources = {name: futures[name].result() for code, name in BOOK_FILES}

    data = {
        "schema_version": 1,
        "translation": {
            "id": 500000,
            "code": "csl_traditional",
            "name": "Церковнославянский (Елизаветинская Библия)",
            "language": "cu",
            "script_variant": "church_traditional",
            "source_url": SOURCE_REPOSITORY + "/tree/" + SOURCE_COMMIT + "/" + SOURCE_FOLDER,
            "source_revision": SOURCE_COMMIT,
            "license": "GPL-3.0-or-later (digital edition); original historic text is public domain",
        },
        "books": [],
    }
    report = {"source_revision": SOURCE_COMMIT, "books": {}, "source_sha256": {}}
    for order, (code, filename) in enumerate(BOOK_FILES, start=1):
        chapters, issues = parse_source(sources[filename], code)
        if code == "PSA" and len(chapters) != 151:
            raise ValueError("Psalter must include 151 psalms")
        if code == "2ES" and len(chapters) != 16:
            raise ValueError("Third Ezra must include 16 chapters")
        old = synodal_books[code]
        name, short_name = BOOK_NAME_OVERRIDES.get(code, (old["name"], old["short_name"]))
        book = {
            "id": get_client_id("book", order),
            "code": code,
            "testament": old["testament"],
            "section": old["section"],
            "name": name,
            "short_name": short_name,
            "slug": old["slug"],
            "canonical_order": order,
            "is_appendix": old["is_appendix"],
            "chapters": [],
        }
        for chapter in chapters:
            n = chapter["number"]
            book["chapters"].append({
                "id": get_client_id("chapter", order, chapter=n),
                "number": n,
                **({"heading": chapter["heading"]} if chapter.get("heading") else {}),
                "verses": [
                    {
                        "id": get_client_id("verse", order, chapter=n, verse=v["number"]),
                        "number": v["number"],
                        "text": v["text"],
                    } for v in chapter["verses"]
                ]
            })
        data["books"].append(book)
        count = sum(len(x["verses"]) for x in chapters)
        report["books"][code] = {"chapters": len(chapters), "verses": count, **issues}
        report["source_sha256"][filename + ".text"] = hashlib.sha256(
            sources[filename].encode("utf-8")
        ).hexdigest()

    stable = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    data["content_version"] = hashlib.sha256(stable.encode("utf-8")).hexdigest()
    total_chapters = sum(len(b["chapters"]) for b in data["books"])
    total_verses = sum(len(c["verses"]) for b in data["books"] for c in b["chapters"])
    report["totals"] = {
        "books": len(data["books"]), "chapters": total_chapters,
        "verses": total_verses,
        "books_with_verse_gaps": sum(bool(b["missing_verse_numbers"]) for b in report["books"].values()),
        "editorial_lines": sum(len(b["other_lines"]) for b in report["books"].values()),
    }
    if len(data["books"]) != 77 or total_verses < 36000 or total_chapters < 1300:
        raise ValueError("Incomplete Church Slavonic Bible payload")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report["totals"], ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--synodal", type=Path, default=Path("molitvoslov-app/src/data/offlineBible.json"))
    parser.add_argument("--output", type=Path, default=Path("molitvoslov-app/src/data/offlineBibleCslTraditional.json"))
    parser.add_argument("--report", type=Path, default=Path("molitvoslov-app/tools/csl_import_audit.json"))
    parser.add_argument("--source-dir", type=Path, help="Directory with 77 original .text files; otherwise download pinned sources")
    build(parser.parse_args())


if __name__ == "__main__":
    main()
