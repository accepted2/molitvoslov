"""Read-only DOM structure audit of Azbyka daily reading sections for 2025-2027."""
import csv
import json
import time
from collections import Counter, defaultdict
from datetime import date, timedelta, datetime
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from django.core.management.base import BaseCommand
from api.azbyka_calendar_readings import REFERENCE_RE, extract_readings_text, parse_readings_text, normalize_space


def refs(text):
    return Counter((m.group("book").replace(" ", ""), m.group("verses").replace("-", "–").replace("—", "–"))
                   for m in REFERENCE_RE.finditer(text))


def ancestor_readings_sections(soup):
    heads = soup.select("h1,h2,h3,h4,h5,h6")
    target = next((h for h in heads if "чтения" in h.get_text(" ",strip=True).lower()
                   and "священного писания" in h.get_text(" ",strip=True).lower()), None)
    if target is None:
        return None, []
    level = int(target.name[1])
    nodes = []
    for tag in target.find_all_next():
        if tag.name in {"h1","h2","h3","h4","h5","h6"} and int(tag.name[1]) <= level:
            break
        # Highest-level paragraphs capture independent readings and explanatory text.
        if tag.name in {"p", "li"} and not tag.find_parent(["p","li"]):
            nodes.append(tag)
    return target, nodes


class Command(BaseCommand):
    help = "Read-only structural audit of all Azbyka days from 2025 through 2027; saves per-day CSV."

    def add_arguments(self, parser):
        parser.add_argument("--start-year", type=int, default=2025)
        parser.add_argument("--end-year", type=int, default=2027)
        parser.add_argument("--delay", type=float, default=0.35)
        parser.add_argument("--output", default="reports/azbyka_structure_2025_2027.csv")

    def handle(self, *args, **opts):
        if not (2025 <= opts["start_year"] <= opts["end_year"] <= 2027):
            raise ValueError("Supported years: 2025-2027")
        rows = []
        output = Path(opts["output"])
        output.parent.mkdir(parents=True,exist_ok=True)
        fields = ["date","year","http_status","status","readings_text_count","readings_groups_count",
                  "all_groups_count","groups_ref_count","group_unique_references",
                  "groups_paragraphs","group_reading_paragraphs","outside_reading_paragraphs",
                  "outside_references","outside_examples","extracted_ref_count",
                  "parser_reading_count","missing_dom_references","extra_parser_references","error"]
        begin = date(opts["start_year"],1,1)
        end = date(opts["end_year"],12,31)
        with requests.Session() as session:
            current = begin
            while current <= end:
                day = current.isoformat()
                row = {k:"" for k in fields}
                row.update(date=day,year=current.year,status="ERROR")
                try:
                    res = session.get("https://azbyka.ru/days/"+day,timeout=25,headers={
                        "User-Agent":"MolitvoslovCalendarImporter/1.0 (personal church-calendar data import)"})
                    row["http_status"]=res.status_code
                    res.raise_for_status()
                    soup = BeautifulSoup(res.text,"lxml")
                    sections = soup.select(".readings-text")
                    groups = soup.select(".readings-text .readings-groups")
                    allgroups = soup.select(".readings-groups")
                    row["readings_text_count"]=len(sections)
                    row["readings_groups_count"]=len(groups)
                    row["all_groups_count"]=len(allgroups)
                    combined_text = " ; ".join(normalize_space(g.get_text(" ",strip=True)) for g in groups)
                    group_refs=refs(combined_text)
                    row["groups_ref_count"]=sum(group_refs.values())
                    row["group_unique_references"]=len(group_refs)
                    ps = [p for g in groups for p in g.find_all(["p","li"]) if not p.find_parent(["p","li"])]
                    row["groups_paragraphs"]=len(ps)
                    row["group_reading_paragraphs"]=sum(bool(REFERENCE_RE.search(p.get_text(" ",strip=True))) for p in ps)
                    heading, section_paragraphs=ancestor_readings_sections(soup)
                    outside=[p for p in section_paragraphs if not p.find_parent(class_="readings-groups")
                             and REFERENCE_RE.search(p.get_text(" ",strip=True))]
                    row["outside_reading_paragraphs"]=len(outside)
                    outside_counter=Counter()
                    for p in outside:
                        outside_counter.update(refs(p.get_text(" ",strip=True)))
                    row["outside_references"]=sum(outside_counter.values())
                    row["outside_examples"]=json.dumps([normalize_space(p.get_text(" ",strip=True))[:240] for p in outside[:3]],ensure_ascii=False)
                    extracted=extract_readings_text(res.text)
                    parsed=parse_readings_text(extracted)
                    extracted_refs=refs(extracted)
                    row["extracted_ref_count"]=sum(extracted_refs.values())
                    row["parser_reading_count"]=len(parsed)
                    # Check the raw complete DOM text against the exact extracted reference multiset.
                    missing=group_refs-extracted_refs
                    extra=extracted_refs-group_refs
                    row["missing_dom_references"]=json.dumps(list(missing.elements()),ensure_ascii=False)
                    row["extra_parser_references"]=json.dumps(list(extra.elements()),ensure_ascii=False)
                    if len(groups)!=1 or len(sections)!=1:
                        row["status"]="STRUCTURE_VARIANT"
                    elif missing or extra:
                        row["status"]="DOM_EXTRACTION_DIFFERENCE"
                    elif outside:
                        row["status"]="OUTSIDE_REFERENCE_REVIEW"
                    elif len(parsed)!=sum(extracted_refs.values()):
                        row["status"]="PARSE_COUNT_REVIEW"
                    else:
                        row["status"]="MATCH"
                except Exception as exc:
                    row["error"]=str(exc)
                rows.append(row)
                if len(rows)%50==0:
                    self.stdout.write(f"Progress: {len(rows)} days")
                if current<end and opts["delay"]>0:
                    time.sleep(opts["delay"])
                current+=timedelta(days=1)
        with output.open("w",encoding="utf-8-sig",newline="") as stream:
            writer=csv.DictWriter(stream,fieldnames=fields,delimiter=";")
            writer.writeheader()
            writer.writerows(rows)
        totals=Counter(r["status"] for r in rows)
        self.stdout.write("DAYS: "+str(len(rows)))
        for year in range(opts["start_year"],opts["end_year"]+1):
            subset=[r for r in rows if r["year"]==year]
            stat=Counter(r["status"] for r in subset)
            self.stdout.write(f"YEAR {year}: days={len(subset)} "+ " ".join(f"{k}={v}" for k,v in sorted(stat.items())))
            self.stdout.write(f"  group_count_1={sum(r['readings_groups_count']==1 for r in subset)}"
                              f" missing_groups={sum(r['readings_groups_count']==0 for r in subset)}"
                              f" multiple_groups={sum(r['readings_groups_count']>1 for r in subset)}"
                              f" outside_ref_days={sum(int(r['outside_references'] or 0)>0 for r in subset)}")
        self.stdout.write("TOTAL: "+" ".join(f"{k}={v}" for k,v in sorted(totals.items())))
        self.stdout.write("CSV: "+str(output.resolve()))
        self.stdout.write("No database changes. A MATCH verifies structure/reference extraction, not theological correctness.")
