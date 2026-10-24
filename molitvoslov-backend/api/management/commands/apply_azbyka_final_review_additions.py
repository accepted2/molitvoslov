"""Conservative, additive-only repair of the final audit's REVIEW dates.

Never removes existing entries, never relabels them, never writes Supabase.
Requires live source multiplicity to match the frozen audit JSONL.
Prepare caches a fully reviewed plan; apply requires explicit opt-in.
"""
import json
import uuid
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path
import requests
from bs4 import BeautifulSoup
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connections,transaction

from api.azbyka_calendar_readings import extract_readings_text,parse_readings_text
from api.calendar_models import CalendarDay,CalendarReading
from api.sqlite_backup import create_sqlite_backup
from api.management.commands.reconcile_azbyka_problem_days import keys,section_source,snapshot,sha,unsafe_label

AUDIT=Path("reports/azbyka_final_2025_2027/daily.jsonl")
PLAN=Path("reports/azbyka_final_2025_2027/review_additions_plan.json")
ALLOWED={"REVIEW"}

def ref_key(value):
    k=keys(value)
    if sum(k.values())!=1:
        raise ValueError("Expected exactly one Scripture reference: "+value)
    return next(iter(k))

def multiset(rows):
    return Counter(ref_key(row["title"]) for row in rows)

def plan_for_day(day, existing,parsed,report):
    old=multiset(existing)
    new=multiset(parsed)
    expected_missing=Counter(tuple(x) for x in report.get("db_missing",[]))
    # audit reports all reference deltas, never accept different live source
    actual_missing=new-old
    if actual_missing!=expected_missing:
        raise ValueError("Live source differs from completed audit; cannot auto-repair")
    if old-new:
        # An existing optional/alternate reference should not be deleted.
        # It is safe to add missing source references regardless, but the
        # day must be reviewed as a whole before further writes.
        return [],"Manual review: SQLite contains reference absent from source"
    deficit=Counter(actual_missing)
    additions=[]
    for p in parsed:
        k=ref_key(p["title"])
        if deficit[k]<=0:
            continue
        if unsafe_label(p["label"]):
            raise ValueError("Unreliable service label for "+p["title"])
        # A source occurrence is selected only when still missing from SQLite.
        additions.append(p)
        deficit[k]-=1
    if any(deficit.values()):
        raise ValueError("Could not match missing references to parsed readings")
    return additions,""


