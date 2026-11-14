"""Conservative curated repairs for four calendar dates from captured source HTML.

Only affects CalendarReading on four precisely identified days.
Requires local diagnostic JSON, validates source coverage and existing baseline,
creates SQLite backup and checks entire replacement inside an atomic transaction.
No network and no Supabase.
"""
import json
import uuid
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connections, transaction

from api.calendar_models import CalendarDay, CalendarReading
from api.sqlite_backup import create_sqlite_backup
from api.management.commands.reconcile_azbyka_problem_days import snapshot, sha, keys


DAYS = ("2026-10-09", "2027-03-06", "2027-04-30", "2027-06-20")
LABEL_FRIDAY = (
    ["12 Страстных Евангелий (утреня)"] * 12
    + ["На 1-м часе"] * 2
    + ["На 3-м часе"] * 2
    + ["На 6-м часе"] * 2
    + ["На 9-м часе"] * 2
    + ["На вечерне"] * 6
)


def normalized(rows):
    return [dict(kind=r["kind"], label=r["label"], title=r["title"],
                 order=(i + 1) * 10) for i, r in enumerate(rows)]


def build(day, source, previous):
    parsed=source["parsed"]
    if day=="2026-10-09":
        # Preserve established Utr./Ap. selections; saint's readings are
        # optional and the Apostle can have alternative assignments.
        if len(parsed)!=6 or len(previous)!=3:
            raise CommandError("Unexpected 9 October baseline/source")
        result=[dict(kind=r["kind"],label=r["label"],title=r["title"])
                for r in previous]
        for p in parsed[3:]:
            result.append(dict(kind=p["kind"],label="Свт. Тихона (если служба)",title=p["title"]))
        return normalized(result)
    if day=="2027-03-06":
        if len(parsed)!=4 or len(previous)!=2:
            raise CommandError("Unexpected 6 March baseline/source")
        if [p["label"] for p in parsed] != ["Ряд.","Ряд.","За упокой","За упокой"]:
            raise CommandError("6 March group boundaries changed")
        return normalized(parsed)
    if day=="2027-06-20":
        if len(parsed)!=6 or len(previous)!=3:
            raise CommandError("Unexpected Trinity baseline/source")
        if [p["label"] for p in parsed] != ["Ряд."]*3+["Троицы"]*3:
            raise CommandError("Trinity group boundaries changed")
        return normalized(parsed)
    if day=="2027-04-30":
        if len(parsed)!=26 or len(previous)!=25 or len(LABEL_FRIDAY)!=26:
            raise CommandError("Unexpected Great Friday reading count")
        expected_pairs=[
            ("gospel",)*12,
            ("apostle","gospel")*4,
            ("apostle",)+("gospel",)*5,
        ]
        expected_kinds=[x for group in expected_pairs for x in group]
        if [p["kind"] for p in parsed]!=expected_kinds:
            raise CommandError("Great Friday lectionary ordering changed")
        return normalized([dict(kind=p["kind"],label=LABEL_FRIDAY[i],title=p["title"])
                           for i,p in enumerate(parsed)])
    raise CommandError("Date not allowlisted: "+day)


