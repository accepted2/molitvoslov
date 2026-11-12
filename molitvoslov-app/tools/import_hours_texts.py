#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Import liturgical Hours into src/data/hoursTexts.json, for offline reader use.

Requires: python -m pip install requests beautifulsoup4
Run:      python -X utf8 tools/import_hours_texts.py
Optional: python -X utf8 tools/import_hours_texts.py --html-dir reports/hours_html
         python -X utf8 tools/import_hours_texts.py --traditional-dir reports/hours_traditional

Only import materials for which you have the necessary rights. The importer
never replaces verified entries with failed parses and stores provenance
in a separate build report, not in the in-app reading interface.
"""
import argparse
import hashlib
import json
import re
import sys
import time
from pathlib import Path

try:
    import requests
    from bs4 import BeautifulSoup, Tag
except ImportError as error:
    raise SystemExit(
        "Нужны requests и beautifulsoup4: "
        "python -m pip install requests beautifulsoup4"
    ) from error

APP = Path(__file__).resolve().parents[1]
OUTPUT_DEFAULT = APP / "src" / "data" / "hoursTexts.json"
REPORT_DEFAULT = APP / "reports" / "hours_import_report.json"

HOURS = {1: "ПЕРВЫЙ", 3: "ТРЕТИЙ", 6: "ШЕСТОЙ", 9: "ДЕВЯТЫЙ"}
HOUR_RE = re.compile(r"^(?:ЧАС|ЧАСЪ)\s+(ПЕРВЫЙ|ТРЕТИЙ|ШЕСТОЙ|ДЕВЯТЫЙ|1-?Й|3-?Й|6-?Й|9-?Й)\b", re.I)
ORDER = {"ПЕРВЫЙ": 1, "ТРЕТИЙ": 3, "ШЕСТОЙ": 6, "ДЕВЯТЫЙ": 9,
         "1-Й": 1, "3-Й": 3, "6-Й": 6, "9-Й": 9}
BASE = "https://azbyka.ru/bogosluzhenie/"
PAIRED = {
    "ordinary-1": BASE + "chas-pervyj/",
    "ordinary-3": BASE + "chas-tretij/",
    "ordinary-6": BASE + "chas-shestoj/",
    "ordinary-9": BASE + "chas-devyatyj/",
    "interhour-1": BASE + "mezhdochasie-pervogo-chasa/",
    "interhour-3": BASE + "mezhdochasie-tretego-chasa/",
    "interhour-6": BASE + "mezhdochasie-shestogo-chasa/",
    "interhour-9": BASE + "mezhdochasie-devyatogo-chasa/",
}
ROYAL = {
    "royal-nativity": BASE + "rozhdestvo-hristovo/",
    "royal-theophany": BASE + "svyatoe-bogoyavlenie/",
    "royal-friday": BASE + "strastnaya-sedmicza-velikaya-pyatnicza/",
}
LENTEN = ("https://azbyka.ru/otechnik/Pravoslavnoe_Bogosluzhenie/"
          "pravoslavnyj-molitvoslov-na-dni-velikogo-posta/3")
PASCHAL = "https://azbyka.ru/chasy-pasxalnye"

TOTAL_EXPECTED = 25
MIN_LENGTH = {
    "ordinary": 650, "interhour": 350, "lenten": 500,
    "royal-nativity": 600, "royal-theophany": 600, "royal-friday": 600,
    "paschal": 250,
}

def norm(value):
    value = (value or "").replace("\u00ad", "").replace("\u200b", "")
    value = re.sub(r"[ \t\xa0]+", " ", value)
    value = re.sub(r" *\n *", "\n", value)
    return re.sub(r"\n{3,}", "\n\n", value).strip()

def get_hour(value):
    stripped = norm(value).replace("\n", " ").strip(" .:–—")
    stripped = re.sub(r"\s+", " ", stripped).upper()
    match = HOUR_RE.match(stripped)
    return ORDER.get(match.group(1)) if match else None

def clean_cell(cell):
    clone = BeautifulSoup(str(cell), "html.parser")
    for node in clone.select("script, style, sup, .footnote, .note-number"):
        node.decompose()
    marker = "\uE000"
    for node in clone.select("br"):
        node.replace_with(marker)
    for node in clone.select("p, h2, h3, h4, h5, li, blockquote"):
        node.insert_before(marker)
        node.insert_after(marker)
    return norm(clone.get_text(" ", strip=True).replace(marker, "\n"))

def heading_from_cell(cell):
    for head in cell.find_all(["h2", "h3", "h4", "h5"]):
        value = norm(head.get_text(" ", strip=True))
        if get_hour(value) is not None:
            return value, True
        if 2 < len(value) < 110:
            return value, False
    return "", False

def new_sections():
    return [{"title": "", "rows": []}]

def append_row(sections, church="", russian="", title=""):
    church, russian, title = norm(church), norm(russian), norm(title)
    if not church and not russian:
        return
    if title:
        if not sections[-1]["rows"]:
            sections[-1]["title"] = title
        elif title != sections[-1]["title"]:
            sections.append({"title": title, "rows": []})
    sections[-1]["rows"].append({"church": church, "russian": russian})

def finish_sections(sections):
    return [s for s in sections if s.get("rows")]

def article_node(soup):
    # Choose the largest article-like container with substantive text.
    nodes = []
    for selector in ("article", ".entry-content", ".post-content", ".article-content",
                     "#article", "#content", "main", ".text", ".book-content"):
        nodes.extend(soup.select(selector))
    nodes = [node for node in nodes if len(node.get_text(" ", strip=True)) > 500]
    if not nodes:
        return soup.body or soup
    return max(nodes, key=lambda node: len(node.get_text(" ", strip=True)))

def paired_table_rows(container):
    tables = container.find_all("table")
    candidates = []
    for table in tables:
        rows = table.find_all("tr")
        double_rows = [tr for tr in rows
                       if len(tr.find_all(["td", "th"], recursive=False)) >= 2]
        if len(double_rows) >= 3:
            candidates.append(table)
    return candidates

def parse_paired(html_bytes, default_hour=None, group=None):
    soup = BeautifulSoup(html_bytes, "html.parser")
    root = article_node(soup)
    tables = paired_table_rows(root)
    if not tables:
        # The article selector sometimes matches a summary rather than
        # the real bilingual table. Fall back to the full document.
        tables = paired_table_rows(soup)
        root = soup
    if not tables:
        raise ValueError("Нет двуязычной таблицы ЦС / РУС")

    # Flatten all candidate tables into event stream, respecting headings
    # before, between, and inside tables. No unrelated church-calendar content.
    allowed_table_ids = {id(table) for table in tables}
    sections_by_hour = {hour: new_sections() for hour in HOURS}
    current = default_hour
    seen = set()
    row_count = 0
    for node in root.descendants:
        if not isinstance(node, Tag):
            continue
        if node.name in ("h2", "h3", "h4"):
            if node.find_parent("tr"):
                continue
            h = get_hour(node.get_text(" ", strip=True))
            if h and group:
                current = h
                seen.add(h)
            elif group and current and seen == set(HOURS):
                heading = norm(node.get_text(" ", strip=True)).lower()
                if any(word in heading for word in ("изобразительн", "вечерн", "литург", "утрен")):
                    break
            continue
        if node.name != "tr":
            continue
        enclosing = node.find_parent("table")
        if enclosing is None or id(enclosing) not in allowed_table_ids:
            continue
        cells = node.find_all(["td", "th"], recursive=False)
        if len(cells) < 2:
            # A full-width row may be the beginning of a royal Hour.
            if cells and group:
                candidate = cells[0].find(["h2", "h3", "h4", "h5"])
                h = get_hour(candidate.get_text(" ", strip=True)) if candidate else None
                if h:
                    current = h
                    seen.add(h)
            continue
        left, right = cells[0], cells[1]
        heading, is_hour = heading_from_cell(left)
        right_heading, right_is_hour = heading_from_cell(right)
        h = get_hour(heading) or get_hour(right_heading)
        if h is not None and group:
            current = h
            seen.add(h)
        if current is None:
            continue
        if is_hour or right_is_hour:
            continue
        church, russian = clean_cell(left), clean_cell(right)
        if re.search(r"^церковнославянский$", church, re.I):
            continue
        if re.search(r"^русский$", russian, re.I):
            continue
        short_heading = heading if heading and not get_hour(heading) else right_heading
        if short_heading and not get_hour(short_heading):
            # Work on cloned cells: removing headings must not mutate the
            # document while iterating the original descendant stream.
            left_copy = BeautifulSoup(str(left), "html.parser")
            right_copy = BeautifulSoup(str(right), "html.parser")
            for cell in (left_copy, right_copy):
                for htag in cell.find_all(["h2", "h3", "h4", "h5"]):
                    htag.decompose()
            church, russian = clean_cell(left_copy), clean_cell(right_copy)
        if church or russian:
            append_row(sections_by_hour[current], church, russian,
                       title=short_heading)
            row_count += 1

    results = {}
    for hour in HOURS:
        result = finish_sections(sections_by_hour[hour])
        if result:
            results[hour] = result
    if not results:
        raise ValueError("Нет текста часов после отделения заголовков")
    return results, row_count

def parse_single_lenten(html_bytes):
    soup = BeautifulSoup(html_bytes, "html.parser")
    root = article_node(soup)
    sections = {hour: new_sections() for hour in HOURS}
    current = None
    for node in root.descendants:
        if not isinstance(node, Tag):
            continue
        if node.name in ("h2", "h3", "h4", "h5"):
            hour = get_hour(node.get_text(" ", strip=True))
            if hour:
                current = hour
            elif current and node.name == "h2" and re.search(
                r"изобразительн|вечерн|литург|повечери|полунощниц",
                norm(node.get_text(" ", strip=True)), re.I
            ):
                break
            elif current and 2 < len(node.get_text(" ", strip=True)) < 90:
                text = norm(node.get_text(" ", strip=True))
                if sections[current][-1]["rows"]:
                    sections[current].append({"title": text, "rows": []})
                else:
                    sections[current][-1]["title"] = text
        elif node.name == "p" and current and not node.find_parent(["table", "nav"]):
            text = clean_cell(node)
            if len(text) > 20:
                append_row(sections[current], church=text)
    return {hour: finish_sections(value) for hour, value in sections.items()
            if finish_sections(value)}

def parse_paschal(html_bytes):
    soup = BeautifulSoup(html_bytes, "html.parser")
    root = article_node(soup)
    sections = new_sections()
    inside = False
    for node in root.descendants:
        if not isinstance(node, Tag):
            continue
        if node.name in ("h2", "h3"):
            name = norm(node.get_text(" ", strip=True)).lower()
            if "текст часов пасхи" in name or "текст часов пасх" in name:
                inside = True
            elif inside and (name.startswith("литература") or
                             name.startswith("видео") or name.startswith("примечан")):
                break
        elif node.name == "p" and inside and not node.find_parent("table"):
            value = clean_cell(node)
            if not value or len(value) < 10:
                continue
            if re.match(r"^перевод\s*:", value, re.I):
                translation = re.sub(r"^перевод\s*:\s*", "", value, flags=re.I)
                if sections[-1]["rows"] and not sections[-1]["rows"][-1]["russian"]:
                    sections[-1]["rows"][-1]["russian"] = translation
                else:
                    append_row(sections, russian=translation)
            else:
                append_row(sections, church=value)
    return finish_sections(sections)

def validate(entry_id, sections):
    if not sections:
        return False, "Нет разделов"
    rows = [row for section in sections for row in section["rows"]]
    text = "\n".join((row.get("church") or "") + (row.get("russian") or "")
                     for row in rows)
    total = len(text)
    family = entry_id.rsplit("-", 1)[0] if not entry_id.startswith("paschal") else "paschal"
    threshold = MIN_LENGTH.get(family, 500)
    if total < threshold:
        return False, "Текст слишком короткий (%d, минимум %d)" % (total, threshold)
    if len(rows) < 3:
        return False, "Слишком мало абзацев (%d)" % len(rows)
    if not re.search(r"[А-Яа-яЁёѣѡіꙋ]", text):
        return False, "Нет кириллического текста"
    return True, "строк: %d; символов: %d" % (len(rows), total)

def read_traditional(entry_id, directory):
    if not directory:
        return []
    path = directory / (entry_id + ".txt")
    if not path.is_file():
        return []
    raw = norm(path.read_text(encoding="utf-8-sig"))
    if len(raw) < 250:
        raise ValueError("Слишком короткий ЦС традиционный: " + str(path))
    if not re.search(r"[ѣѡѿꙋєѕѳѵ҃҆]", raw):
        raise ValueError("Не найдено признаков традиционной орфографии: " + str(path))
    result = []
    current = {"title": "", "rows": []}
    for paragraph in re.split(r"\n\s*\n", raw):
        paragraph = norm(paragraph)
        if paragraph.startswith("## "):
            if current["rows"]:
                result.append(current)
            current = {"title": paragraph[3:].strip(), "rows": []}
        elif paragraph:
            current["rows"].append({"traditional": paragraph})
    if current["rows"]:
        result.append(current)
    return result

def fetch_url(url, html_dir, session, force=False):
    key = hashlib.sha256(url.encode("utf-8")).hexdigest()[:16]
    cached = html_dir / (key + ".html")
    if cached.is_file() and not force:
        return cached.read_bytes()
    result = session.get(url, timeout=35)
    result.raise_for_status()
    if len(result.content) < 1000:
        raise ValueError("Слишком короткая веб-страница: " + url)
    html_dir.mkdir(parents=True, exist_ok=True)
    cached.write_bytes(result.content)
    time.sleep(1.0)
    return result.content

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=OUTPUT_DEFAULT)
    parser.add_argument("--report", type=Path, default=REPORT_DEFAULT)
    parser.add_argument("--html-dir", type=Path, default=APP / "reports" / "hours_html")
    parser.add_argument("--traditional-dir", type=Path, default=None)
    parser.add_argument("--force", action="store_true", help="redownload sources")
    parser.add_argument("--strict", action="store_true", help="fail unless all 25 entries valid")
    args = parser.parse_args()

    if args.output.exists():
        corpus = json.loads(args.output.read_text(encoding="utf-8-sig"))
    else:
        corpus = {"version": 1, "entries": {}}
    corpus.setdefault("entries", {})
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Molitvoslov-local-text-import/1.0 (+local editorial review)",
        "Accept-Language": "ru-RU,ru;q=0.9",
    })

    report = {"sources": [], "entries": {}, "errors": []}

    def record(entry_id, sections, url):
        ok, note = validate(entry_id, sections)
        report["entries"][entry_id] = {"valid": ok, "details": note, "source": url}
        if not ok:
            report["errors"].append("%s: %s" % (entry_id, note))
            return
        previous = corpus["entries"].get(entry_id, {})
        traditional = read_traditional(entry_id, args.traditional_dir)
        corpus["entries"][entry_id] = {
            "sections": sections,
            "traditionalSections": traditional or previous.get("traditionalSections", []),
        }

    def run(url, parser_function, target_ids):
        print("Обработка:", url)
        try:
            page = fetch_url(url, args.html_dir, session, force=args.force)
            result = parser_function(page)
            for entry_id, sections in result.items():
                record(entry_id, sections, url)
            for entry_id in target_ids:
                if entry_id not in result:
                    report["errors"].append(entry_id + ": раздел не найден в HTML")
            report["sources"].append({"url": url, "status": "ok"})
        except Exception as error:
            message = "%s: %s" % (url, error)
            print("WARN:", message)
            report["sources"].append({"url": url, "status": "error", "reason": str(error)})
            report["errors"].append(message)

    for entry_id, url in PAIRED.items():
        default_hour = int(entry_id.rsplit("-", 1)[-1])
        run(url, lambda page, eid=entry_id, hour=default_hour:
            {eid: parse_paired(page, default_hour=hour)[0][hour]}, [entry_id])

    for group, url in ROYAL.items():
        ids = [group + "-" + str(hour) for hour in HOURS]
        run(url, lambda page, prefix=group:
            {prefix + "-" + str(hour): section
             for hour, section in parse_paired(page, group=prefix)[0].items()}, ids)

    lenten_ids = ["lenten-" + str(hour) for hour in HOURS]
    run(LENTEN,
        lambda page: {"lenten-" + str(hour): sections
                      for hour, sections in parse_single_lenten(page).items()},
        lenten_ids)

    run(PASCHAL, lambda page: {"paschal-hours": parse_paschal(page)}, ["paschal-hours"])

    # Save an existing traditional corpus without needing to redownload pages.
    if args.traditional_dir:
        for entry_id, value in corpus["entries"].items():
            try:
                extra = read_traditional(entry_id, args.traditional_dir)
                if extra:
                    value["traditionalSections"] = extra
            except Exception as error:
                report["errors"].append(entry_id + ": " + str(error))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(corpus, ensure_ascii=False, indent=2) + "\n",
                           encoding="utf-8")
    report["imported"] = len(corpus["entries"])
    report["expected"] = TOTAL_EXPECTED
    report["missing"] = sorted(
        (set(PAIRED) |
         {group + "-" + str(hour) for group in ROYAL for hour in HOURS} |
         set(lenten_ids) | {"paschal-hours"}) - set(corpus["entries"])
    )
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n",
                           encoding="utf-8")
    print("Сохранено текстов:", len(corpus["entries"]), "из", TOTAL_EXPECTED)
    print("Не импортировано:", ", ".join(report["missing"]) or "нет")
    print("Отчёт:", args.report)
    if args.strict and (report["missing"] or report["errors"]):
        return 1
    return 0 if corpus["entries"] else 1

if __name__ == "__main__":
    sys.exit(main())
