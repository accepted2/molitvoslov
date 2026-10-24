"""Read-only full calendar audit, 2025–2027, SQLite versus Azbyka.

Designed for unattended long runs: incremental JSONL checkpoint, resume, strict
three-way HTML/extraction/parser comparisons and a durable CSV+JSON summary.
No database writes; no Supabase connection. Source coverage is distinct from
liturgical review (alternate services and repeated passages can be legitimate).
"""
import csv
import hashlib
import json
import time
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from django.core.management.base import BaseCommand, CommandError
from django.db import connections

from api.azbyka_calendar_readings import extract_readings_text, parse_readings_text
from api.calendar_models import CalendarDay, CalendarReading
from api.management.commands.reconcile_azbyka_problem_days import keys, section_source, unsafe_label


CONFIRMED_LOCAL = {
    "2027-01-06", "2027-03-15", "2027-03-16", "2027-03-17",
    "2027-03-18", "2027-04-14", "2027-05-29", "2027-12-04",
}
CONFIRMED_ALTERNATIVES = {"2026-06-22", "2026-07-24"}


def dates_in_range():
    day=date(2025,1,1)
    until=date(2027,12,31)
    while day<=until:
        yield day.isoformat()
        day+=timedelta(days=1)


def source_key_counter(readings):
    c=Counter()
    for r in readings:
        c.update(keys(r["title"]))
    return c


def report_day(day, existing, html):
    soup=BeautifulSoup(html,"lxml")
    raw_text=section_source(soup)
    extracted=extract_readings_text(html)
    parsed=[
        dict(kind=p.kind,label=p.label,title=p.title,order=p.order)
        for p in parse_readings_text(extracted)
    ]
    source=keys(raw_text)
    extracted_keys=keys(extracted)
    parsed_keys=source_key_counter(parsed)
    db_keys=source_key_counter(existing)
    dom_missing=list((source-extracted_keys).elements())
    dom_excess=list((extracted_keys-source).elements())
    parsed_missing=list((source-parsed_keys).elements())
    parsed_excess=list((parsed_keys-source).elements())
    db_missing=list((source-db_keys).elements())
    db_extra=list((db_keys-source).elements())
    # Classification intentionally not a blanket "correct/incorrect" judgment:
    # source contains conditional alternatives and sometimes duplicates.
    status="MATCH"
    reasons=[]
    if dom_missing or dom_excess or parsed_missing or parsed_excess:
        status="PARSER_ERROR"
        reasons.append("DOM/extracted/parsed reference multiplicity differs")
    elif db_missing or db_extra:
        status="REVIEW"
        reasons.append("Source and SQLite differ; conditional variants possible")
    bad_labels=[r["label"] for r in parsed if unsafe_label(r["label"])]
    if bad_labels:
        status="REVIEW" if status=="MATCH" else status
        reasons.append("Suspect parsed service labels")
    if day in CONFIRMED_ALTERNATIVES:
        if status=="REVIEW" and not (dom_missing or dom_excess or parsed_missing or parsed_excess):
            status="CONFIRMED_ALTERNATIVES"
        reasons.append("User-confirmed cross-source selection; keep SQLite unchanged")
    if day in CONFIRMED_LOCAL:
        if status in {"REVIEW","MATCH"}:
            status="CONFIRMED_LOCAL"
        reasons.append("User-confirmed local readings; no automatic overwrite")
    duplicate_refs=sum(v-1 for v in db_keys.values() if v>1)
    return dict(date=day,status=status,existing=len(existing),source=sum(source.values()),
                parsed=len(parsed),db_missing=db_missing,db_extra=db_extra,
                parser_missing=parsed_missing,parser_extra=parsed_excess,
                extraction_missing=dom_missing,extraction_extra=dom_excess,
                suspect_labels=bad_labels[:10],repeated_db_references=duplicate_refs,
                reasons=reasons)


