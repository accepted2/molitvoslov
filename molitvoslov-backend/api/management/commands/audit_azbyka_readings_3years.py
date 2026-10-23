"""Read-only independent source-vs-parser-vs-SQLite audit for 2025-2027.

Run once over three years, preserving every date's raw reference evidence.
No changes to existing importer, parser or database.
"""
import csv
import json
import re
import time
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from django.core.management.base import BaseCommand, CommandError
from api.azbyka_calendar_readings import (
    REFERENCE_RE, extract_readings_text, parse_readings_text, normalize_space,
)
from api.calendar_models import CalendarReading


def ref_keys(s):
    # Independent regex scan of the DOM text, without invoking extract_readings_text.
    # Retains duplicates to detect missing individual occurrences.
    return [(m.group("book").replace(" ", ""), m.group("verses").replace("-", "–").replace("—", "–"))
            for m in REFERENCE_RE.finditer(s)]


def as_json(v):
    return json.dumps(v, ensure_ascii=False)


def key_title(kind, title):
    # Display-only comparison, deliberately conservative: do not discard zachalo.
    return (kind, re.sub(r"\s+", "", title).replace("-", "–").replace("—", "–"))


def old_section_paragraphs(soup):
    heading = next((h for h in soup.find_all(re.compile(r"^h[1-6]$"))
                    if "чтения" in h.get_text(" ", strip=True).lower()
                    and "священного писания" in h.get_text(" ", strip=True).lower()), None)
    if heading is None:
        return [], "Heading not found"
    level = int(heading.name[1])
    items = []
    for tag in heading.find_all_next():
        if re.fullmatch(r"h[1-6]", tag.name or "") and int(tag.name[1]) <= level:
            break
        if tag.name not in ("p", "li"):
            continue
        if tag.find_parent(["p", "li"]):
            continue
        text = normalize_space(tag.get_text(" ", strip=True))
        if REFERENCE_RE.search(text):
            items.append(text)
    return items, ""


def collect_dom(soup):
    groups = soup.select(".readings-text .readings-groups")
    if groups:
        # Use all group nodes, not only <p>, so a link in a <div> is not hidden.
        texts = [normalize_space(g.get_text(" ", strip=True)) for g in groups]
        return texts, "groups", len(groups), ""
    paragraphs, reason = old_section_paragraphs(soup)
    return paragraphs, "heading", 0, reason


def records(day):
    return list(CalendarReading.objects.filter(
        day__date_gregorian=day).values("kind", "label", "title", "order"))


