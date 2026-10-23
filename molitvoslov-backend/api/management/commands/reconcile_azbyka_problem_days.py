"""Safely replace only audited problem dates, using a frozen reviewed plan.

Prepare uses the old audit CSV to choose dates; verifies exact Scripture reference
multisets in HTML vs extraction vs parser. Apply never fetches network.
SQLite-only; automatic SQLite backup, baseline digest, atomic overwrite,
postwrite verification and UUID reuse. No Supabase writes.
"""
import csv
import hashlib
import json
import re
import uuid
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connections, transaction
from api.azbyka_calendar_readings import REFERENCE_RE, normalize_space, extract_readings_text, parse_readings_text
from api.calendar_models import CalendarDay, CalendarReading
from api.sqlite_backup import create_sqlite_backup


PROTECTED_DATES = {"2026-07-24", "2027-12-04"}

def unsafe_label(label):
    # This parser sometimes captures prose/quoted passages instead of a group.
    return (len(label) > 75
            or "«" in label or "»" in label
            or "..." in label or "…" in label
            or label.startswith(":")
            or bool(re.search(r"\\b(?:бысть|преступи|зач\\.,?\\s*\\d+.*конец)\\b", label, re.I)))

def guard_day(day, previous, proposed):
    if day in PROTECTED_DATES:
        return "Protected complex/ambiguous readings; manual reconciliation required"
    bad=[r["label"] for r in proposed if unsafe_label(r["label"])]
    if bad:
        return "Unreliable labels: "+repr(bad[:3])
    old_by_title=Counter((r["kind"],r["title"]) for r in previous)
    new_by_title=Counter((r["kind"],r["title"]) for r in proposed)
    lost=list((old_by_title-new_by_title).elements())
    if lost:
        return "Existing passages would disappear: "+repr(lost[:8])
    # All labeled assignments must stay labeled unless exact assignment survives elsewhere.
    old_labelled={(r["kind"],r["title"],r["label"]) for r in previous if r["label"]}
    proposed_keys={(r["kind"],r["title"],r["label"]) for r in proposed}
    flattened={(r["kind"],r["title"]) for r in proposed if not r["label"]}
    lost_labels=[x for x in old_labelled if x not in proposed_keys and (x[0],x[1]) in flattened]
    if lost_labels:
        return "Existing service labels would be lost: "+repr(lost_labels[:6])
    return ""

def keys(text):
    return Counter(
        (m.group("book").replace(" ", ""),m.group("verses").replace("-", "–").replace("—", "–"))
        for m in REFERENCE_RE.finditer(text)
    )


def section_source(soup):
    groups=soup.select(".readings-text .readings-groups")
    if groups:
        return " ; ".join(normalize_space(g.get_text(" ", strip=True)) for g in groups)
    h=next((x for x in soup.find_all(re.compile(r"^h[1-6]$"))
            if "чтения" in x.get_text(" ",strip=True).lower()
            and "священного писания" in x.get_text(" ",strip=True).lower()),None)
    if h is None:
        raise ValueError("Reading heading missing")
    level=int(h.name[1])
    parts=[]
    for tag in h.find_all_next():
        if re.fullmatch(r"h[1-6]",tag.name or "") and int(tag.name[1])<=level:
            break
        if tag.name in ("p","li") and not tag.find_parent(("p","li")):
            line=normalize_space(tag.get_text(" ",strip=True))
            if REFERENCE_RE.search(line):
                parts.append(line)
    if not parts:
        raise ValueError("No scripture in heading section")
    return " ; ".join(parts)


def snapshot(dates):
    return [
        dict(id=r.pk,date=r.day.date_gregorian.isoformat(),uid=str(r.sync_uid),
             kind=r.kind,label=r.label,title=r.title,order=r.order)
        for r in CalendarReading.objects.filter(day__date_gregorian__in=dates)
            .select_related("day").order_by("day__date_gregorian","pk")
    ]


def sha(v):
    return hashlib.sha256(json.dumps(v,ensure_ascii=False,sort_keys=True).encode("utf8")).hexdigest()