class Command(BaseCommand):
    help="Read-only complete 2025–2027 SQLite/Azbyka audit with checkpoints and CSV+JSON"

    def add_arguments(self,parser):
        parser.add_argument("--output-dir",type=Path,default=Path("reports/azbyka_final_2025_2027"))
        parser.add_argument("--resume",action="store_true",
                            help="Resume existing JSONL checkpoint; recheck stored dates only with a fresh run")
        parser.add_argument("--delay",type=float,default=0.15,
                            help="Minimum pause between source requests (seconds)")
        parser.add_argument("--offline",action="store_true",
                            help="Only check SQLite structure without HTTP calls")

    def handle(self,*args,**opts):
        if connections["default"].vendor!="sqlite":
            raise CommandError("Refusing audit against non-SQLite database")
        if opts["delay"]<0:
            raise CommandError("--delay must not be negative")
        out=opts["output_dir"]
        out.mkdir(parents=True,exist_ok=True)
        progress=out/"daily.jsonl"
        all_days=list(dates_in_range())
        # Query only within range and compute all snapshots before any network IO.
        raw=list(CalendarReading.objects.filter(
            day__date_gregorian__range=(date(2025,1,1),date(2027,12,31))
        ).select_related("day").order_by("day__date_gregorian","order","pk")
        .values("day__date_gregorian","kind","label","title","order"))
        by_date=defaultdict(list)
        for r in raw:
            ds=r["day__date_gregorian"].isoformat()
            by_date[ds].append(dict(kind=r["kind"],label=r["label"],title=r["title"],order=r["order"]))
        day_set=set(CalendarDay.objects.filter(
            date_gregorian__range=(date(2025,1,1),date(2027,12,31))
        ).values_list("date_gregorian",flat=True))
        missing_calendar_days=[ds for ds in all_days if date.fromisoformat(ds) not in day_set]
        source_map={}
        if opts["resume"] and progress.exists():
            for line in progress.read_text(encoding="utf8").splitlines():
                if line.strip():
                    entry=json.loads(line)
                    if entry.get("date") in all_days and entry.get("mode")==("offline" if opts["offline"] else "online"):
                        source_map[entry["date"]]=entry
        mode="offline" if opts["offline"] else "online"
        pending=[ds for ds in all_days if ds not in source_map]
        if not opts["resume"] or not progress.exists():
            progress.write_text("",encoding="utf8")
            source_map={}
            pending=all_days
        self.stdout.write(f"AUDIT: {len(all_days)} days; {len(raw)} local readings; pending {len(pending)}; mode={mode}")
        try:
            with requests.Session() as session,progress.open("a",encoding="utf8") as stream:
                session.headers.update({"User-Agent":"MolitvoslovCalendarAudit/1.0 (calendar cross-check)"})
                for index,ds in enumerate(pending,1):
                    existing=by_date[ds]
                    if opts["offline"]:
                        problems=[]
                        if date.fromisoformat(ds) not in day_set: problems.append("No CalendarDay")
                        if not existing: problems.append("No CalendarReading")
                        if any(not keys(r["title"]) for r in existing):
                            problems.append("Unrecognized Scripture reference in SQLite")
                        if any(unsafe_label(r["label"]) for r in existing):
                            problems.append("Suspicious SQLite service label")
                        entry=dict(date=ds,status="LOCAL_REVIEW" if problems else "LOCAL_OK",
                                   existing=len(existing),reasons=problems,mode=mode)
                    else:
                        entry=None
                        for attempt in range(3):
                            try:
                                response=session.get("https://azbyka.ru/days/"+ds,timeout=25)
                                response.raise_for_status()
                                entry=report_day(ds,existing,response.text)
                                entry["mode"]=mode
                                break
                            except (requests.RequestException,ValueError) as exc:
                                if attempt==2:
                                    msg=f"{type(exc).__name__}: {exc}"
                                    status="SOURCE_UNAVAILABLE"
                                    if ds in CONFIRMED_LOCAL:
                                        status="CONFIRMED_LOCAL"
                                    entry=dict(date=ds,status=status,existing=len(existing),
                                               reasons=[msg,"Local records preserved, no overwrite"],
                                               mode=mode)
                                else:
                                    time.sleep(attempt+1)
                        if opts["delay"]:
                            time.sleep(opts["delay"])
                    source_map[ds]=entry
                    stream.write(json.dumps(entry,ensure_ascii=False,sort_keys=True)+"\n")
                    stream.flush()
                    if index%50==0 or index==len(pending):
                        self.stdout.write(f"PROGRESS: {index}/{len(pending)} new checks; last {ds} {entry['status']}")
        except KeyboardInterrupt:
            self.stderr.write("Interrupted safely. Use --resume to continue without rechecking saved dates.")
            return
        rows=[source_map[ds] for ds in all_days]
        counts=Counter(r["status"] for r in rows)
        warnings=[r for r in rows if r["status"] not in {
            "MATCH","LOCAL_OK","CONFIRMED_LOCAL","CONFIRMED_ALTERNATIVES"
        }]
        summary={
            "period":["2025-01-01","2027-12-31"],"calendar_days_expected":len(all_days),
            "calendar_days_present":len(day_set),"calendar_days_missing":missing_calendar_days,
            "local_reading_rows":len(raw),"readings_by_year":{
                str(y):sum(len(by_date[d]) for d in all_days if d.startswith(str(y))) for y in (2025,2026,2027)
            },"days_without_local_readings":[d for d in all_days if not by_date[d]],
            "source_status_counts":dict(sorted(counts.items())),
            "review_count":len(warnings),
            "review_dates":[r["date"] for r in warnings],
            "note":"MATCH means exact reference multiset match, not proof of liturgical service labels. No writes performed.",
        }
        (out/"summary.json").write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding="utf8")
        with (out/"summary.csv").open("w",newline="",encoding="utf-8-sig") as fp:
            writer=csv.writer(fp,delimiter=";")
            writer.writerow(["date","status","sqlite_count","source_count","missing_from_db","extra_in_db","reasons"])
            for r in rows:
                writer.writerow([r["date"],r["status"],r.get("existing",0),r.get("source",""),
                    "|".join(map(str,r.get("db_missing",[]))),
                    "|".join(map(str,r.get("db_extra",[]))),
                    "|".join(r.get("reasons",[]))])
        self.stdout.write(f"COMPLETED: {len(rows)} dates; {len(raw)} local reading rows; review {len(warnings)}; {dict(counts)}")
        self.stdout.write("SUMMARY: "+str((out/"summary.json").resolve()))
        self.stdout.write("CSV: "+str((out/"summary.csv").resolve()))
        self.stdout.write("Read-only. SQLite and Supabase unchanged.")
