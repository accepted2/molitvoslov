"""One-shot read-only capture for remaining problematic calendar days.

Consumes exclusions of the last successful reconciliation plan, retries source
errors, records HTML and source/parsed/SQLite comparisons. No DB writes.
"""
import json
import time
from collections import Counter
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from django.core.management.base import BaseCommand, CommandError

from api.azbyka_calendar_readings import extract_readings_text, parse_readings_text, REFERENCE_RE
from api.calendar_models import CalendarReading
from api.management.commands.reconcile_azbyka_problem_days import section_source, keys, guard_day


def encode(rows):
    return [dict(kind=r.kind,label=r.label,title=r.title,order=r.order) for r in rows]


class Command(BaseCommand):
    help = "Capture and diagnose all remaining Azbyka dates once, without changing SQLite"

    def add_arguments(self, parser):
        parser.add_argument("--plan", type=Path, default=Path("reports/azbyka_problem_reconcile_plan.json"))
        parser.add_argument("--output", type=Path, default=Path("reports/azbyka_remaining_14_diagnostics.json"))

    def handle(self, *args, **opts):
        plan_path=opts["plan"]
        if not plan_path.is_file():
            raise CommandError("Missing reconciliation plan: "+str(plan_path))
        plan=json.loads(plan_path.read_text(encoding="utf8"))
        excluded={row["date"]:row["error"] for row in plan.get("excluded_blocked",[])}
        dates=sorted(set(excluded) | set(plan.get("excluded_source_errors",[])))
        if not dates:
            raise CommandError("No remaining dates listed in plan")
        existing_fixture={}
        fixture_path=Path("reports/azbyka_blocked_fixtures.json")
        if fixture_path.exists():
            try:
                existing_fixture={r["date"]:r for r in json.loads(fixture_path.read_text(encoding="utf8"))}
            except (ValueError, KeyError, TypeError) as e:
                self.stderr.write("Existing fixtures unusable: "+str(e))
        results=[]
        with requests.Session() as session:
            session.headers.update({"User-Agent":"MolitvoslovCalendarImporter/1.0 (personal church-calendar data import)"})
            for ds in dates:
                old=list(CalendarReading.objects.filter(day__date_gregorian=ds).order_by("order","pk").values("kind","label","title","order"))
                row={"date":ds,"reason":excluded.get(ds,"Previous source error"),"existing":old}
                source_error=""
                for attempt in range(3):
                    try:
                        response=session.get("https://azbyka.ru/days/"+ds,timeout=25)
                        response.raise_for_status()
                        soup=BeautifulSoup(response.text,"lxml")
                        groups=soup.select(".readings-text .readings-groups")
                        if groups:
                            sections=[str(g) for g in groups]
                            row["layout"]="groups"
                        else:
                            heading=next((h for h in soup.select("h1,h2,h3,h4,h5,h6")
                                if "чтения" in h.get_text(" ",strip=True).lower() and
                                "священного писания" in h.get_text(" ",strip=True).lower()),None)
                            if heading is None:
                                raise ValueError("Reading heading missing")
                            level=int(heading.name[1])
                            sections=[str(heading)]
                            for t in heading.find_all_next():
                                if t.name in {"h1","h2","h3","h4","h5","h6"} and int(t.name[1])<=level:
                                    break
                                if t.name in {"p","li"} and not t.find_parent(("p","li")):
                                    sections.append(str(t))
                            row["layout"]="heading"
                        row["html_sections"]=sections
                        source=section_source(soup)
                        extracted=extract_readings_text(response.text)
                        parsed=encode(parse_readings_text(extracted))
                        from_html=keys(source)
                        from_extraction=keys(extracted)
                        from_parsed=Counter()
                        for p in parsed:
                            from_parsed.update(keys(p["title"]))
                        row["parsed"]=parsed
                        row["references_html"]=sum(from_html.values())
                        row["references_extracted"]=sum(from_extraction.values())
                        row["references_parsed"]=sum(from_parsed.values())
                        row["dom_extraction_equal"]=from_html==from_extraction
                        row["dom_parsed_equal"]=from_html==from_parsed
                        row["lost_existing"]=list((Counter((v["kind"],v["title"]) for v in old)-Counter((v["kind"],v["title"]) for v in parsed)).elements())
                        row["guard"]=guard_day(ds,old,parsed)
                        source_error=""
                        break
                    except Exception as e:
                        source_error=f"{type(e).__name__}: {e}"
                        if attempt < 2:
                            time.sleep(attempt+1)
                if source_error:
                    row["error"]=source_error
                    prior=existing_fixture.get(ds)
                    if prior and prior.get("html_sections"):
                        row["saved_fixture"]=prior
                results.append(row)
                self.stdout.write(f'{ds}: source={"ERROR" if source_error else "OK"} old={len(old)} parsed={len(row.get("parsed",[]))} guard={row.get("guard","")}')
        output=opts["output"]
        output.parent.mkdir(parents=True,exist_ok=True)
        output.write_text(json.dumps({"version":1,"dates":dates,"results":results},
                                      ensure_ascii=False,indent=2),encoding="utf8")
        self.stdout.write("FILE: "+str(output.resolve()))
        self.stdout.write(f"CAPTURED: {sum('parsed' in r for r in results)}/{len(results)}; SQLite and Supabase unchanged.")
