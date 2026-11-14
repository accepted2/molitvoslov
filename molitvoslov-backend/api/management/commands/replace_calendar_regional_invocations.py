"""Conservative changes to generic geographic invocations in unique calendar cards.

Preview by default. --apply creates backup and changes only matched fields;
historical/ambiguous uses are REVIEW, never changed. Writes CSV and JSON
with original text and audit reference URLs. Never touches Supabase.
"""
import csv
import hashlib
import json
import re
from collections import defaultdict
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connections, transaction
from api.calendar_models import CalendarFeast, CalendarDay
from api.sqlite_backup import create_sqlite_backup
from api.management.commands.audit_calendar_historical_terms import TERM, FIELDS

# Only exactly these generic, nonhistorical forms are eligible.
# We do not alter references to peoples, churches, nations, rulers or history.
REPLACEMENTS = (
    ("земли Русския", "земли нашея"),
    ("земли Российския", "земли нашея"),
    ("земли Русской", "земли нашей"),
    ("земле Русской", "земле нашей"),
    ("землю Русскую", "землю нашу"),
    ("земля Русская", "земля наша"),
    ("земли Российской", "земли нашей"),
    ("земле Российской", "земле нашей"),
    ("землю Российскую", "землю нашу"),
    ("земля Российская", "земля наша"),
)
# Don't rewrite historical prose simply because it contains one of the phrases.
APPLY_FIELDS={"troparion_content", "kontakion_content"}
HISTORY=re.compile(
    r"крещени|православн.{0,20}церкв|патриарх|импер|княз|царств|воин|войн|"
    r"государств|летопис|в\s+\d{3,4}\s*г|век[аеу]?\b|из\s+русск|"
    r"рожден|родил|пересел|истори|московск|киевск|владимирск",
    re.I,
)


def make_digest(obj):
    return hashlib.sha256(json.dumps(obj,ensure_ascii=False,sort_keys=True).encode("utf8")).hexdigest()


def match_candidates(value):
    spans=[]
    for old,new in REPLACEMENTS:
        for m in re.finditer(r"(?<![А-Яа-яЁё])"+re.escape(old)+r"(?![А-Яа-яЁё])",value,re.I):
            # Preserve uppercase first letter for sentence-initial references.
            replacement=(new[0].upper()+new[1:]) if m.group()[0].isupper() else new
            spans.append((m.start(),m.end(),m.group(),replacement))
    spans.sort()
    for left,right in zip(spans,spans[1:]):
        if left[1]>right[0]:
            raise ValueError("Overlapping replacements in a single text")
    return spans


