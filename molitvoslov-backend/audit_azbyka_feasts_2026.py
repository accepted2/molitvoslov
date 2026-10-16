#!/usr/bin/env python3
"""Read-only 2026 Azbyka vs SQLite day feast links audit.

Run from the molitvoslov-backend directory:
    python -X utf8 .\audit_azbyka_feasts_2026.py

No DB writes, no import, no Cloudinary, no Supabase changes.
"""
import csv
import os
import sys
import time
import re
from collections import Counter
from datetime import date, timedelta, datetime
from difflib import SequenceMatcher
from pathlib import Path
from urllib.parse import urljoin, urlparse

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
os.chdir(ROOT)
os.environ.setdefault('DJANGO_SETTINGS_MODULE','backend.settings')

import django
django.setup()
import requests
from bs4 import BeautifulSoup
from django.db import connection
from api.calendar_models import CalendarDay
from api.azbyka_calendar_feasts import (
    extract_day_saint_links,
    match_key,
    similarity,
    AzbykaFeastError,
)
from api.management.commands.import_azbyka_calendar_feasts import (
    deterministic_azbyka_day_feast_uid,
)

START = date(2026, 1, 1)
END = date(2026, 12, 31)
DELAY = 0.45
TIMEOUT = 22
HEADERS = {'User-Agent': 'MolitvoslovCalendarAudit/1.0 (personal noncommercial comparison)'}


def csv_save(path, columns, entries):
    with path.open('w', newline='', encoding='utf-8-sig') as file:
        writer = csv.DictWriter(file, columns, delimiter=';', extrasaction='ignore')
        writer.writeheader()
        writer.writerows(entries)


def link_count(soup):
    # Optional secondary tally: unique profile URLs in the relevant calendar
    # section, not the card count. One grouped card can contain several links.
    headings=soup.find_all(re.compile(r'^h[1-6]$'))
    reading=next((h for h in headings if 'чтения священного писания' in h.get_text(' ',strip=True).casefold()),None)
    if reading is None:
        return None
    links=set()
    for a in reading.find_all_previous('a',href=True):
        path=urlparse(urljoin('https://azbyka.ru',a['href'])).path.rstrip('/')
        if re.fullmatch(r'/days/(?:sv|svv|prazdnik|ikona)-[^/?#]+',path):
            links.add(path)
    return len(links)


def match_days(day, sources):
    local = list(day.feasts.all()) if day else []
    if day and day.main_feast and all(f.pk != day.main_feast.pk for f in local):
        local.append(day.main_feast)

    # Match exact deterministic source IDs first. Only unique confident title
    # matches thereafter. Ambiguous cases should never be marked 'present'.
    source_map={i:s for i,s in enumerate(sources)}
    remaining_l={f.pk:f for f in local}
    matched={}
    for i,s in source_map.items():
        uid=deterministic_azbyka_day_feast_uid(day.date_gregorian,s.url) if day else None
        found=[f for f in remaining_l.values() if f.sync_uid==uid]
        if len(found)==1:
            matched[i]=(found[0],'точный sync_uid',1.0)
            del remaining_l[found[0].pk]

    for i,s in source_map.items():
        if i in matched or not remaining_l:
            continue
        ranked=sorted([(similarity(s.title, f.short_title or f.title), f) for f in remaining_l.values()],key=lambda p:p[0],reverse=True)
        if not ranked:
            continue
        best,f=ranked[0]
        runner=ranked[1][0] if len(ranked)>1 else 0
        # Conservative title matching: 0.90 or stronger, with an evident lead.
        if best>=0.90 and best-runner>=0.09:
            matched[i]=(f,'вероятное соответствие названий',round(best,3))
            del remaining_l[f.pk]

    return local, matched, list(remaining_l.values())


