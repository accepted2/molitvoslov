#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Import both Azbyka collections into two separate Misc Prayers subcategories.

Uses the three curated John of Kronstadt prayers from the preceding local
import JS, and fetches the SECOND, full prayers page for 15 titled prayers
plus three separate volumes from "Моя жизнь во Христе".

No existing text is overwritten. All web parsing and integrity checks happen
before any filesystem write. --dry-run never touches files. No external pip deps.

Run:
  python -X utf8 tools/import_ioann_kronshtadtsky_collections_20261118.py --dry-run
  python -X utf8 tools/import_ioann_kronshtadtsky_collections_20261118.py
If the site blocks urllib, save its HTML to disk and use --second-html FILE.
"""
import argparse
import hashlib
import html
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import shutil
import tempfile
import unicodedata
from urllib.request import Request, urlopen
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "src" / "data" / "offlineContent.json"
FIRST_IMPORT = ROOT / "tools" / "import_ioann_kronshtadtsky_prayers_20261118.js"
FIRST_URL = "https://azbyka.ru/molitvoslov/blagodarenie-za-vsyakoe-blagodeyanie-bozhie.html"
SECOND_URL = "https://azbyka.ru/molitvoslov/molitvy-sv-pravednogo-ioanna-kronshtadtskogo.html"
MISC = "raznye-molitvy"
GRATITUDE_SLUG = "molitvy-ioanna-kronshtadtskogo"
GRATITUDE_NAME = "Благодарственные молитвы святого праведного Иоанна Кронштадтского"
MAIN_SLUG = "ioann-kronshtadtsky-molitvy"
MAIN_NAME = "Молитвы святого праведного Иоанна Кронштадтского"
VOLUME_SLUG = "ioann-kronshtadtsky-moya-zhizn-vo-khriste"
VOLUME_NAME = "Из книги «Моя жизнь во Христе»"
EXPECTED_TITLES = [
    "Молитва благодарственная",
    "Песнь хвалебная по подобию псалмов Давидовых",
    "Молитвенное воззвание ко Пресвятой Богородице",
    "Молитва ко Господу",
    "Молитва утренняя",
    "Молитва от пьянства",
    "Молитва по выздоровлении",
    "Молитва о спасении кого-либо от телесной смерти, напр. от потопления, от смерти по причине болезни, от огня или от другого какого-либо бедствия (хваля веру просящих)",
    "Молитва о гордых и строптивых",
    "Молитва о злобных",
    "Молитва о сребролюбивых и жадных",
    "Молитва о завистливых",
    "Молитва к Божией Матери",
    "Молитва ко Господу",
    "Молитва об исцелении ко Господу",
]
VOLUME_TITLES = [
    "«Моя жизнь во Христе». Том 1",
    "«Моя жизнь во Христе». Том 2",
    "«Моя жизнь во Христе». Том 3. Мысли о богослужении Православной Церкви",
]
SKIP_TAGS = {"script", "style", "noscript", "svg", "audio", "video", "iframe",
             "sup", "button", "form", "nav", "footer", "aside"}
VOID = {"br", "img", "hr", "input", "meta", "link", "source", "wbr", "area",
        "embed", "param", "track", "col", "base"}


class Node:
    def __init__(self, tag="", attrs=None, parent=None):
        self.tag = tag
        self.attrs = dict(attrs or ())
        self.parent = parent
        self.children = []


class DOM(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("root")
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        obj = Node(tag, attrs, self.stack[-1])
        self.stack[-1].children.append(obj)
        if tag not in VOID:
            self.stack.append(obj)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                break

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def walk(node):
    if isinstance(node, str):
        return
    yield node
    for child in node.children:
        if isinstance(child, Node):
            yield from walk(child)


def visible_text(node):
    if isinstance(node, str):
        return node
    if node.tag in SKIP_TAGS:
        return ""
    if any(word in (node.attrs.get("class", "") or "").lower()
           for word in ["audio", "player", "share", "footnote", "toc", "comment", "rating"]):
        return ""
    pieces = []
    for child in node.children:
        if isinstance(child, Node) and child.tag == "br":
            pieces.append("\n")
        else:
            pieces.append(visible_text(child))
    return "".join(pieces)


def clean(text):
    text = html.unescape(text).replace("\xa0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    return re.sub(r" *\n *", "\n", text).strip()


def heading_text(node):
    """Read a prayer heading without Azbyka's back-to-top arrow or footnote links.

    Only heading markup is filtered. References inside prayer text are kept.
    The numeral in a real title, such as "Том 1", is preserved.
    """
    def collect(part):
        if isinstance(part, str):
            return part
        if part.tag in SKIP_TAGS:
            return ""
        if part.tag == "a":
            label = clean(visible_text(part))
            if label in {"^", "↑", "↩"} or re.fullmatch(r"\[?\d{1,3}\]?", label):
                return ""
        return "".join(collect(child) for child in part.children)

    return clean(re.sub(r"^\s*[\^↑↩]\s*", "", collect(node)))


def title_key(text):
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-zа-я0-9]+", "", text.lower().replace("ё", "е"))


def is_heading(node, level=None):
    return node.tag == ("h" + str(level)) if level else node.tag in {"h1", "h2", "h3", "h4"}


def common_parent(first, second):
    ancestors = set()
    obj = first
    while obj:
        ancestors.add(obj)
        obj = obj.parent
    obj = second
    while obj and obj not in ancestors:
        obj = obj.parent
    if obj is None:
        raise ValueError("Cannot locate article container")
    return obj


def extract_sections(html_source):
    dom = DOM()
    dom.feed(html_source)
    headings = [n for n in walk(dom.root) if n.tag == "h2"]
    first = next((n for n in headings if title_key(heading_text(n)) ==
                  title_key(EXPECTED_TITLES[0])), None)
    last = next((n for n in headings if "иные молитвы" in
                 heading_text(n).lower() and n is not first), None)
    if first is None or last is None:
        raise ValueError("Source headings changed or page blocked: cannot find prayer boundaries")
    common = common_parent(first, last)
    flat = list(walk(common))
    if first not in flat or last not in flat or flat.index(last) <= flat.index(first):
        raise ValueError("Inconsistent prayer section order")
    events = []
    for n in flat[flat.index(first):]:
        if is_heading(n):
            events.append(("heading", n.tag, heading_text(n)))
        elif n.tag in {"p", "blockquote", "li"} and not any(
            x.tag in {"p", "li"} for x in walk(n) if x is not n
        ):
            # Skip content from navigation, TOC or footnotes, including nested anchors.
            current = n
            skip = False
            while current and current is not common:
                klass = (current.attrs.get("class", "") or "").lower()
                if current.tag in SKIP_TAGS or any(
                    k in klass for k in ("toc", "contents", "footnote", "comment", "player", "audio")
                ):
                    skip = True
                    break
                current = current.parent
            if not skip:
                paragraph = clean(visible_text(n))
                # Three-star lines are editorial separators on Azbyka, not
                # prayer text. Keep inline asterisks and source footnotes.
                is_separator = bool(re.fullmatch(r"(?:\*\s*){3,}", paragraph))
                if paragraph and not is_separator and not re.fullmatch(
                        r"(?:\d+:)?\d{1,2}:\d{2}|Аудио(?:\s*\d+)?:?", paragraph):
                    events.append(("text", n.tag, paragraph))
    named = []
    current = None
    for kind, tag, value in events:
        if kind == "heading" and tag == "h2":
            if title_key(value) == title_key(EXPECTED_TITLES[0]):
                current = {"title": value, "paragraphs": []}
                named.append(current)
                continue
            if "иные молитвы" in value.lower() and current:
                current = None
                break
            if current is not None:
                current = {"title": value, "paragraphs": []}
                named.append(current)
        elif kind == "text" and current is not None:
            current["paragraphs"].append(value)
    if len(named) != 15:
        raise ValueError(f"Expected 15 titled prayers, found {len(named)}; HTML differs")
    for i, (row, expected) in enumerate(zip(named, EXPECTED_TITLES)):
        if title_key(row["title"]) != title_key(expected):
            raise ValueError(f"Prayer {i+1} title mismatch: {row['title'][:120]!r}")
        row["text"] = "\n\n".join(row["paragraphs"]).strip()
        if len(row["text"]) < 35:
            raise ValueError(f"Prayer {i+1} appears empty or truncated")
    # The three volume excerpts are inside the final 'Other prayers' section.
    volumes = []
    section = False
    current = None
    for kind, tag, value in events:
        if kind == "heading" and tag == "h2" and "иные молитвы" in value.lower():
            section = True
            continue
        if not section:
            continue
        if kind == "heading" and tag == "h3":
            current = {"title": value, "paragraphs": []}
            volumes.append(current)
        elif kind == "text" and current is not None:
            current["paragraphs"].append(value)
    if len(volumes) != 3:
        raise ValueError(f"Expected 3 volume sections, found {len(volumes)}")
    for i, item in enumerate(volumes):
        item["text"] = "\n\n".join(item["paragraphs"]).strip()
        if len(item["text"]) < 300:
            raise ValueError(f"Volume {i+1} incomplete: {len(item['text'])} chars")
    return named, volumes


def fetch_page(args):
    if args.second_html:
        source = Path(args.second_html).read_text(encoding="utf-8-sig")
    else:
        request = Request(SECOND_URL, headers={
            "User-Agent": "Mozilla/5.0 (compatible; MolitvoslovEditorialImport/1.0)",
            "Accept-Language": "ru-RU,ru;q=0.9"
        })
        with urlopen(request, timeout=35) as response:
            source = response.read().decode("utf-8-sig")
    if "Иоанна Кронштадтского" not in source and "Кронштадт" not in source:
        raise ValueError("Downloaded HTML is not the expected Azbyka prayer page")
    return source


def read_first_prayers():
    # The preceding import has the three transcribed, source-checked prayers.
    source = FIRST_IMPORT.read_text(encoding="utf-8")
    match = re.search(r"const PRAYERS = (\[.*?\]);\s*const fail =", source, flags=re.S)
    if not match:
        raise ValueError("First-page prayer manifest not found: " + str(FIRST_IMPORT))
    prayers = json.loads(match.group(1))
    if len(prayers) != 3 or any(len(p["text"]) < 100 for p in prayers):
        raise ValueError("The first-page prayer manifest is incomplete")
    return prayers


def main(args):
    # Do ALL web/parsing checks before reading/writing the user's big offline JSON.
    named, volumes = extract_sections(fetch_page(args))
    original_first = read_first_prayers()
    original_bytes = CONTENT.read_bytes()
    bom = b"\xef\xbb\xbf" if original_bytes.startswith(b"\xef\xbb\xbf") else b""
    data = json.loads(original_bytes[len(bom):].decode("utf-8"))
    if not isinstance(data.get("categories"), list) or not isinstance(data.get("category_texts"), dict) or not isinstance(data.get("texts"), dict):
        raise ValueError("Unexpected offlineContent.json schema")
    parent = next((c for c in data["categories"] if c.get("slug") == MISC), None)
    if not parent or not isinstance(parent.get("id"), int):
        raise ValueError("Missing parent category raznye-molitvy; do not create a fake parent")
    categories, index, all_rows = data["categories"], data["texts"], data["category_texts"]
    next_category_id = max([int(x.get("id", 0)) for x in categories] + [0]) + 1
    next_text_id = max([int(x.get("id", 0)) for x in index.values()] + [0]) + 1
    next_row_id = max([int(x.get("id", 0)) for rows in all_rows.values() for x in rows] + [0]) + 1
    changes = []

    def category(slug, name, parent_id, ordinal):
        nonlocal next_category_id
        found = next((c for c in categories if c.get("slug") == slug), None)
        if found:
            if found.get("parent") != parent_id:
                raise ValueError("Category parent mismatch: " + slug)
            # Only rename the category previously created for these prayers.
            if slug == GRATITUDE_SLUG and found.get("name") != name:
                found["name"] = name
                changes.append("Rename first collection: " + name)
                for rows in all_rows.values():
                    for row in rows:
                        if isinstance(row.get("category"), dict) and row["category"].get("id") == found["id"]:
                            row["category"]["name"] = name
                # Row serializers embed their own text copies, so update both
                # the index entry and nested category-text snapshots.
                embedded_texts = list(index.values()) + [
                    row.get("text", {}) for group in all_rows.values() for row in group
                ]
                for prayer in embedded_texts:
                    for category_data in prayer.get("categories", []):
                        if category_data.get("id") == found["id"]:
                            category_data["name"] = name
            return found
        siblings = [int(c.get("order") or 0) for c in categories if c.get("parent") == parent_id]
        row = {
            "id": next_category_id, "name": name, "name_uk": "", "slug": slug,
            "parent": parent_id, "order": max(siblings + [ordinal]) + 10, "icon": ""
        }
        next_category_id += 1
        categories.append(row)
        changes.append("Create category: " + name)
        return row

    gratitude = category(GRATITUDE_SLUG, GRATITUDE_NAME, parent["id"], 10)
    main_category = category(MAIN_SLUG, MAIN_NAME, parent["id"], 20)
    volumes_category = category(VOLUME_SLUG, VOLUME_NAME, main_category["id"], 10)

    def add_prayer(slug, title, body, category_record, order, source):
        nonlocal next_text_id, next_row_id
        if len(body.strip()) < 30:
            raise ValueError("Empty prayer text: " + slug)
        existing = index.get(slug)
        if existing:
            # Import is idempotent and never silently overwrites edited texts.
            if existing.get("translation", "").strip() != body.strip():
                raise ValueError("Existing prayer differs; manual review required: " + slug)
            item = existing
        else:
            item = {
                "id": next_text_id, "slug": slug, "title": title,
                "title_uk": "", "traditional_title": "",
                "description": "", "description_uk": "",
                "content": "", "traditional_content": "",
                "translation": body, "translation_uk": "", "language": "ru",
                "categories": [category_record], "description_position": "after",
                "source_url": source,
            }
            next_text_id += 1
            index[slug] = item
            changes.append("Add prayer: " + title)
        rows = all_rows.setdefault(category_record["slug"], [])
        linked = [row for row in rows if row.get("text", {}).get("slug") == slug]
        if len(linked) > 1:
            raise ValueError("Duplicate category link: " + slug)
        if not linked:
            row = {"id": next_row_id, "category": category_record, "text": item, "order": order}
            next_row_id += 1
            rows.append(row)
            changes.append("Link prayer: " + title)
        elif int(linked[0]["text"]["id"]) != int(item["id"]):
            raise ValueError("Conflicting category text id: " + slug)

    for order, item in enumerate(original_first, 1):
        add_prayer(item["slug"], item["title"], item["text"], gratitude, order * 10, FIRST_URL)

    for i, prayer in enumerate(named):
        label = prayer["title"]
        if label == "Молитва ко Господу":
            label += " (Имя Тебе — Любовь)" if i == 3 else " (Даждь ми любити ближняго)"
        slug = f"ioann-kronstadt-azbyka-prayer-{i+1:02d}"
        add_prayer(slug, label, prayer["text"], main_category, (i+1) * 10, SECOND_URL)

    for i, volume in enumerate(volumes, 1):
        add_prayer(f"ioann-kronstadt-moya-zhizn-tom-{i}", VOLUME_TITLES[i-1],
                   volume["text"], volumes_category, i * 10, SECOND_URL)

    assert len(all_rows[GRATITUDE_SLUG]) >= 3
    assert sum(r["text"]["slug"].startswith("ioann-kronstadt-azbyka-prayer-")
               for r in all_rows[MAIN_SLUG]) == 15
    assert sum(r["text"]["slug"].startswith("ioann-kronstadt-moya-zhizn-tom-")
               for r in all_rows[VOLUME_SLUG]) == 3
    print("Parsed: 3 gratitude prayers + 15 titled prayers + 3 volume sections.")
    for message in changes:
        print("  " + message)
    if args.dry_run:
        print("DRY RUN PASS — NO FILES MODIFIED.")
        return
    if not changes:
        print("PASS: both collections already installed. Nothing changed.")
        return
    # Keep full offline payload canonical for the search/index pipeline.
    # Deterministic content version; generated_at marks this local export.
    version_basis = {k: v for k, v in data.items()
                     if k not in {"schema_version", "content_version", "generated_at"}}
    canonical = json.dumps(version_basis, ensure_ascii=False, sort_keys=True,
                           separators=(",", ":")).encode("utf-8")
    data["content_version"] = hashlib.sha256(canonical).hexdigest()
    data["generated_at"] = datetime.now(timezone.utc).isoformat()
    is_pretty = original_bytes[len(bom):].lstrip().startswith(b"{\n")
    serialized = json.dumps(data, ensure_ascii=False, indent=2 if is_pretty else None)
    serialized += "\n"
    if b"\r\n" in original_bytes:
        serialized = serialized.replace("\n", "\r\n")
    output = bom + serialized.encode("utf-8")
    snapshot = ROOT.parent / "build-backups" / (
        "ioann-kronstadt-catalog-before-" + datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f"))
    snapshot.mkdir(parents=True, exist_ok=False)
    shutil.copy2(CONTENT, snapshot / CONTENT.name)
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(dir=CONTENT.parent, prefix=".prayers-import-",
                                         suffix=".json", delete=False) as tmp:
            tmp.write(output)
            temp_path = Path(tmp.name)
        verified = json.loads(temp_path.read_text(encoding="utf-8-sig"))
        if len(verified["category_texts"][MAIN_SLUG]) < 15:
            raise ValueError("Final validation failed")
        os.replace(temp_path, CONTENT)
    finally:
        if temp_path and temp_path.exists():
            temp_path.unlink()
    print("PASS: both collections installed in offlineContent.json")
    print("Backup:", snapshot / CONTENT.name)
    print("Next: rebuild search seed before APK/release; backend export overwrites this file.")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--second-html", help="Downloaded full HTML of the second Azbyka page (offline input)")
    args = p.parse_args()
    try:
        main(args)
    except Exception as exc:
        raise SystemExit("IMPORT ABORTED — no project files modified: " + str(exc))
