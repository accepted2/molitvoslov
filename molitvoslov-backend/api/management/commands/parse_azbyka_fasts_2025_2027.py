"""Download fasting headers from Azbyka 2025-2027 without modifying SQLite.

Extract only the daily header near its H1 title. Do not infer fast from
unrelated feast descriptions and do not conflate fasting season with food
dispensation. Checkpoint/resume and export all results for comparison.
"""
import csv
import json
import re
import time
from collections import Counter
from datetime import date,timedelta
from pathlib import Path

import requests
from bs4 import BeautifulSoup, NavigableString, Tag
from django.core.management.base import BaseCommand,CommandError
from api.calendar_models import CalendarDay

START=date(2025,1,1)
END=date(2027,12,31)
DEFAULT=Path("reports/azbyka_fasts_2025_2027")

def norm(s):
    return re.sub(r"\s+"," ",s.replace("\xa0"," ")).strip()

def extract_fast_header(html):
    soup=BeautifulSoup(html,"html.parser")
    h=soup.find("h1")
    if h is None:
        return dict(status="UNPARSED",reason="No h1")
    # Search ONLY nearby daily header text preceding feast names and readings.
    parts=[]
    for node in h.next_elements:
        if node is h: continue
        if isinstance(node,Tag):
            if node.name in ("h2","h3") or (node.name=="h1" and node is not h):
                break
            # Feast lists begin below the daily header; never read prayer or feast text.
            if node.name in ("ul","ol"):
                break
        if isinstance(node,NavigableString):
            s=norm(str(node))
            if s: parts.append(s)
            if len(" ".join(parts))>600: break
    header=norm(" ".join(parts))
    # Scan the first ~300 characters, including weekday/voice details.
    snippet=header[:330]
    patterns=(
        ("NO_FAST",r"Поста\s+нет\b"),
        ("FAST",r"\bПост\s*(?:[.!,;:]|$)"),
        ("FAST",r"\bПостный\s+день\b"),
        ("DRY",r"\bСухоядение\b"),
        ("NO_OIL",r"\bБез\s+масла\b"),
        ("OIL",r"\b(?:Горячая\s+пища\s+с\s+маслом|Пища\s+с\s+маслом)\b"),
        ("FISH",r"\b(?:Разрешается\s+рыба|Рыба\s+разрешается)\b"),
        ("CHEESE",r"\bСырная\s+седмица\b"),
    )
    found=[]
    for category,pattern in patterns:
        m=re.search(pattern,snippet,re.I)
        if m: found.append((m.start(),category,m.group()))
    if not found: return dict(status="UNPARSED",reason="No fasting statement in day header",header=snippet)
    found.sort()
    first=found[0]
    # "Сырная седмица" can be the week name rather than the precise fast label.
    if first[1]=="CHEESE":
        other=[x for x in found if x[1]!="CHEESE"]
        if other: first=other[0]
    if first[1]=="FAST" and "Поста нет" in snippet:
        return dict(status="UNPARSED",reason="Conflicting fast matches",header=snippet)
    return dict(status="OK",category=first[1],raw=first[2],header=snippet)

def date_range(start,end):
    d=start
    while d<=end:
        yield d
        d+=timedelta(days=1)

