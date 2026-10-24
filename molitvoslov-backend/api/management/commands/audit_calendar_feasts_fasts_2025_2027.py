"""Read-only coverage estimate for unique feasts and fast markers, 2025–2027.

No missing prayer/life is automatically classified as erroneous: source text
may genuinely lack one. Distinguish observed coverage from correctness.
"""
import csv
import json
from collections import Counter,defaultdict
from datetime import date,timedelta
from pathlib import Path

from django.core.management.base import BaseCommand
from api.calendar_models import CalendarDay,CalendarFeast,CalendarReading
from api.management.commands.generate_calendar_year import fasting_info,pascha

YEARS=(2025,2026,2027)

def nonempty(s):
    return bool(s and str(s).strip())

def pct(n,d):
    return round(100*n/d,1) if d else None

class Command(BaseCommand):
    help="Read-only audit of unique feast cards, field fill rates and day fasting markers (2025-2027)"
    def add_arguments(self,p):
        p.add_argument("--output",type=Path,default=Path("reports/calendar_feasts_fasts_2025_2027"))
    def handle(self,*args,**opts):
        days=list(CalendarDay.objects.filter(date_gregorian__year__in=YEARS)
                  .prefetch_related("feasts").select_related("main_feast","fast_type").order_by("date_gregorian"))
        day_lookup={d.date_gregorian:d for d in days}
        all_ids=set()
        links_by_year=defaultdict(set)
        missing_main=[]
        empty_links=[]
        per_year={}
        for d in days:
            yy=d.date_gregorian.year
            fids={f.pk for f in d.feasts.all()}
            if d.main_feast_id:
                fids.add(d.main_feast_id)
            else:
                missing_main.append(d.date_gregorian.isoformat())
            if not fids:
                empty_links.append(d.date_gregorian.isoformat())
            all_ids.update(fids)
            links_by_year[yy].update(fids)
        cards=list(CalendarFeast.objects.filter(pk__in=all_ids).order_by("pk"))
        fields={"life":"life_content","troparion":"troparion_content",
                "kontakion":"kontakion_content","icon":"icon_url",
                "title_uk":"title_uk","life_uk":"life_content_uk",
                "troparion_uk":"troparion_content_uk","kontakion_uk":"kontakion_content_uk"}
        rows=[]
        filled=Counter()
        for f in cards:
            flags={k:nonempty(getattr(f,field)) for k,field in fields.items()}
            filled.update({k:int(v) for k,v in flags.items()})
            rows.append({"id":str(f.pk),"source_id":f.source_id or "",
                         "title":f.title,"short_title":f.short_title,
                         "date_type":f.date_type,"rank":f.celebration_rank,
                         "linked_2025":int(f.pk in links_by_year[2025]),
                         "linked_2026":int(f.pk in links_by_year[2026]),
                         "linked_2027":int(f.pk in links_by_year[2027]),
                         **{k:int(v) for k,v in flags.items()},
                         "missing_fields_for_review":",".join(k for k,v in flags.items() if not v)})
        # Fast rule checks are heuristic. Empty marker can correctly indicate no fast.
        fasting_rows=[]
        fast_counts=Counter()
        for yy in YEARS:
            d=date(yy,1,1)
            while d.year==yy:
                item=day_lookup.get(d)
                if item is None:
                    fasting_rows.append({"date":d.isoformat(),"issue":"MISSING_DAY",
                                         "expected_basic":"","stored_code":"","stored_name":""})
                    d+=timedelta(days=1);continue
                expected,expected_name=fasting_info(d,pascha(yy))
                stored_name=(item.fast_name or item.fast_type_title or
                             (item.fast_type.name if item.fast_type else "") or "")
                stored_code=item.fast_type_code or (item.fast_type.code if item.fast_type else "")
                actual_has_fast=bool(stored_code.strip() or stored_name.strip())
                fast_counts["expected_basic_fast" if expected else "expected_basic_not_fast"]+=1
                fast_counts["stored_marker_present" if actual_has_fast else "stored_marker_empty"]+=1
                issue=""
                if expected and not actual_has_fast:
                    issue="EXPECTED_FAST_NO_MARKER_REVIEW"
                elif not expected and actual_has_fast:
                    issue="MARKER_OUTSIDE_BASIC_RULE_REVIEW"
                if issue:
                    fast_counts[issue]+=1
                    fasting_rows.append({"date":d.isoformat(),"issue":issue,
                                        "expected_basic":expected_name,
                                        "stored_code":stored_code,"stored_name":stored_name})
                d+=timedelta(days=1)
        for yy in YEARS:
            ds=[d for d in days if d.date_gregorian.year==yy]
            linked=links_by_year[yy]
            matching=[f for f in cards if f.pk in linked]
            per_year[str(yy)]={"days":len(ds),"days_with_any_card":sum(bool(d.main_feast_id or d.feasts.all()) for d in ds),
                               "days_with_main_card":sum(bool(d.main_feast_id) for d in ds),
                               "unique_linked_cards":len(linked),
                               "unique_cards_with_life":sum(nonempty(f.life_content) for f in matching),
                               "unique_cards_with_troparion":sum(nonempty(f.troparion_content) for f in matching),
                               "unique_cards_with_kontakion":sum(nonempty(f.kontakion_content) for f in matching)}
        total=len(cards)
        summary={"period":"2025-01-01..2027-12-31",
                 "days_observed":len(days),
                 "missing_calendar_days":1095-len(days),
                 "unique_cards":total,
                 "unique_card_coverage":{k:{"filled":filled[k],"missing_or_not_provided":total-filled[k],
                                          "filled_pct":pct(filled[k],total)} for k in fields},
                 "days_without_any_card":len(empty_links),
                 "days_without_main_card":len(missing_main),
                 "per_year":per_year,
                 "fast_marker_diagnostics":dict(fast_counts),
                 "interpretation":"Missing life/troparion/kontakion is NOT automatically an error; fasting_info is only a basic approximation, not typikon or verified source."}
        out=opts["output"];out.mkdir(parents=True,exist_ok=True)
        with (out/"cards.csv").open("w",newline="",encoding="utf-8-sig") as h:
            writer=csv.DictWriter(h,fieldnames=list(rows[0]) if rows else [
                "id","source_id","title","short_title","date_type","rank",
                "linked_2025","linked_2026","linked_2027",*fields,"missing_fields_for_review"])
            writer.writeheader();writer.writerows(rows)
        with (out/"fasts_review.csv").open("w",newline="",encoding="utf-8-sig") as h:
            writer=csv.DictWriter(h,fieldnames=["date","issue","expected_basic","stored_code","stored_name"])
            writer.writeheader();writer.writerows(fasting_rows)
        (out/"summary.json").write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding="utf8")
        self.stdout.write(f"UNIQUE CARDS: {total}; days: {len(days)}; empty-linked days: {len(empty_links)}")
        for k in ("life","troparion","kontakion","icon"):
            self.stdout.write(f"{k}: {filled[k]}/{total} ({pct(filled[k],total)}%)")
        self.stdout.write(f"FAST REVIEW ROWS: {len(fasting_rows)} (heuristic, not confirmed errors)")
        self.stdout.write("OUTPUT: "+str(out.resolve()))
        self.stdout.write("Read-only: SQLite and Supabase unchanged.")