class Command(BaseCommand):
    help="Preview/apply narrowly approved Russia/Rus invocations in unique feast card prayers"

    def add_arguments(self,p):
        p.add_argument("--apply",action="store_true")
        p.add_argument("--output",type=Path,default=Path("reports/calendar_regional_replacements"))
        p.add_argument("--all-cards",action="store_true",help="Scan all existing unique feast cards, including outside 2025-2027")

    def handle(self,*args,**opts):
        if connections["default"].vendor!="sqlite":
            raise CommandError("SQLite only")
        ids=None
        if not opts["all_cards"]:
            days=CalendarDay.objects.filter(date_gregorian__year__in=(2025,2026,2027))
            ids=set(x for x in days.values_list("feasts__pk",flat=True) if x)
            ids.update(x for x in days.values_list("main_feast_id",flat=True) if x)
        feasts=CalendarFeast.objects.filter(pk__in=ids) if ids is not None else CalendarFeast.objects.all()
        # Link is to calendar day for human checking, NOT asserted original text provenance.
        related=defaultdict(set)
        for ds,pk in CalendarDay.objects.filter(date_gregorian__year__in=(2025,2026,2027)).values_list("date_gregorian","feasts__pk"):
            if pk: related[pk].add(ds.isoformat())
        for ds,pk in CalendarDay.objects.filter(date_gregorian__year__in=(2025,2026,2027)).values_list("date_gregorian","main_feast_id"):
            if pk: related[pk].add(ds.isoformat())
        decisions=[]
        changes={}
        fingerprints={}
        for feast in feasts.order_by("pk").iterator():
            patches={}
            for field in FIELDS:
                raw=getattr(feast,field) or ""
                if not TERM.search(raw):
                    continue
                candidates=match_candidates(raw)
                approved=[]
                for start,end,original,replacement in candidates:
                    context=raw[max(0,start-110):min(len(raw),end+110)]
                    # Context and all mentions of history in whole prayer are
                    # stronger protection than an overly broad blanket replacement.
                    if field not in APPLY_FIELDS:
                        status="REVIEW_HISTORICAL_OR_PROSE"
                    elif HISTORY.search(raw):
                        status="REVIEW_HISTORICAL_CONTEXT"
                    else:
                        status="AUTO_APPROVED"
                        approved.append((start,end,original,replacement))
                    decisions.append(dict(feast_id=feast.pk,feast_title=feast.title,
                                          field=field,found=original,replacement=replacement,
                                          decision=status,context=context.replace("\n"," "),
                                          source="local SQLite / CalendarFeast",
                                          source_url="",calendar_url=("https://azbyka.ru/days/"+min(related[feast.pk])) if related[feast.pk] else "",
                                          note="Calendar URL is a day reference, not verified text provenance"))
                found_approved={(start,end) for start,end,_,_ in approved}
                for m in TERM.finditer(raw):
                    if any(start<=m.start() and m.end()<=end for start,end in found_approved):
                        continue
                    if any(a<=m.start() and m.end()<=b for a,b,_,_ in candidates):
                        continue
                    decisions.append(dict(feast_id=feast.pk,feast_title=feast.title,
                                          field=field,found=m.group(),replacement="",
                                          decision="REVIEW_NO_SAFE_PATTERN",
                                          context=raw[max(0,m.start()-110):min(len(raw),m.end()+110)].replace("\n"," "),
                                          source="local SQLite / CalendarFeast",source_url="",
                                          calendar_url=("https://azbyka.ru/days/"+min(related[feast.pk])) if related[feast.pk] else "",
                                          note="Calendar URL is a day reference, not verified text provenance"))
                if approved:
                    modified=raw
                    for start,end,original,replacement in reversed(approved):
                        modified=modified[:start]+replacement+modified[end:]
                    if modified!=raw:
                        patches[field]=modified
                        fingerprints[(feast.pk,field)]=make_digest(raw)
            if patches: changes[feast.pk]=patches
        out=opts["output"]
        out.mkdir(parents=True,exist_ok=True)
        csv_path=out/"changes_review.csv"
        columns=["feast_id","feast_title","field","found","replacement","decision",
                 "context","source","source_url","calendar_url","note"]
        with csv_path.open("w",newline="",encoding="utf-8-sig") as f:
            writer=csv.DictWriter(f,fieldnames=columns,delimiter=";")
            writer.writeheader();writer.writerows(decisions)
        stats={"unique_cards_changed":len(changes),
               "auto_approved_occurrences":sum(x["decision"]=="AUTO_APPROVED" for x in decisions),
               "needs_review":sum(x["decision"]!="AUTO_APPROVED" for x in decisions),
               "output":str(csv_path),"scope":"unique CalendarFeast cards; not per-year copies",
               "text_provenance":"Original historical sources unknown; SQLite text and example calendar URLs provided",
               "supabase_changed":False}
        (out/"summary.json").write_text(json.dumps(stats,ensure_ascii=False,indent=2),encoding="utf8")
        self.stdout.write(f"AUTO APPROVED: {stats['auto_approved_occurrences']} occurrences in {len(changes)} unique cards")
        self.stdout.write(f"NEEDS REVIEW: {stats['needs_review']} occurrences")
        self.stdout.write("REPORT: "+str(csv_path.resolve()))
        if not opts["apply"]:
            self.stdout.write("PREVIEW ONLY: no changes made. Use --apply for reviewed safe phrases.")
            return
        if not changes:
            self.stdout.write("NO CHANGES")
            return
        db=Path(settings.DATABASES["default"]["NAME"])
        backup,digest=create_sqlite_backup(db,Path(settings.BASE_DIR)/"backups"/"sqlite")
        self.stdout.write(f"BACKUP: {backup} SHA256: {digest}")
        with transaction.atomic():
            for pk,patch in changes.items():
                current=CalendarFeast.objects.select_for_update().get(pk=pk)
                for field in patch:
                    if make_digest(getattr(current,field) or "")!=fingerprints[(pk,field)]:
                        raise CommandError("Source changed during operation; rolled back")
                for field,value in patch.items():
                    setattr(current,field,value)
                current.save(update_fields=[*patch,"updated_at"])
                current.refresh_from_db()
                if any(getattr(current,k)!=v for k,v in patch.items()):
                    raise CommandError("Post-write mismatch; rolled back")
        self.stdout.write(f"APPLIED AND VERIFIED: {len(changes)} unique cards changed. Supabase untouched.")