class Command(BaseCommand):
    help="Add only source-confirmed missing references from final REVIEW days to local SQLite"

    def add_arguments(self,p):
        mode=p.add_mutually_exclusive_group(required=True)
        mode.add_argument("--prepare",action="store_true")
        mode.add_argument("--apply",action="store_true")
        p.add_argument("--audit",type=Path,default=AUDIT)
        p.add_argument("--plan",type=Path,default=PLAN)

    def handle(self,*args,**opts):
        if connections["default"].vendor!="sqlite":
            raise CommandError("SQLite only")
        if opts["prepare"]:
            return self.prepare(opts)
        return self.apply(opts)

    def prepare(self,opts):
        if not opts["audit"].is_file():
            raise CommandError("Missing audit JSONL: "+str(opts["audit"]))
        seen={}
        for line in opts["audit"].read_text(encoding="utf8").splitlines():
            if line.strip():
                r=json.loads(line)
                if r.get("status") in ALLOWED:
                    seen[r["date"]]=r
        if len(seen)!=20:
            raise CommandError("Expected exactly 20 REVIEW dates; got "+str(len(seen)))
        dates=sorted(seen)
        baseline=snapshot([date.fromisoformat(ds) for ds in dates])
        by_day=defaultdict(list)
        for row in baseline:
            by_day[row["date"]].append(row)
        prepared={}
        blocked={}
        with requests.Session() as session:
            session.headers.update({"User-Agent":"MolitvoslovCalendarAudit/1.0"})
            for ds in dates:
                try:
                    res=session.get("https://azbyka.ru/days/"+ds,timeout=25)
                    res.raise_for_status()
                    soup=BeautifulSoup(res.text,"lxml")
                    raw=keys(section_source(soup))
                    extracted=keys(extract_readings_text(res.text))
                    parsed=[dict(kind=p.kind,label=p.label,title=p.title,order=p.order)
                            for p in parse_readings_text(extract_readings_text(res.text))]
                    parsed_refs=multiset(parsed)
                    if raw!=extracted or raw!=parsed_refs:
                        raise ValueError("Source/parsed reference counts diverge")
                    additions,reason=plan_for_day(ds,by_day[ds],parsed,seen[ds])
                    if reason:
                        blocked[ds]=reason
                        self.stdout.write(f"SKIP {ds}: {reason}")
                    else:
                        prepared[ds]=additions
                        self.stdout.write(f"READY {ds}: add {len(additions)}")
                except (requests.RequestException,ValueError) as e:
                    blocked[ds]=str(e)
                    self.stderr.write(f"SKIP {ds}: {e}")
        plan=dict(version=1,selected=sorted(prepared),additions=prepared,blocked=blocked,
                  baseline_rows=[r for r in baseline if r["date"] in prepared],
                  baseline_sha256=sha([r for r in baseline if r["date"] in prepared]))
        path=opts["plan"]
        path.parent.mkdir(parents=True,exist_ok=True)
        path.write_text(json.dumps(plan,ensure_ascii=False,indent=2),encoding="utf8")
        self.stdout.write(f"PLAN: {path.resolve()}")
        self.stdout.write(f"READY: {len(prepared)} days / {sum(map(len,prepared.values()))} new readings; SKIPPED: {len(blocked)}")
        self.stdout.write("No changes; use --apply for local SQLite only.")

    def apply(self,opts):
        if not opts["plan"].is_file():
            raise CommandError("No saved plan; run --prepare")
        plan=json.loads(opts["plan"].read_text(encoding="utf8"))
        if plan.get("version")!=1:
            raise CommandError("Unexpected plan version")
        selected=plan["selected"]
        if not selected or set(selected)!=set(plan["additions"]):
            raise CommandError("Incomplete plan")
        dates=[date.fromisoformat(ds) for ds in selected]
        baseline=snapshot(dates)
        if sha(baseline)!=plan["baseline_sha256"]:
            raise CommandError("SQLite changed since plan; rerun --prepare")
        dayids=dict(CalendarDay.objects.filter(date_gregorian__in=dates)
                    .values_list("date_gregorian","pk"))
        if len(dayids)!=len(dates):
            raise CommandError("CalendarDay missing")
        replacement=[]
        for ds in selected:
            existing=[r for r in baseline if r["date"]==ds]
            next_order=max((r["order"] for r in existing),default=0)+10
            for p in plan["additions"][ds]:
                replacement.append(CalendarReading(day_id=dayids[date.fromisoformat(ds)],
                    kind=p["kind"],label=p["label"],title=p["title"],order=next_order,
                    sync_uid=uuid.uuid4()))
                next_order+=10
        if not replacement:
            self.stdout.write("Nothing to add; no changes")
            return
        backup,digest=create_sqlite_backup(Path(settings.DATABASES["default"]["NAME"]),
            Path(settings.BASE_DIR)/"backups"/"sqlite")
        self.stdout.write(f"BACKUP: {backup} SHA256: {digest}")
        baseline_digest=sha(baseline)
        with transaction.atomic():
            if sha(snapshot(dates))!=baseline_digest:
                raise CommandError("Concurrent changes; rolled back")
            CalendarReading.objects.bulk_create(replacement,batch_size=200)
            after=snapshot(dates)
            if len(after)!=len(baseline)+len(replacement):
                raise CommandError("Post-write count mismatch; rollback")
            previous_uids={r["uid"] for r in baseline}
            if not previous_uids.issubset({r["uid"] for r in after}):
                raise CommandError("Original readings changed; rollback")
            for ds in selected:
                before_rows=[r for r in baseline if r["date"]==ds]
                after_rows=[r for r in after if r["date"]==ds]
                desired=Counter((r["kind"],r["label"],r["title"]) for r in plan["additions"][ds])
                added=Counter((r["kind"],r["label"],r["title"]) for r in after_rows
                              if r["uid"] not in previous_uids)
                if desired!=added or len(after_rows)!=len(before_rows)+sum(desired.values()):
                    raise CommandError("Per-day verification failed: "+ds)
        self.stdout.write(f"APPLIED AND VERIFIED: {len(selected)} dates; {len(replacement)} new readings; 0 existing removed.")
        self.stdout.write("Supabase unchanged. Review skipped dates before publishing.")