class Command(BaseCommand):
    help="Preview/apply four explicitly checked exceptions to local SQLite only"

    def add_arguments(self, parser):
        parser.add_argument("--diagnostics",type=Path,default=Path("reports/azbyka_remaining_14_diagnostics.json"))
        parser.add_argument("--apply",action="store_true",help="Commit after all checks and SQLite backup")

    def handle(self, *args, **opts):
        if connections["default"].vendor!="sqlite":
            raise CommandError("SQLite only; refuse nonlocal or Supabase writes")
        path=opts["diagnostics"]
        if not path.is_file():
            raise CommandError("Missing diagnosis JSON: "+str(path))
        doc=json.loads(path.read_text(encoding="utf8"))
        if doc.get("version")!=1:
            raise CommandError("Unexpected diagnostics version")
        records={r["date"]:r for r in doc["results"]}
        dates=[date.fromisoformat(ds) for ds in DAYS]
        original=snapshot(dates)
        old_by=defaultdict(list)
        for r in original:
            old_by[r["date"]].append(r)
        replacement_by={}
        for ds in DAYS:
            entry=records.get(ds)
            if not entry or "parsed" not in entry or entry.get("error"):
                raise CommandError("Missing reliable captured source for "+ds)
            if not entry.get("dom_extraction_equal") or not entry.get("dom_parsed_equal"):
                raise CommandError("Source/extraction/parser coverage differs: "+ds)
            existing=[dict(kind=r["kind"],label=r["label"],title=r["title"],order=r["order"]) for r in old_by[ds]]
            if Counter(tuple(sorted(r.items())) for r in existing)!=Counter(
                   tuple(sorted(r.items())) for r in entry["existing"]):
                raise CommandError("Local SQLite baseline changed after diagnosis: "+ds)
            proposed=build(ds,entry,old_by[ds])
            oldrefs=Counter((r["kind"],r["title"]) for r in old_by[ds])
            newrefs=Counter((r["kind"],r["title"]) for r in proposed)
            if oldrefs-newrefs:
                raise CommandError("Existing passage lost on "+ds+": "+str(oldrefs-newrefs))
            if ds=="2026-10-09":
                # Existing selections and extra optional ones from captured source.
                if any((p["kind"],p["title"]) not in newrefs for p in entry["parsed"]):
                    raise CommandError("9 October lost a source passage")
            else:
                if Counter((p["kind"],p["title"]) for p in entry["parsed"])!=newrefs:
                    raise CommandError("Source passage multiplicity mismatch: "+ds)
            replacement_by[ds]=proposed
            self.stdout.write(f'CHECK {ds}: {len(old_by[ds])} -> {len(proposed)} readings')
        self.stdout.write("OTHER DAYS: 2026-06-22, 2026-07-24, 2027-12-04 and 7 blank-source dates untouched")
        if not opts["apply"]:
            self.stdout.write("PREVIEW ONLY: SQLite and Supabase unchanged. Rerun with --apply.")
            return
        day_ids=dict(CalendarDay.objects.filter(date_gregorian__in=dates).values_list("date_gregorian","pk"))
        if len(day_ids)!=len(DAYS):
            raise CommandError("Missing CalendarDay: no write")
        old_uids=defaultdict(list)
        for row in original:
            old_uids[(row["date"],row["kind"],row["label"],row["title"])].append(uuid.UUID(row["uid"]))
        rows=[]
        for ds in DAYS:
            for r in replacement_by[ds]:
                key=(ds,r["kind"],r["label"],r["title"])
                uid=old_uids[key].pop(0) if old_uids[key] else uuid.uuid4()
                rows.append(CalendarReading(day_id=day_ids[date.fromisoformat(ds)],sync_uid=uid,**r))
        source=Path(settings.DATABASES["default"]["NAME"])
        backup,checksum=create_sqlite_backup(source,Path(settings.BASE_DIR)/"backups"/"sqlite")
        self.stdout.write(f"BACKUP: {backup} SHA256: {checksum}")
        baseline_sha=sha(original)
        with transaction.atomic():
            if sha(snapshot(dates))!=baseline_sha:
                raise CommandError("Concurrent SQLite changes; rolled back")
            CalendarReading.objects.filter(day__date_gregorian__in=dates).delete()
            CalendarReading.objects.bulk_create(rows,batch_size=200)
            for ds in DAYS:
                actual=list(CalendarReading.objects.filter(day__date_gregorian=ds)
                            .values("kind","label","title","order"))
                expected=replacement_by[ds]
                def bag(values):
                    return Counter((v["kind"],v["label"],v["title"],v["order"]) for v in values)
                if bag(actual)!=bag(expected):
                    raise CommandError("Postwrite mismatch; rollback: "+ds)
        self.stdout.write(f"APPLIED AND VERIFIED: {len(DAYS)} days, {len(rows)} reading rows. Supabase untouched.")
