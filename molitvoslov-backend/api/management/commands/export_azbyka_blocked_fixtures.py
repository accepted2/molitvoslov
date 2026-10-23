"""Capture the exact HTML reading sections of blocked reconciliation dates.

Read-only: captures source HTML, new parsed labels and existing SQLite readings.
Does not alter parser or database. Use fixtures for offline regression tests.
"""
import json
from pathlib import Path
import requests
from bs4 import BeautifulSoup
from django.core.management.base import BaseCommand, CommandError
from api.azbyka_calendar_readings import extract_readings_text, parse_readings_text
from api.calendar_models import CalendarReading

class Command(BaseCommand):
    help="Export self-contained diagnostics for blocked Azbyka days, with source HTML"

    def add_arguments(self,p):
        p.add_argument("--plan",type=Path,default=Path("reports/azbyka_problem_reconcile_plan.json"))
        p.add_argument("--output",type=Path,default=Path("reports/azbyka_blocked_fixtures.json"))

    def handle(self,*args,**opts):
        plan=json.loads(opts["plan"].read_text(encoding="utf-8"))
        days=sorted({r["date"] for r in plan.get("errors",[])})
        if not days: raise CommandError("No blocked days found")
        result=[]
        with requests.Session() as session:
            for day in days:
                row={"date":day}
                try:
                    res=session.get("https://azbyka.ru/days/"+day,timeout=25)
                    res.raise_for_status()
                    soup=BeautifulSoup(res.text,"lxml")
                    groups=soup.select(".readings-text .readings-groups")
                    if groups:
                        sections=[str(g) for g in groups]
                        row["layout"]="groups"
                    else:
                        h=next((h for h in soup.select("h1,h2,h3,h4,h5,h6")
                            if "чтения" in h.get_text(" ",strip=True).lower() and
                               "священного писания" in h.get_text(" ",strip=True).lower()),None)
                        if h is None: raise ValueError("Reading heading missing")
                        sections=[str(h)]
                        level=int(h.name[1])
                        for t in h.find_all_next():
                            if t.name in {"h1","h2","h3","h4","h5","h6"} and int(t.name[1])<=level:break
                            if t.name in {"p","li"} and not t.find_parent(("p","li")):
                                sections.append(str(t))
                        row["layout"]="heading"
                    row["html_sections"]=sections
                    parsed=parse_readings_text(extract_readings_text(res.text))
                    row["parsed"]=[{"kind":p.kind,"label":p.label,"title":p.title,"order":p.order} for p in parsed]
                    row["existing"]=list(CalendarReading.objects.filter(day__date_gregorian=day).values("kind","label","title","order"))
                except Exception as e:
                    row["error"]=str(e)
                result.append(row)
                self.stdout.write(f"{day}: {row.get('layout','ERROR')} {len(row.get('parsed',[]))} parsed")
        opts["output"].parent.mkdir(parents=True,exist_ok=True)
        opts["output"].write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
        self.stdout.write("FILE: "+str(opts["output"].resolve()))
        self.stdout.write("Read-only. Contains source HTML for offline regression diagnosis.")
