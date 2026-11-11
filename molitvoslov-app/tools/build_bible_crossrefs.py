#!/usr/bin/env python3
"""Build offline Bible cross-reference index from a pinned OpenBible.info snapshot.

Run from any directory:
    python -X utf8 molitvoslov-app/tools/build_bible_crossrefs.py

Writes only src/data/bibleCrossReferences.json. Scripture source files,
calendar IDs and saved bookmarks are never modified.
Data: OpenBible.info, CC BY 4.0, https://www.openbible.info/labs/cross-references/
"""
import csv
import hashlib
import io
import json
import re
import urllib.request
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUTPUT = HERE.parent / "src" / "data" / "bibleCrossReferences.json"
SOURCE = ("https://raw.githubusercontent.com/trekhleb/bible-cross-references/"
          "main/data/raw/openbible-cross-references.zip")
SOURCE_SHA256 = "83e9db0a08054ed99848531512729f0190dbbac85416f408f2362b5dc36d421d"
ALIASES = {
    "gen":"GEN", "exod":"EXO", "ex":"EXO", "lev":"LEV", "num":"NUM",
    "deut":"DEU", "josh":"JOS", "judg":"JDG", "ruth":"RUT",
    "1sam":"1SA", "2sam":"2SA", "1kgs":"1KI", "2kgs":"2KI",
    "1chr":"1CH", "2chr":"2CH", "ezra":"EZR", "neh":"NEH",
    "esth":"EST", "job":"JOB", "ps":"PSA", "psa":"PSA",
    "prov":"PRO", "eccl":"ECC", "song":"SNG", "isa":"ISA",
    "jer":"JER", "lam":"LAM", "ezek":"EZK", "dan":"DAN",
    "hos":"HOS", "joel":"JOL", "amos":"AMO", "obad":"OBA",
    "jonah":"JON", "mic":"MIC", "nah":"NAM", "hab":"HAB",
    "zeph":"ZEP", "hag":"HAG", "zech":"ZEC", "mal":"MAL",
    "matt":"MAT", "mark":"MRK", "luke":"LUK", "john":"JHN",
    "acts":"ACT", "rom":"ROM", "1cor":"1CO", "2cor":"2CO",
    "gal":"GAL", "eph":"EPH", "phil":"PHP", "col":"COL",
    "1thess":"1TH", "2thess":"2TH", "1tim":"1TI",
    "2tim":"2TI", "titus":"TIT", "phlm":"PHM",
    "heb":"HEB", "jas":"JAS", "1pet":"1PE", "2pet":"2PE",
    "1john":"1JN", "2john":"2JN", "3john":"3JN",
    "jude":"JUD", "rev":"REV",
}
REF_PATTERN = re.compile(r"^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)$")


def parse_ref(raw):
    found = REF_PATTERN.fullmatch(raw.strip())
    if not found:
        return None
    book = ALIASES.get(found.group(1).lower())
    chapter, verse = int(found.group(2)), int(found.group(3))
    if not book or not 1 <= chapter <= 200 or not 1 <= verse <= 200:
        return None
    return book, chapter, verse


def build():
    request = urllib.request.Request(SOURCE, headers={"User-Agent": "Molitvoslov-crossrefs-build/1"})
    with urllib.request.urlopen(request, timeout=75) as response:
        archive = response.read()
    actual_sha = hashlib.sha256(archive).hexdigest()
    if actual_sha != SOURCE_SHA256:
        raise RuntimeError(f"Source SHA256 changed: {actual_sha}")

    with zipfile.ZipFile(io.BytesIO(archive)) as z:
        members = [p for p in z.namelist() if p.lower().endswith((".txt", ".tsv"))]
        if len(members) != 1:
            raise RuntimeError(f"Expected one TSV member, found: {members}")
        text = z.read(members[0]).decode("utf-8-sig")

    grouped = {}
    rows = 0
    skipped = 0
    reverse_candidates = 0
    for record in csv.reader(io.StringIO(text), delimiter="\t"):
        if len(record) != 3 or not record[0] or record[0].startswith("#"):
            continue
        try:
            votes = int(record[2])
        except (TypeError, ValueError):
            continue
        rows += 1
        source = parse_ref(record[0])
        ends = record[1].split("-", 1)
        dest = parse_ref(ends[0])
        finish = parse_ref(ends[1]) if len(ends) > 1 else dest
        if not source or not dest or not finish or dest[0] != finish[0]:
            skipped += 1
            continue
        # Store all available directed edges. Non-positive votes are kept,
        # but hidden at presentation time.
        key = f"{source[0]}.{source[1]}.{source[2]}"
        edge = [dest[0], dest[1], dest[2], finish[1], finish[2], votes]
        grouped.setdefault(key, []).append(edge)
        # OpenBible records are directed. A positively scored, single-verse
        # parallel is also useful from its other endpoint. Preserve exactly
        # the same source vote count; never invent theologically new links.
        # Do not expand passage ranges: the source does not assert a link
        # to every verse within an entire referenced range.
        if votes > 0 and source != dest and dest == finish:
            reverse_key = f"{dest[0]}.{dest[1]}.{dest[2]}"
            reverse_edge = [source[0], source[1], source[2], source[1], source[2], votes]
            grouped.setdefault(reverse_key, []).append(reverse_edge)
            reverse_candidates += 1
    if rows < 330000 or len(grouped) < 23000:
        raise RuntimeError(f"Incomplete source: rows={rows}, indexed verses={len(grouped)}")

    ordered = {}
    total = 0
    # All reciprocal candidates are deduplicated with the original edges.
    for key in sorted(grouped):
        unique = {}
        for edge in grouped[key]:
            target = tuple(edge[:5])
            old = unique.get(target)
            if old is None or edge[5] > old[5]:
                unique[target] = edge
        entries = sorted(unique.values(), key=lambda x: (-x[5], x[0], x[1], x[2]))
        ordered[key] = entries
        total += len(entries)

    payload = {
        "schemaVersion": 2,
        "source": "OpenBible.info cross references",
        "sourceUrl": "https://www.openbible.info/labs/cross-references/",
        "license": "CC BY 4.0",
        "sourceSha256": SOURCE_SHA256,
        "sourceRows": rows,
        "indexedLinks": total,
        "skippedRows": skipped,
        "reverseCandidates": reverse_candidates,
        "references": ordered,
    }
    if total < 300000:
        raise RuntimeError(f"Too few valid links: {total}")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temp = OUTPUT.with_suffix(".json.tmp")
    temp.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
                    encoding="utf-8")
    temp.replace(OUTPUT)
    print(f"OK: {rows} source rows, {total} indexed links, {len(ordered)} source verses, {skipped} skipped")
    print(f"Reciprocal single-verse candidates: {reverse_candidates} (duplicates removed)")
    print(f"Created: {OUTPUT} ({OUTPUT.stat().st_size} bytes)")


if __name__ == "__main__":
    build()