class Command(BaseCommand):
    help = "Comprehensive read-only 2025-2027 Azbyka DOM/parser/SQLite audit; detailed CSV and JSON"

    def add_arguments(self, parser):
        parser.add_argument("--start-year", type=int, default=2025)
        parser.add_argument("--end-year", type=int, default=2027)
        parser.add_argument("--output-dir", default="reports/azbyka_full_audit")
        parser.add_argument("--delay", type=float, default=0.35)
        parser.add_argument("--timeout", type=int, default=25)

    def handle(self, *args, **opts):
        y1, y2 = opts["start_year"], opts["end_year"]
        if y1 < 2025 or y2 > 2027 or y1 > y2:
            raise CommandError("Year range must be within 2025-2027")
        output = Path(opts["output_dir"])
        output.mkdir(parents=True, exist_ok=True)
        summary, details = [], []
        counters = defaultdict(Counter)
        start, end = date(y1, 1, 1), date(y2, 12, 31)
        db = defaultdict(list)
        for r in CalendarReading.objects.filter(day__date_gregorian__gte=start, day__date_gregorian__lte=end).select_related("day"):
            db[r.day.date_gregorian.isoformat()].append(dict(kind=r.kind, label=r.label, title=r.title, order=r.order))
        with requests.Session() as session:
            current = start
            while current <= end:
                ds = current.isoformat()
                item = dict(date=ds, year=current.year, source_layout="", group_count=0,
                            status="", raw_refs=0, extracted_refs=0, parsed_refs=0,
                            sqlite_refs=len(db[ds]), parser_distinct=0,
                            source_missing="", parser_extra="", sqlite_only="", parser_only="",
                            error="")
                detail = dict(date=ds, source_paragraphs=[], raw_references=[],
                              extracted_references=[], parsed=[], sqlite=db[ds],
                              raw_only=[], extracted_only=[], parsed_only=[], sqlite_only=[], error="")
                try:
                    response = session.get("https://azbyka.ru/days/"+ds, timeout=opts["timeout"],
                                           headers={"User-Agent":"MolitvoslovCalendarImporter/1.0 (personal church-calendar data import)"})
                    response.raise_for_status()
                    soup = BeautifulSoup(response.text, "lxml")
                    parts, layout, group_count, error = collect_dom(soup)
                    item["source_layout"], item["group_count"] = layout, group_count
                    if error:
                        raise ValueError(error)
                    raw = ref_keys(" ; ".join(parts))
                    extracted_text = extract_readings_text(response.text)
                    extracted = ref_keys(extracted_text)
                    parsed = parse_readings_text(extracted_text)
                    # Parser intentionally deduplicates exact (kind,label,title).
                    unique = {(p.kind,p.label,p.title) for p in parsed}
                    db_keys = {key_title(p["kind"],p["title"]) for p in db[ds]}
                    parser_keys = {key_title(p.kind,p.title) for p in parsed}
                    only_raw = list((Counter(raw)-Counter(extracted)).elements())
                    only_extracted = list((Counter(extracted)-Counter(raw)).elements())
                    only_db = sorted(db_keys-parser_keys)
                    only_parser = sorted(parser_keys-db_keys)
                    item.update(raw_refs=len(raw),extracted_refs=len(extracted),parsed_refs=len(parsed),
                                parser_distinct=len(unique),source_missing=as_json(only_raw),
                                parser_extra=as_json(only_extracted),sqlite_only=as_json(only_db),
                                parser_only=as_json(only_parser))
                    detail.update(source_paragraphs=parts,raw_references=raw,extracted_references=extracted,
                                  parsed=[dict(kind=p.kind,label=p.label,title=p.title,order=p.order) for p in parsed],
                                  raw_only=only_raw,extracted_only=only_extracted,parsed_only=only_parser,
                                  sqlite_only=only_db)
                    if only_raw or only_extracted:
                        item["status"]="SOURCE_EXTRACTION_MISMATCH"
                    elif len(parsed)!=len(extracted):
                        item["status"]="PARSE_OR_DEDUP_REVIEW"
                    elif only_db or only_parser:
                        item["status"]="DB_DIFFERENCE"
                    else:
                        item["status"]="MATCH"
                except Exception as exc:
                    item["status"]="ERROR"
                    item["error"]=str(exc)
                    detail["error"]=str(exc)
                summary.append(item)
                # Keep complete evidence for every day, not just anomalies.
                details.append(detail)
                counters[current.year][item["status"]]+=1
                if len(summary)%50==0:
                    self.stdout.write(f"PROGRESS: {len(summary)} / {(end-start).days+1} pages")
                if current<end and opts["delay"]>0:
                    time.sleep(opts["delay"])
                current += timedelta(days=1)
        csv_file = output/"summary.csv"
        with csv_file.open("w", encoding="utf-8-sig",newline="") as f:
            writer=csv.DictWriter(f,fieldnames=list(summary[0].keys()),delimiter=";")
            writer.writeheader(); writer.writerows(summary)
        json_file=output/"details.json"
        json_file.write_text(as_json(details),encoding="utf8")
        for year in range(y1,y2+1):
            self.stdout.write(f"YEAR {year}: "+" ".join(f"{k}={v}" for k,v in sorted(counters[year].items())))
            data=[r for r in summary if r["year"]==year]
            self.stdout.write("  STRUCTURES: "+str(dict(Counter(r["source_layout"] for r in data))))
            self.stdout.write(f"  DOM REFERENCES={sum(r['raw_refs'] for r in data)}, EXTRACTED={sum(r['extracted_refs'] for r in data)}, PARSED={sum(r['parsed_refs'] for r in data)}, SQLITE={sum(r['sqlite_refs'] for r in data)}")
        self.stdout.write(f"CSV: {csv_file.resolve()}")
        self.stdout.write(f"DETAILS: {json_file.resolve()}")
        self.stdout.write("No database writes. MATCH is textual equality, not a liturgical ruling.")
