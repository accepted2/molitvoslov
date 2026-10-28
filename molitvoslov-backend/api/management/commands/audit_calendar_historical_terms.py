"""Read-only inventory and suggested replacements of nonhistorical regional terms.

This command deliberately never modifies liturgical or historical text. It
produces an editable CSV with full context and a separate JSON count report.
"""
import csv
import json
import re
from collections import Counter
from pathlib import Path

from django.core.management.base import BaseCommand
from api.calendar_models import CalendarFeast,CalendarDay

TERM = re.compile(
    r"(?<![А-Яа-яЁёІіЇїЄєҐґ])(?:"
    r"Росс(?:ия|ии|ию|ией|иею|ийск[а-яё]*|и[яйюе])"
    r"|русск[а-яё]*|Рус[ьи]|Руси|Русь"
    r"|российск[а-яё]*|росси[яиюе]"
    r")(?![А-Яа-яЁёІіЇїЄєҐґ])", re.I,
)
FIELDS=("troparion_title","troparion_content",
        "kontakion_title","kontakion_content",
        "life_title","life_content","description")
CONTEXT=100


def classify(text,start,end):
    near=text[max(0,start-85):min(len(text),end+85)].lower()
    protected=("крещени", "православн", "церкв", "патриарх", "импер", "княз",
               "царств", "войн", "государств", "истори", "московск", "киевск",
               "владимирск", "российской федерац", "древн", "летопи")
    if any(word in near for word in protected):
        return "HISTORICAL_REVIEW"
    if any(word in near for word in ("земл", "народ", "страна", "отечество", "держав")):
        return "CONTEXTUAL_REVIEW"
    return "MANUAL_REVIEW"


class Command(BaseCommand):
    help="List Russia/Rus/Russian historical and generalized terms in calendar feast texts (read only)"

    def add_arguments(self,p):
        p.add_argument("--output",type=Path,default=Path("reports/calendar_historical_terms"))
    def handle(self,*args,**opts):
        out=opts["output"];out.mkdir(parents=True,exist_ok=True)
        years=[2025,2026,2027]
        dates=CalendarDay.objects.filter(date_gregorian__year__in=years)
        ids=set(dates.values_list("feasts__pk",flat=True))
        ids.update(x for x in dates.values_list("main_feast_id",flat=True) if x)
        ids.discard(None)
        counts=Counter()
        rows=[]
        for feast in CalendarFeast.objects.filter(pk__in=ids).order_by("pk").iterator():
            for field in FIELDS:
                value=getattr(feast,field) or ""
                for m in TERM.finditer(value):
                    tag=classify(value,m.start(),m.end())
                    rows.append({"feast_id":feast.pk,"feast_title":feast.title,
                        "field":field,"found":m.group(),"classification":tag,
                        "context":value[max(0,m.start()-CONTEXT):min(len(value),m.end()+CONTEXT)].replace("\n"," "),
                        "replacement":"","approved":""})
                    counts[field]+=1
                    counts[tag]+=1
        dest=out/"review.csv"
        with dest.open("w",encoding="utf-8-sig",newline="") as f:
            writer=csv.DictWriter(f,fieldnames=["feast_id","feast_title","field","found",
                "classification","context","replacement","approved"],delimiter=";")
            writer.writeheader();writer.writerows(rows)
        info={"scope":"CalendarFeast linked to 2025-2027 calendar days",
              "matched_feasts":len({r["feast_id"] for r in rows}),
              "matches":len(rows),"counts":dict(counts),
              "note":"Read-only review. No replacements are auto-approved; preserve historical text."}
        (out/"summary.json").write_text(json.dumps(info,ensure_ascii=False,indent=2),encoding="utf8")
        self.stdout.write(f"MATCHES: {len(rows)} across {info['matched_feasts']} feasts")
        self.stdout.write("CSV: "+str(dest.resolve()))
        self.stdout.write("Read-only; local SQLite and Supabase unchanged.")
