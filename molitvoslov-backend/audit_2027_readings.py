"""Read-only Django audit of 2027 calendar reading integrity."""
import csv
from collections import Counter
from datetime import date, timedelta
from pathlib import Path
from django.core.management.base import BaseCommand
from api.calendar_models import CalendarDay

class Command(BaseCommand):
    help = 'Read-only consistency report for calendar days and reading labels (no network)'

    def add_arguments(self, parser):
        parser.add_argument('--year', type=int, default=2027)
        parser.add_argument('--output', default='calendar_readings_audit_2027.csv')

    def handle(self,*args,**opts):
        year=opts['year']
        if not 1900 <= year <= 2099:
            raise ValueError('Expected year 1900..2099')
        days={d.date_gregorian:d for d in CalendarDay.objects.filter(date_gregorian__year=year).prefetch_related('readings','feasts')}
        start=date(year,1,1); end=date(year,12,31)
        out=[]; current=start
        while current<=end:
            d=days.get(current)
            if d is None:
                out.append([current,'MISSING_DAY','', '', ''])
            else:
                readings=list(d.readings.all()); reasons=[]
                if not readings: reasons.append('NO_READINGS')
                if d.main_feast_id and d.main_feast_id not in set(d.feasts.values_list('id',flat=True)):
                    reasons.append('MAIN_NOT_IN_FEASTS')
                seen=set()
                for r in readings:
                    key=(r.kind,r.label,r.title,r.order)
                    if key in seen:reasons.append('EXACT_DUPLICATE')
                    seen.add(key)
                    if not (r.title or '').strip(): reasons.append('EMPTY_READING_TITLE')
                gos=next((r.title for r in readings if r.kind=='gospel'),'')
                apo=next((r.title for r in readings if r.kind=='apostle'),'')
                # Legacy fields can intentionally be edited; report divergence for review.
                if gos and d.gospel_title and gos != d.gospel_title:reasons.append('GOSPEL_LEGACY_DIFF')
                if apo and d.apostolic_title and apo != d.apostolic_title:reasons.append('APOSTLE_LEGACY_DIFF')
                if reasons:out.append([current,'|'.join(dict.fromkeys(reasons)),len(readings),gos,apo])
            current+=timedelta(days=1)
        path=Path(opts['output'])
        with path.open('w',encoding='utf-8-sig',newline='') as f:
            w=csv.writer(f,delimiter=';');w.writerow(['date','issue','readings_count','first_gospel','first_apostle']);w.writerows(out)
        self.stdout.write(f'Аудит {year}: дней={len(days)}, замечаний={len(out)}, отчёт={path}')
        for issue,n in Counter(key for row in out for key in row[1].split('|')).most_common():
            self.stdout.write(f'  {issue}: {n}')