def main():
    if connection.vendor!='sqlite':
        raise RuntimeError('Остановлено: ожидается локальная SQLite. Проверьте переменные подключения.')
    stamp=datetime.now().strftime('%Y%m%d_%H%M%S')
    out=ROOT/'reports'/f'azbyka_feasts_audit_2026_{stamp}'
    out.mkdir(parents=True,exist_ok=True)
    days={x.date_gregorian:x for x in CalendarDay.objects.filter(date_gregorian__range=(START,END)).select_related('main_feast').prefetch_related('feasts')}
    overview=[]
    differences=[]
    errors=[]
    session=requests.Session()
    stats=Counter()
    try:
        current=START
        while current<=END:
            day=days.get(current)
            local_count=len({f.pk for f in day.feasts.all()}) if day else 0
            if day and day.main_feast:
                local_count=len({f.pk for f in day.feasts.all()} | {day.main_feast_id})
            url=f'https://azbyka.ru/days/{current.isoformat()}'
            source_count=None
            personal_links=None
            matches=0
            unmatched_source=0
            unmatched_local=0
            status='ERROR'
            error=''
            try:
                res=session.get(url,timeout=TIMEOUT,headers=HEADERS)
                res.raise_for_status()
                html=res.text
                sources=extract_day_saint_links(html)
                source_count=len(sources)
                personal_links=link_count(BeautifulSoup(html,'lxml'))
                local, matched, extras=match_days(day,sources)
                matches=len(matched)
                unmatched_source=source_count-matches
                unmatched_local=len(extras)
                if not day:
                    status='MISSING_DAY'
                elif unmatched_source==0 and unmatched_local==0:
                    status='MATCH'
                elif unmatched_source:
                    status='MISSING_OR_RENAMED'
                else:
                    status='LOCAL_EXTRA'
                stats['ok_days']+=1
                stats['azbyka_cards']+=source_count
                stats['local_cards']+=local_count
                stats['matched']+=matches
                stats['not_matched_source']+=unmatched_source
                stats['local_extras']+=unmatched_local
                if status!='MATCH':
                    stats['days_attention']+=1
                for idx,s in enumerate(sources):
                    if idx not in matched:
                        differences.append({'date':current.isoformat(),'kind':'AZBYKA_NO_CONFIDENT_LOCAL_MATCH','azbyka_title':s.title,'local_title':'','local_id':'','azbyka_url':s.url,'score':'','note':'Не доказано отсутствие: возможна другая редакция названия или групповая память'})
                for f in extras:
                    differences.append({'date':current.isoformat(),'kind':'LOCAL_NO_CONFIDENT_AZBYKA_MATCH','azbyka_title':'','local_title':f.short_title or f.title,'local_id':f.pk,'azbyka_url':'','score':'','note':'Может быть добавочная память или иной вариант названия'})
            except (requests.RequestException,AzbykaFeastError,ValueError) as exc:
                error=f'{type(exc).__name__}: {exc}'
                stats['error_days']+=1
                errors.append({'date':current.isoformat(),'url':url,'error':error})
            overview.append({'date':current.isoformat(),'local_cards':local_count,'azbyka_cards':source_count if source_count is not None else '',
                'azbyka_personal_links':personal_links if personal_links is not None else '',
                'confident_matches':matches if source_count is not None else '',
                'azbyka_unmatched':unmatched_source if source_count is not None else '',
                'local_unmatched':unmatched_local if source_count is not None else '',
                'status':status,'url':url,'error':error})
            pos=len(overview)
            if pos%10==0 or pos==365:
                print(f'[{pos}/365] Сверено: {stats["ok_days"]}; ошибки: {stats["error_days"]}; дней с расхождениями: {stats["days_attention"]}',flush=True)
                csv_save(out/'by_day.csv',list(overview[0]),overview)
                csv_save(out/'differences.csv',['date','kind','azbyka_title','local_title','local_id','azbyka_url','score','note'],differences)
                csv_save(out/'errors.csv',['date','url','error'],errors)
            current+=timedelta(days=1)
            time.sleep(DELAY)
    except KeyboardInterrupt:
        print('Прервано пользователем: промежуточные CSV уже сохранены при последнем десятке дней.',flush=True)
    finally:
        csv_save(out/'by_day.csv',list(overview[0]) if overview else ['date','status'],overview)
        csv_save(out/'differences.csv',['date','kind','azbyka_title','local_title','local_id','azbyka_url','score','note'],differences)
        csv_save(out/'errors.csv',['date','url','error'],errors)
        session.close()
    print('\nИТОГО',flush=True)
    print(f'Дней проверено: {len(overview)}/365; получено страниц Azbyka: {stats["ok_days"]}; ошибок: {stats["error_days"]}',flush=True)
    print(f'Пунктов Azbyka: {stats["azbyka_cards"]}; связанных локальных карточек: {stats["local_cards"]}',flush=True)
    print(f'Уверенно сопоставлено: {stats["matched"]}; без уверенного совпадения Azbyka: {stats["not_matched_source"]}; локальных: {stats["local_extras"]}',flush=True)
    print(f'Дней с потенциальными расхождениями: {stats["days_attention"]}',flush=True)
    print(f'ОТЧЁТЫ: {out}',flush=True)
    print('База не менялась. Разница не обязательно означает пропуск святого: проверьте групповые памяти и различия названий.',flush=True)

if __name__=='__main__':
    main()
