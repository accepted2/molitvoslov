"""2025 fasting calendar from my-calend.ru/fasting/2025 published rules.

Distinct fields: season/name and dietary strictness. Dry-run produces a
365-day CSV and a diff; --apply performs local SQLite-only update with backup.
Source: https://my-calend.ru/fasting/2025
This is rule transcription from the page's prose; the site's colored
calendar cells are not scraped/independently cross-checked by this command.
"""
import csv
import json
from collections import Counter
from datetime import date,timedelta
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand,CommandError
from django.db import connections,transaction
from api.calendar_models import CalendarDay
from api.sqlite_backup import create_sqlite_backup

YEAR=2025
SOURCE="https://my-calend.ru/fasting/2025"
ROOT=Path("reports/mycal_fasts_2025")
# Distinct *food regimes*; "no-fast" is never a named fasting season.
REGIMES={
 "no-fast":("Нет поста","Нет пищевых ограничений"),
 "cheese":("Пища без мяса","Мясо запрещено; разрешены яйца, молочные продукты и рыба"),
 "no-food":("Полное воздержание от пищи","По календарному правилу"),
 "dry":("Сухоядение","Растительная пища без термической обработки"),
 "no-oil":("Горячая пища без масла","Горячая растительная пища без масла"),
 "oil":("Горячая пища с маслом","Горячая растительная пища с маслом"),
 "fish":("Разрешена рыба","Допускается рыба"),
 "caviar":("Разрешена рыбная икра","В Лазареву субботу допускается икра"),
}
MEATLESS=(date(2025,2,24),date(2025,3,2))
FREE_WEEKS=((date(2025,1,7),date(2025,1,17)),
            (date(2025,2,10),date(2025,2,15)),
            (date(2025,4,20),date(2025,4,26)),
            (date(2025,6,9),date(2025,6,15)))
MAJOR=((date(2025,1,1),date(2025,1,6),"Рождественский пост"),
       (date(2025,3,3),date(2025,4,19),"Великий пост"),
       (date(2025,6,16),date(2025,7,11),"Петров пост"),
       (date(2025,8,14),date(2025,8,27),"Успенский пост"),
       (date(2025,11,28),date(2025,12,31),"Рождественский пост"))
FISH_FEASTS={(2,15),(4,7),(5,21),(7,7),(7,12),(8,19),(8,28),
             (9,21),(10,9),(10,14),(12,4),(12,19)}
# These fish exemptions only apply when the date is otherwise fasting.
# Some exceptions are restricted by the source: 12/4 and 12/19 in
# Nativity Fast apply to Mon/Wed/Fri; ordinary other weekdays can allow fish.
ONE_DAY={(1,18):"Крещенский сочельник",
         (9,11):"Усекновение главы Иоанна Предтечи",
         (9,27):"Воздвижение Креста Господня"}

def between(d,left,right):
    return left<=d<=right

def calc(d):
    if d.year!=YEAR: raise ValueError("Only 2025")
    wd=d.weekday()   # 0 Monday; 2 Wed; 4 Fri
    season=next((label for start,end,label in MAJOR if between(d,start,end)),"")
    note=""
    code="no-fast"
    if season=="Великий пост":
        if d==date(2025,3,3):
            code="no-food"
        elif between(d,date(2025,3,4),date(2025,3,7)):
            code="dry"
        elif between(d,date(2025,4,14),date(2025,4,19)):
            code="dry"
            if d==date(2025,4,18): note="До выноса плащаницы принято воздержание от пищи"
        else:
            code=("dry" if wd in (0,2,4) else
                  "no-oil" if wd in (1,3) else "oil")
        if d==date(2025,4,7): code="fish"
        if d==date(2025,4,12): code="caviar"
        if d==date(2025,4,13): code="fish"
    elif season=="Петров пост":
        code="no-oil" if wd==0 else "dry" if wd in (2,4) else "fish"
        if (d.month,d.day)==(7,7):code="fish"
    elif season=="Успенский пост":
        code="dry" if wd in (0,2,4) else "no-oil" if wd in (1,3) else "oil"
        if (d.month,d.day)==(8,19):code="fish"
    elif season=="Рождественский пост":
        if d.month==1:
            # Jan 2-6 is the strict final phase from last December.
            code="dry" if wd in (0,2,4) else "no-oil" if wd in (1,3) else "oil"
            if d==date(2025,1,6):note="Сочельник: до первой звезды принято воздержание от пищи"
        elif d<=date(2025,12,19):
            code="no-oil" if wd==0 else "dry" if wd in (2,4) else "fish"
        else:
            code="no-oil" if wd==0 else "dry" if wd in (2,4) else "oil" if wd in (1,3) else "fish"
        if (d.month,d.day) in {(12,4),(12,19)}:
            code="fish"
    else:
        if between(d,*MEATLESS):
            season="Сырная седмица"
            code="cheese"
        elif any(between(d,a,b) for a,b in FREE_WEEKS):
            code="no-fast"
        elif (d.month,d.day) in ONE_DAY:
            season=ONE_DAY[(d.month,d.day)]
            code="dry" if wd in (2,4) and d.month!=1 else "oil"
        elif wd in (2,4):
            # Seasonal lay / monastic rules described on source page.
            code="fish" if (between(d,date(2025,1,7),date(2025,3,2)) or
                              between(d,date(2025,4,20),date(2025,6,15))) else "dry"
            if between(d,date(2025,2,17),date(2025,2,23)):
                code="no-oil"   # week immediately after Publican & Pharisee
            if (d.month,d.day) in FISH_FEASTS:
                code="fish"
        elif (d.month,d.day) in ONE_DAY:
            season=ONE_DAY[(d.month,d.day)]
            code="oil"
    if code not in REGIMES:raise ValueError("Unsupported diet code")
    title,description=REGIMES[code]
    return {"date":d.isoformat(),"code":code,"diet":title,"name":season or "Нет поста",
            "description":description,"note":note,"source_url":SOURCE}

