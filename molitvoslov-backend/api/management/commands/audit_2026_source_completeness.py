"""Read-only HTML structure and SQLite audit; fetch each Azbyka date once."""
import csv
import json
import re
import time
from collections import Counter
from datetime import date, timedelta
from pathlib import Path
import requests
from bs4 import BeautifulSoup
from django.core.management.base import BaseCommand
from api.azbyka_calendar_readings import (
    REFERENCE_RE, extract_readings_text, parse_readings_text, normalize_space,
)
from api.calendar_models import CalendarReading
from api.management.commands.import_2025_unique_readings import distinct_readings


def normalized(title):
    return re.sub(r"\\s+", "", title).replace("-", "–").replace("—", "–")


class Command(BaseCommand):
    help = "Audit raw Azbyka HTML groups, parser completeness, and 2026 SQLite without writes."

    def add_arguments(self, parser):
        parser.add_argument("--output", default="reports/audit_2026_source_completeness.csv")
        parser.add_argument("--delay", type=float, default=0.35)

    def handle(self, *args, **opts):
        existing = {}
        for row in CalendarReading.objects.filter(day__date_gregorian__year=2026).select_related("day"):
            existing.setdefault(row.day.date_gregorian.isoformat(), []).append(row)
        report = []
        totals = Counter()
        with requests.Session() as session:
            day, end = date(2026,1,1), date(2026,12,31)
            while day <= end:
                ds = day.isoformat()
                record = dict(date=ds, status="", groups_count=0, raw_reference_count=0,
                              extracted_reference_count=0, parsed_count=0, unique_count=0,
                              sqlite_count=len(existing.get(ds,[])),
                              missing_in_parser="", only_sqlite="", only_source="", error="")
                try:
                    response = session.get("https://azbyka.ru/days/"+ds, timeout=25)
                    response.raise_for_status()
                    soup = BeautifulSoup(response.text,"lxml")
                    groups = soup.select(".readings-text .readings-groups")
                    record["groups_count"]=len(groups)
                    if len(groups)!=1:
                        record["status"]="STRUCTURE_REVIEW"
                    else:
                        # Count all Bible references throughout the dedicated DOM node,
                        # independent of extract_readings_text's paragraph selection.
                        raw_text=normalize_space(groups[0].get_text(" ",strip=True))
                        raw_refs=[(m.group("book"),m.group("verses")) for m in REFERENCE_RE.finditer(raw_text)]
                        record["raw_reference_count"]=len(raw_refs)
                        extracted=extract_readings_text(response.text)
                        extracted_refs=[(m.group("book"),m.group("verses")) for m in REFERENCE_RE.finditer(extracted)]
                        record["extracted_reference_count"]=len(extracted_refs)
                        if Counter(raw_refs)!=Counter(extracted_refs):
                            record["status"]="EXTRACTION_MISSING_REFERENCES"
                        unique=distinct_readings(parse_readings_text(extracted))
                        record["parsed_count"]=len(parse_readings_text(extracted))
                        record["unique_count"]=len(unique)
                        if len(extracted_refs)!=record["parsed_count"]:
                            record["status"]="PARSING_REVIEW"
                        source_keys={(r.kind,normalized(r.title)) for r in unique}
                        db_keys={(r.kind,normalized(r.title)) for r in existing.get(ds,[])}
                        record["only_sqlite"]=json.dumps(sorted(db_keys-source_keys),ensure_ascii=False)
                        record["only_source"]=json.dumps(sorted(source_keys-db_keys),ensure_ascii=False)
                        if not record["status"]:
                            record["status"]="DIFFERENCE" if db_keys!=source_keys else "MATCH"
                except Exception as exc:
                    record["status"]="ERROR"
                    record["error"]=repr(exc)
                totals[record["status"]]+=1
                report.append(record)
                if day<end and opts["delay"]>0:
                    time.sleep(opts["delay"])
                day+=timedelta(days=1)
        output=Path(opts["output"])
        output.parent.mkdir(parents=True,exist_ok=True)
        with output.open("w",encoding="utf-8-sig",newline="") as file:
            writer=csv.DictWriter(file,fieldnames=list(report[0].keys()),delimiter=";")
            writer.writeheader();writer.writerows(report)
        self.stdout.write("SUMMARY: "+" ".join(f"{key}={value}" for key,value in sorted(totals.items())))
        self.stdout.write("SOURCE UNIQUE TOTAL: "+str(sum(r["unique_count"] for r in report)))
        self.stdout.write("SQLITE TOTAL: "+str(sum(r["sqlite_count"] for r in report)))
        self.stdout.write("REPORT: "+str(output.resolve()))
        self.stdout.write("No database changes.")