class Command(BaseCommand):
    help="Read-only Azbyka fasting-header parser for 2025-2027 with resume and CSV comparison"
    def add_arguments(self,p):
        p.add_argument("--start",default=START.isoformat())
        p.add_argument("--end",default=END.isoformat())
        p.add_argument("--output",type=Path,default=DEFAULT)
        p.add_argument("--resume",action="store_true")
        p.add_argument("--timeout",type=int,default=25)
        p.add_argument("--delay",type=float,default=0.2)

    def handle(self,*args,**opts):
        try:
            start=date.fromisoformat(opts["start"]);end=date.fromisoformat(opts["end"])
        except ValueError as e: raise CommandError("Invalid ISO date") from e
        if start>end or start<START or end>END:
            raise CommandError("Allowed range: 2025-01-01 through 2027-12-31")
        out=opts["output"];out.mkdir(parents=True,exist_ok=True)
        checkpoint=out/"source.jsonl"
        expected=[d.isoformat() for d in date_range(start,end)]
        done={}
        if opts["resume"] and checkpoint.exists():
            for line in checkpoint.read_text(encoding="utf8").splitlines():
                if line.strip():
                    r=json.loads(line)
                    if r.get("date") in expected and r.get("status")=="OK":
                        done[r["date"]]=r
        if not opts["resume"]:
            checkpoint.write_text("",encoding="utf8")
        remaining=[d for d in expected if d not in done]
        self.stdout.write(f"AZBYKA FAST HEADERS: dates={len(expected)} pending={len(remaining)}")
        with requests.Session() as session,checkpoint.open("a",encoding="utf8") as h:
            session.headers.update({"User-Agent":"Molitvoslov fasting audit/1.0"})
            for n,ds in enumerate(remaining,1):
                result={"date":ds,"url":"https://azbyka.ru/days/"+ds}
                for retry in range(3):
                    try:
                        response=session.get(result["url"],timeout=opts["timeout"])
                        response.raise_for_status()
                        result.update(extract_fast_header(response.text))
                        break
                    except requests.RequestException as exc:
                        result.update(status="FETCH_ERROR",reason=str(exc))
                        if retry<2:time.sleep(1.5*(retry+1))
                done[ds]=result
                h.write(json.dumps(result,ensure_ascii=False)+"\n")
                h.flush()
                if n%50==0 or n==len(remaining):
                    self.stdout.write(f"PROGRESS {n}/{len(remaining)} last={ds} {result['status']}")
                if opts["delay"]>0:time.sleep(opts["delay"])
        local={d.date_gregorian.isoformat():d for d in CalendarDay.objects
               .filter(date_gregorian__range=(start,end)).select_related("fast_type")}
        rows=[]
        for ds in expected:
            r=done.get(ds,{})
            d=local.get(ds)
            code=(d.fast_type_code or (d.fast_type.code if d.fast_type else "")) if d else ""
            name=(d.fast_name or (d.fast_type.name if d.fast_type else "")) if d else ""
            title=(d.fast_type_title or (d.fast_type.type_title if d.fast_type else "")) if d else ""
            # No inferred food code: Azbyka fasting header alone may not provide it.
            rows.append({"date":ds,"url":r.get("url",""),"source_status":r.get("status","MISSING"),
                         "source_category":r.get("category",""),"source_text":r.get("raw",""),
                         "header":r.get("header",""),"local_code":code,
                         "local_fast_name":name,"local_fast_title":title,
                         "attention":("SOURCE_UNCLEAR" if r.get("status")!="OK" else
                            "NO_FAST_WITH_NAMED_SEASON" if r.get("category")=="NO_FAST" and
                            any(x in (name+" "+title).lower() for x in ("апостольск","петров пост","великий пост","успенск","рождественск"))
                            else "")})
        fields=list(rows[0]) if rows else []
        with (out/"daily.csv").open("w",encoding="utf-8-sig",newline="") as h:
            w=csv.DictWriter(h,fieldnames=fields,delimiter=";");w.writeheader();w.writerows(rows)
        review=[row for row in rows if row["attention"]]
        with (out/"review.csv").open("w",encoding="utf-8-sig",newline="") as h:
            w=csv.DictWriter(h,fieldnames=fields,delimiter=";");w.writeheader();w.writerows(review)
        summary={"days":len(expected),"status_counts":dict(Counter(r["source_status"] for r in rows)),
                 "category_counts":dict(Counter(r["source_category"] for r in rows)),
                 "review_count":len(review),"review_by_type":dict(Counter(r["attention"] for r in review)),
                 "note":"Source is daily header only. Does not prove food restrictions or season. Read-only."}
        (out/"summary.json").write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding="utf8")
        self.stdout.write("COMPLETED: "+json.dumps(summary,ensure_ascii=False))
        self.stdout.write("OUTPUT: "+str(out.resolve()))
        self.stdout.write("SQLite and Supabase unchanged.")
