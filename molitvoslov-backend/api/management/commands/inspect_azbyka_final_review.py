"""Read-only detailed inspection of REVIEW days in the completed final audit."""
import json
from pathlib import Path
import requests
from bs4 import BeautifulSoup
from django.core.management.base import BaseCommand, CommandError
from api.azbyka_calendar_readings import extract_readings_text, parse_readings_text
from api.calendar_models import CalendarReading
from api.management.commands.reconcile_azbyka_problem_days import section_source,keys

class Command(BaseCommand):
    help="Capture original service HTML, parsed readings and current SQLite on REVIEW days only"

    def add_arguments(self,p):
        p.add_argument("--daily",type=Path,default=Path("reports/azbyka_final_2025_2027/daily.jsonl"))
        p.add_argument("--output",type=Path,default=Path("reports/azbyka_final_2025_2027/review_details.json"))

    def handle(self,*args,**opts):
        if not opts["daily"].is_file():
            raise CommandError("Missing daily audit JSONL")
        entries=[json.loads(x) for x in opts["daily"].read_text(encoding="utf8").splitlines() if x.strip()]
        dates=sorted({r["date"] for r in entries if r.get("status")=="REVIEW"})
        if not dates:
            raise CommandError("No REVIEW dates")
        result=[]
        with requests.Session() as session:
            session.headers.update({"User-Agent":"MolitvoslovCalendarAudit/1.0 (review investigation)"})
            for day in dates:
                existing=list(CalendarReading.objects.filter(day__date_gregorian=day)
                              .order_by("order","pk").values("kind","label","title","order"))
                row={"date":day,"existing":existing}
                try:
                    response=session.get("https://azbyka.ru/days/"+day,timeout=25)
                    response.raise_for_status()
                    soup=BeautifulSoup(response.text,"lxml")
                    groups=soup.select(".readings-text .readings-groups")
                    if groups:
                        blocks=[str(g) for g in groups]
                    else:
                        heading=next((h for h in soup.select("h1,h2,h3,h4,h5,h6")
                            if "чтения" in h.get_text(" ",strip=True).lower() and
                            "священного писания" in h.get_text(" ",strip=True).lower()),None)
                        if heading is None:
                            raise ValueError("Reading heading missing")
                        level=int(heading.name[1])
                        blocks=[str(heading)]
                        for t in heading.find_all_next():
                            if t.name in {"h1","h2","h3","h4","h5","h6"} and int(t.name[1])<=level:
                                break
                            if t.name in {"p","li"} and not t.find_parent(("p","li")):
                                blocks.append(str(t))
                    source=section_source(soup)
                    parsed=parse_readings_text(extract_readings_text(response.text))
                    row["html_sections"]=blocks
                    row["source_references"]=list(keys(source).elements())
                    row["parsed"]=[dict(kind=r.kind,label=r.label,title=r.title,order=r.order)
                                   for r in parsed]
                    row["source_total"]=sum(keys(source).values())
                    self.stdout.write(f"{day}: SQLite={len(existing)} parsed={len(parsed)}")
                except (requests.RequestException,ValueError) as e:
                    row["error"]=str(e)
                    self.stderr.write(f"{day}: ERROR {e}")
                result.append(row)
        out=opts["output"]
        out.parent.mkdir(parents=True,exist_ok=True)
        out.write_text(json.dumps({"version":1,"review_dates":dates,"results":result},
                                   ensure_ascii=False,indent=2),encoding="utf8")
        self.stdout.write(f"REVIEW CAPTURED: {sum('parsed' in r for r in result)}/{len(dates)}")
        self.stdout.write("FILE: "+str(out.resolve()))
        self.stdout.write("Read-only. SQLite and Supabase unchanged.")
