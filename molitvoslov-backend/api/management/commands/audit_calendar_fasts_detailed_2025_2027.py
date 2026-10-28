"""Read-only audit of every day's fasting details in 2025-2027.

Clearly separate liturgical fasting season from permission/food restriction.
Do NOT treat no-fast/cheese/fish/oil as proof of a fast. Report uncertain
rather than rewriting manually curated data.
"""
import csv
import json
from collections import Counter
from datetime import date,timedelta
from pathlib import Path

from django.core.management.base import BaseCommand
from api.calendar_models import CalendarDay
from api.management.commands.generate_calendar_year import pascha,fasting_info

YEARS=(2025,2026,2027)
NO_FAST={"no-fast","no_fast","none","fast-free","fast_free","no fast"}
FOOD_CODES={"fish","oil","dry","water","wine","strict","xerophagy","cheese","meatless"}
INVALID_SEASON_WORDS=("апостольск","петров","великий пост","успенск","рождественск")
def expected_season(d):
    easter=pascha(d.year)
    if easter-timedelta(days=48)<=d<easter:
        return "Великий пост"
    if easter+timedelta(days=57)<=d<=date(d.year,7,11):
        return "Петров пост"
    if date(d.year,8,14)<=d<=date(d.year,8,27):
        return "Успенский пост"
    if d>=date(d.year,11,28) or d<=date(d.year,1,6):
        return "Рождественский пост"
    return ""

class Command(BaseCommand):
    help="Check fasting markers, seasons, obvious mislabels and Azbyka marker presence; read-only"
    def add_arguments(self,p):
        p.add_argument("--output",type=Path,default=Path("reports/calendar_fasts_detailed_2025_2027"))
    def handle(self,*args,**opts):
        days={d.date_gregorian:d for d in CalendarDay.objects.filter(date_gregorian__year__in=YEARS).select_related("fast_type")}
        counts=Counter();rows=[];issues=[]
        for year in YEARS:
            d=date(year,1,1)
            while d.year==year:
                item=days.get(d)
                if item is None:
                    issues.append({"date":d.isoformat(),"severity":"ERROR","issue":"MISSING_DAY","code":"","name":"","expected":""})
                    d+=timedelta(days=1);continue
                code=(item.fast_type_code or (item.fast_type.code if item.fast_type else "") or "").strip()
                name=(item.fast_name or (item.fast_type.name if item.fast_type else "") or "").strip()
                title=(item.fast_type_title or (item.fast_type.type_title if item.fast_type else "") or "").strip()
                description=(item.fast_description or "").strip()
                marker=(item.source_payload or {}).get("azbyka_calendar_markers") if isinstance(item.source_payload,dict) else None
                season=expected_season(d)
                expected_basic,expected_basic_name=fasting_info(d,pascha(year))
                count_status="no-fast" if code.lower() in NO_FAST else "food-allowance" if code.lower() in FOOD_CODES else "other"
                row={"date":d.isoformat(),"year":year,"weekday":d.strftime("%A"),
                    "code":code,"name":name,"title":title,"description":description,
                    "expected_major_fast":season,"expected_basic":expected_basic_name if expected_basic else "",
                    "source_markers_present":isinstance(marker,dict),
                    "source_markers_json":json.dumps(marker,ensure_ascii=False,sort_keys=True) if isinstance(marker,dict) else "",
                    "category":count_status}
                rows.append(row)
                counts["days_"+str(year)]+=1
                counts["code_"+(code.lower() or "(empty)")]+=1
                if season: counts["expected_major_fast_days"]+=1
                if isinstance(marker,dict): counts["azbyka_markers_present"]+=1
                else:
                    counts["azbyka_markers_missing"]+=1
                    issues.append({"date":d.isoformat(),"severity":"INFO","issue":"NO_SOURCE_MARKERS",
                                   "code":code,"name":name,"expected":season})
                lower=(name+" "+title+" "+description).lower()
                if not season and ("апостольск" in lower or "петров пост" in lower or "петрова пост" in lower):
                    issues.append({"date":d.isoformat(),"severity":"LIKELY_ERROR",
                                   "issue":"APOSTLES_FAST_NAME_OUTSIDE_SEASON",
                                   "code":code,"name":name,"expected":season})
                if season and ("апостольск" in lower or "петров пост" in lower) and season!="Петров пост":
                    issues.append({"date":d.isoformat(),"severity":"LIKELY_ERROR",
                                   "issue":"WRONG_NAMED_FAST_FOR_SEASON",
                                   "code":code,"name":name,"expected":season})
                if code.lower() in NO_FAST and season:
                    issues.append({"date":d.isoformat(),"severity":"REVIEW",
                                   "issue":"FAST_FREE_MARKER_DURING_MAJOR_FAST",
                                   "code":code,"name":name,"expected":season})
                if not code and not name and expected_basic:
                    issues.append({"date":d.isoformat(),"severity":"REVIEW",
                                   "issue":"EMPTY_FAST_MARKER_ON_EXPECTED_DAY",
                                   "code":code,"name":name,"expected":expected_basic_name})
                d+=timedelta(days=1)
        out=opts["output"];out.mkdir(parents=True,exist_ok=True)
        for filename,data,columns in (
            ("daily.csv",rows,["date","year","weekday","code","name","title","description","expected_major_fast","expected_basic","source_markers_present","source_markers_json","category"]),
            ("review.csv",issues,["date","severity","issue","code","name","expected"])):
            with (out/filename).open("w",encoding="utf-8-sig",newline="") as h:
                w=csv.DictWriter(h,fieldnames=columns,delimiter=";");w.writeheader();w.writerows(data)
        summary={"days_expected":1095,"days_observed":len(rows),"issues_by_type":dict(Counter(r["issue"] for r in issues)),
                 "issues_by_severity":dict(Counter(r["severity"] for r in issues)),
                 "counts":dict(counts),
                 "notes":"This is an internal consistency audit, NOT a full typikon proof. 'INFO' source markers missing isn't a proven error; 'REVIEW' needs source verification; no-fast/cheese are not generic fast markers."}
        (out/"summary.json").write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding="utf8")
        self.stdout.write(f"FASTS AUDIT: {len(rows)}/1095 days; issues={len(issues)}")
        self.stdout.write("OUTPUT: "+str(out.resolve()))
        self.stdout.write("Read-only. SQLite and Supabase unchanged.")
