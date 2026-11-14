"""Offline checks on exact user-captured Azbyka HTML for blocked dates. Read-only."""
import json
import re
from collections import Counter
from pathlib import Path
from bs4 import BeautifulSoup
from django.core.management.base import BaseCommand, CommandError
from api.azbyka_calendar_readings import extract_readings_text, parse_readings_text, REFERENCE_RE

class Command(BaseCommand):
    help="Check saved HTML fixtures without network or SQLite writes"

    def add_arguments(self,parser):
        parser.add_argument("--fixtures",type=Path,default=Path("reports/azbyka_blocked_fixtures.json"))
        parser.add_argument("--strict-old",action="store_true",
                            help="Also require every preexisting nonempty label to match exactly")

    def handle(self,*args,**opts):
        data=json.loads(opts["fixtures"].read_text(encoding="utf8"))
        errors=[]
        for item in data:
            ds=item["date"]
            sections=item.get("html_sections",[])
            if not sections:
                errors.append((ds,"missing HTML sections"))
                continue
            # HTML fixture contains only the reading section, never the whole site.
            html="<section class='readings-text'>"+"".join(sections)+"</section>"
            try:
                got=parse_readings_text(extract_readings_text(html))
                expected_count=sum(len(REFERENCE_RE.findall(
                    BeautifulSoup(raw,"lxml").get_text(" ",strip=True))) for raw in sections)
                if len(got)!=expected_count:
                    errors.append((ds,f"count {len(got)} vs HTML {expected_count}"))
                if item.get("layout")=="groups":
                    g=BeautifulSoup(html,"lxml")
                    expected=[]
                    for p in g.select(".readings-groups p"):
                        heading=p.find("i")
                        heading=(heading.get_text(" ",strip=True).rstrip(":").strip() if heading else "")
                        if heading.lower()=="рядовое":
                            heading="Ряд."
                        paragraph_refs=list(REFERENCE_RE.finditer(p.get_text(" ",strip=True)))
                        expected.extend([heading]*len(paragraph_refs))
                    labels=[r.label for r in got]
                    if len(labels)!=len(expected) or labels!=expected:
                        errors.append((ds,f"group labels {labels} vs source {expected}"))
                if opts["strict_old"]:
                    present=Counter((r.kind,r.title,r.label) for r in got)
                    for old in item.get("existing",[]):
                        if old["label"] and not present[(old["kind"],old["title"],old["label"])]:
                            errors.append((ds,f"old label not retained: {old['label']!r} {old['title']}"))
                self.stdout.write(f"CHECK {ds}: {len(got)} readings")
            except Exception as exc:
                errors.append((ds,str(exc)))
        for ds,msg in errors:
            self.stderr.write(f"FAIL {ds}: {msg}")
        self.stdout.write(f"FIXTURES {len(data)} ERRORS {len(errors)}")
        if errors:
            raise CommandError("Offline fixture checks failed; do not --apply")
        self.stdout.write("All offline fixture checks passed. Database untouched.")