class Command(BaseCommand):
    help="Audit problematic 2025-2027 days, prepare guarded overwrite plan; apply reviewed plan to local SQLite."

    def add_arguments(self,parser):
        mode=parser.add_mutually_exclusive_group(required=True)
        mode.add_argument("--prepare",action="store_true")
        mode.add_argument("--apply",action="store_true")
        parser.add_argument("--audit",type=Path,default=Path("reports/azbyka_full_audit/summary.csv"))
        parser.add_argument("--plan",type=Path,default=Path("reports/azbyka_problem_reconcile_plan.json"))
        parser.add_argument("--include-errors",action="store_true",
                            help="Attempt source-error dates as well; failures are still blocked")
        parser.add_argument("--accept-removals",action="store_true")

    def handle(self,*args,**opts):
        if connections["default"].vendor!="sqlite":
            raise CommandError("SQLite only; Supabase is never modified")
        if opts["prepare"]:
            return self.prepare(opts)
        return self.apply(opts)

    def prepare(self,opts):
        if not opts["audit"].is_file():
            raise CommandError("Missing prior audit summary CSV: "+str(opts["audit"]))
        with opts["audit"].open(encoding="utf-8-sig",newline="") as f:
            rows=list(csv.DictReader(f,delimiter=";"))
        selected=sorted(set(r["date"] for r in rows
                            if r["status"]!="MATCH"
                            and (opts["include_errors"] or r["status"]!="ERROR")))
        excluded=[r["date"] for r in rows if r["status"]=="ERROR" and not opts["include_errors"]]
        if not selected:
            raise CommandError("No problem dates")
        dates=[date.fromisoformat(s) for s in selected]
        old=snapshot(dates)
        old_by=defaultdict(list)
        for r in old: old_by[r["date"]].append(r)
        proposal={}
        checks=[]
        errors=[]
        with requests.Session() as session:
            for ds in selected:
                try:
                    res=session.get("https://azbyka.ru/days/"+ds,timeout=25,headers={
                        "User-Agent":"MolitvoslovCalendarImporter/1.0 (personal church-calendar data import)"})
                    res.raise_for_status()
                    soup=BeautifulSoup(res.text,"lxml")
                    source=section_source(soup)
                    extracted=extract_readings_text(res.text)
                    parsed=parse_readings_text(extracted)
                    raw,ext=keys(source),keys(extracted)
                    # This parser intentionally retains even exact repetitions.
                    converted=Counter()
                    for p in parsed:
                        found=keys(p.title)
                        if sum(found.values())!=1:
                            raise ValueError("Malformed parsed title: "+p.title)
                        converted.update(found)
                    if not raw or raw!=ext or ext!=converted:
                        raise ValueError("Incomplete extraction / reference parsing: "+
                                         str({"dom_only":list((raw-ext).elements()),
                                              "extraction_only":list((ext-raw).elements()),
                                              "parse_only":list((ext-converted).elements())}))
                    proposed=[dict(kind=p.kind,label=p.label,title=p.title,order=p.order) for p in parsed]
                    if not proposed:
                        raise ValueError("No readings, refusing overwrite")
                    warning=guard_day(ds,old_by[ds],proposed)
                    if warning:
                        raise ValueError(warning)
                    proposal[ds]=proposed
                    old_keys=Counter((r["kind"],r["label"],r["title"]) for r in old_by[ds])
                    new_keys=Counter((r["kind"],r["label"],r["title"]) for r in proposed)
                    checks.append(dict(date=ds,old=len(old_by[ds]),new=len(proposed),
                                       remove=list((old_keys-new_keys).elements()),
                                       add=list((new_keys-old_keys).elements())))
                    self.stdout.write(f"CHECK {ds}: DOM={sum(raw.values())} parsed={len(parsed)} old={len(old_by[ds])}")
                except Exception as exc:
                    errors.append(dict(date=ds,error=str(exc)))
                    self.stderr.write(f"BLOCK {ds}: {exc}")
        plan=dict(version=2,selected=selected,excluded_source_errors=excluded,
                  prepared=proposal,checks=checks,errors=errors,
                  baseline_sha256=sha(old),baseline_rows=old)
        opts["plan"].parent.mkdir(parents=True,exist_ok=True)
        opts["plan"].write_text(json.dumps(plan,ensure_ascii=False,indent=2),encoding="utf8")
        self.stdout.write(f"PLAN: {opts['plan'].resolve()}")
        self.stdout.write(f"READY: {len(proposal)} / {len(selected)} dates; BLOCKED={len(errors)}; preexisting source errors skipped={len(excluded)}")
        self.stdout.write("No changes. Blocked dates require parser correction, not forced overwrite.")

    def apply(self,opts):
        path=opts["plan"]
        if not path.is_file():
            raise CommandError("No plan: "+str(path))
        plan=json.loads(path.read_text(encoding="utf8"))
        if plan.get("version")!=2 or plan.get("errors"):
            raise CommandError("Plan has errors; no writes. Fix blocked dates and prepare again.")
        selected=plan["selected"]
        proposed=plan["prepared"]
        if len(proposed)!=len(selected):
            raise CommandError("Incomplete plan; no writes")
        if not opts["accept_removals"] and any(c["remove"] for c in plan["checks"]):
            raise CommandError("Existing readings will be removed; review checks in plan and specify --accept-removals")
        previous_by=defaultdict(list)
        for row in plan["baseline_rows"]:
            previous_by[row["date"]].append(row)
        for ds in selected:
            issue=guard_day(ds,previous_by[ds],proposed[ds])
            if issue:
                raise CommandError(f"Protected date {ds}: {issue}")
        dates=[date.fromisoformat(s) for s in selected]
        current=snapshot(dates)
        if sha(current)!=plan["baseline_sha256"]:
            raise CommandError("SQLite has changed after preparing; rerun --prepare")
        day_ids=dict(CalendarDay.objects.filter(date_gregorian__in=dates).values_list("date_gregorian","pk"))
        if len(day_ids)!=len(dates):
            raise CommandError("Missing CalendarDay records; no writes")
        old_ids=defaultdict(list)
        for row in current:
            old_ids[(row["date"],row["kind"],row["label"],row["title"])].append(uuid.UUID(row["uid"]))
        replacement=[]
        for ds in selected:
            for p in proposed[ds]:
                k=(ds,p["kind"],p["label"],p["title"])
                uid=old_ids[k].pop(0) if old_ids[k] else uuid.uuid4()
                replacement.append(CalendarReading(
                    sync_uid=uid,day_id=day_ids[date.fromisoformat(ds)],**p))
        source=Path(settings.DATABASES["default"]["NAME"])
        backup,checksum=create_sqlite_backup(source,Path(settings.BASE_DIR)/"backups"/"sqlite")
        self.stdout.write(f"BACKUP: {backup} SHA256: {checksum}")
        with transaction.atomic():
            if sha(snapshot(dates))!=plan["baseline_sha256"]:
                raise CommandError("Concurrent change; rollback")
            CalendarReading.objects.filter(day__date_gregorian__in=dates).delete()
            CalendarReading.objects.bulk_create(replacement,batch_size=500)
            for ds in selected:
                reading=proposed[ds]
                gospel=next((r["title"] for r in reading if r["kind"]=="gospel"),"")
                apostle=next((r["title"] for r in reading if r["kind"]=="apostle"),"")
                CalendarDay.objects.filter(pk=day_ids[date.fromisoformat(ds)]).update(
                    gospel_title=gospel,gospel_title_uk=gospel,
                    apostolic_title=apostle,apostolic_title_uk=apostle)
            actual=defaultdict(list)
            for r in CalendarReading.objects.filter(day__date_gregorian__in=dates).select_related("day"):
                actual[r.day.date_gregorian.isoformat()].append((r.kind,r.label,r.title,r.order))
            for ds in selected:
                expected=Counter((r["kind"],r["label"],r["title"],r["order"]) for r in proposed[ds])
                if Counter(actual[ds])!=expected:
                    raise CommandError("Postwrite mismatch on "+ds+"; transaction rolled back")
        self.stdout.write(f"APPLIED AND VERIFIED: {len(selected)} days, {len(replacement)} reading rows.")
        self.stdout.write(f"SKIPPED SOURCE ERRORS: {plan['excluded_source_errors']}")
        self.stdout.write("Other dates, Supabase untouched.")