class Command(BaseCommand):
    help="Prepare or apply 2025 fasting days from published My-Calend rules, SQLite only"
    def add_arguments(self,p):
        m=p.add_mutually_exclusive_group(required=True)
        m.add_argument("--dry-run",action="store_true")
        m.add_argument("--apply",action="store_true")
        p.add_argument("--output",type=Path,default=ROOT)
    def handle(self,*args,**opts):
        if connections["default"].vendor!="sqlite":
            raise CommandError("SQLite only; Supabase never modified")
        all_days=list(CalendarDay.objects.filter(date_gregorian__year=YEAR).order_by("date_gregorian"))
        if len(all_days)!=365 or len({d.date_gregorian for d in all_days})!=365:
            raise CommandError("Expected 365 unique local CalendarDay records for 2025")
        proposed={x["date"]:x for x in
            (calc(date(2025,1,1)+timedelta(days=i)) for i in range(365))}
        changed=[]
        for obj in all_days:
            r=proposed[obj.date_gregorian.isoformat()]
            before={"code":obj.fast_type_code or "","name":obj.fast_name or "",
                    "title":obj.fast_type_title or "","description":obj.fast_description or ""}
            after={"code":r["code"],"name":r["name"],
                   "title":r["diet"],"description":r["description"]}
            if before!=after:
                changed.append(dict(date=r["date"],old=before,new=after))
        out=opts["output"];out.mkdir(parents=True,exist_ok=True)
        fieldnames=["date","code","diet","name","description","note","source_url"]
        with (out/"daily.csv").open("w",encoding="utf-8-sig",newline="") as h:
            w=csv.DictWriter(h,fieldnames=fieldnames,delimiter=";")
            w.writeheader();w.writerows(proposed.values())
        (out/"changes.json").write_text(json.dumps(changed,ensure_ascii=False,indent=2),encoding="utf8")
        summary={"year":2025,"days":365,"changed_days":len(changed),
                 "food_regimes":dict(Counter(x["code"] for x in proposed.values())),
                 "named_periods":dict(Counter(x["name"] for x in proposed.values())),
                 "source":SOURCE,
                 "source_method":"Rule transcription from webpage prose, not visual-cell extraction",
                 "caution":"Specific parish typikon or local dispensations can differ"}
        (out/"summary.json").write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding="utf8")
        self.stdout.write(f"PREPARED 2025: 365 dates; {len(changed)} day fields differ")
        self.stdout.write("SUMMARY: "+str((out/"summary.json").resolve()))
        self.stdout.write("CSV: "+str((out/"daily.csv").resolve()))
        if opts["dry_run"]:
            self.stdout.write("DRY RUN: no database changes")
            return
        from api.sqlite_backup import create_sqlite_backup
        backup,digest=create_sqlite_backup(Path(settings.DATABASES["default"]["NAME"]),
                        Path(settings.BASE_DIR)/"backups"/"sqlite")
        self.stdout.write(f"BACKUP: {backup} SHA256: {digest}")
        with transaction.atomic():
            for obj in all_days:
                r=proposed[obj.date_gregorian.isoformat()]
                obj.fast_type_code=r["code"]
                obj.fast_type_title=r["diet"]
                obj.fast_name=r["name"]
                obj.fast_description=r["description"]
                payload=dict(obj.source_payload) if isinstance(obj.source_payload,dict) else {}
                payload["mycal_fasting_2025"]={
                    "source_url":SOURCE,"diet_code":r["code"],
                    "diet_title":r["diet"],"period_name":r["name"],"note":r["note"]}
                obj.source_payload=payload
                obj.save(update_fields=["fast_type_code","fast_type_title","fast_name",
                                        "fast_description","source_payload","updated_at"])
            verify=list(CalendarDay.objects.filter(date_gregorian__year=YEAR)
                        .values("date_gregorian","fast_type_code","fast_name","fast_type_title"))
            if len(verify)!=365 or any(
                r["fast_type_code"]!=proposed[r["date_gregorian"].isoformat()]["code"] or
                r["fast_name"]!=proposed[r["date_gregorian"].isoformat()]["name"] or
                r["fast_type_title"]!=proposed[r["date_gregorian"].isoformat()]["diet"]
                for r in verify):
                raise CommandError("Post-write verification failed; transaction rolled back")
        self.stdout.write("APPLIED AND VERIFIED: 365 fasting day records for 2025; Supabase untouched.")
