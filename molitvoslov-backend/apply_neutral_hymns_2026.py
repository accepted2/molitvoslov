#!/usr/bin/env python3
"""Conservative, context-aware neutral language edits in CalendarFeast hymn fields.

Edits exclusively approved grammatical phrases about land, people and country.
Leaves historical proper nouns, saint epithets, State/Church names intact.
Writes backups and an exact before/after review log. Can be rerun safely.
"""
import csv
import os
import re
import sqlite3
import unicodedata
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

import django
django.setup()
from django.conf import settings
from django.db import transaction
from api.calendar_models import CalendarFeast

# Left side is accent-insensitive. Right side is a grammatically adjusted phrase.
# IMPORTANT: Never substitute stand-alone geographical/historical names.
RULES = [
    ('землю российскую', 'землю нашу'),
    ('землю русскую', 'землю нашу'),
    ('земли российския', 'земли нашея'),
    ('земли русския', 'земли нашея'),
    ('земли российской', 'земли нашей'),
    ('российстей земли', 'нашей земли'),
    ('российской земли', 'нашей земли'),
    ('русской земли', 'нашей земли'),
    ('российская земля', 'наша земля'),
    ('русская земля', 'наша земля'),
    ('земля российская', 'земля наша'),
    ('земля русская', 'земля наша'),
    ('стране российстей', 'стране нашей'),
    ('стране российской', 'стране нашей'),
    ('стране российския', 'стране нашея'),
    ('страну российскую', 'страну нашу'),
    ('страну русскую', 'страну нашу'),
    ('страна российская', 'страна наша'),
    ('российская страна', 'наша страна'),
    ('державе российстей', 'державе нашей'),
    ('державе российской', 'державе нашей'),
    ('державу российскую', 'державу нашу'),
    ('сыновом российским', 'сыновом нашим'),
    ('сыновом русским', 'сыновом нашим'),
    ('народ российский', 'народ наш'),
    ('народа российского', 'народа нашего'),
    ('народу российскому', 'народу нашему'),
    ('российстии людие', 'людие наши'),
    ('российстии народи', 'народи наши'),
    ('людие русские', 'людие наши'),
    ('людем российским', 'людем нашим'),
    ('людям российским', 'людям нашим'),
    ('отечество российское', 'отечество наше'),
    ('отечеству российскому', 'отечеству нашему'),
    ('отечества российского', 'отечества нашего'),
]

FIELDS = ('troparion_content', 'kontakion_content')

def normalized_with_map(text):
    """Unicode NFC/NFD + casefold text; mapping logical characters to source spans."""
    n = []
    positions = []
    for match in re.finditer(r'[^\u0300-\u036f][\u0300-\u036f]*|[\u0300-\u036f]+', text):
        part = unicodedata.normalize('NFD', match.group())
        for char in part:
            if unicodedata.category(char) == 'Mn':
                continue
            for lowered in char.casefold():
                n.append(lowered)
                positions.append((match.start(), match.end()))
    return ''.join(n), positions

def norm(text):
    return ''.join(c for c in unicodedata.normalize('NFD', text.casefold()) if unicodedata.category(c) != 'Mn')

COMPILED = [(src, replacement, re.compile(r'(?<!\w)' + r'\s+'.join(re.escape(w) for w in norm(src).split()) + r'(?!\w)', re.U)) for src, replacement in RULES]


def replace_safe(text):
    # Resolve all candidates against ORIGINAL text, longest spans first; reject overlaps.
    normal, pos = normalized_with_map(text)
    candidates = []
    for src, dst, regex in COMPILED:
        for m in regex.finditer(normal):
            if not pos or m.end() == 0:
                continue
            start, end = pos[m.start()][0], pos[m.end()-1][1]
            candidates.append((start, end, src, dst))
    candidates.sort(key=lambda x: (x[0], -(x[1]-x[0])))
    chosen=[]
    for item in candidates:
        if chosen and item[0] < chosen[-1][1]:
            continue
        chosen.append(item)
    result=text
    changes=[]
    for start,end,rule,replacement in reversed(chosen):
        original=text[start:end]
        first = next((c for c in original if c.isalpha()), '')
        if first.isupper() and (start == 0 or text[:start].rstrip().endswith(('.', '!', '?', ':'))):
            replacement=replacement[:1].upper()+replacement[1:]
        result=result[:start]+replacement+result[end:]
        changes.append((rule,original,replacement, text[max(0,start-90):min(len(text),end+90)]))
    return result, list(reversed(changes))


def main():
    db=Path(settings.DATABASES['default']['NAME']).resolve()
    if not db.exists() or db.suffix != '.sqlite3':
        raise SystemExit('СТОП: ожидалась существующая SQLite-база')
    plans=[]
    n=0
    for feast in CalendarFeast.objects.all().only('id',*FIELDS).iterator(chunk_size=300):
        for field in FIELDS:
            old=getattr(feast,field) or ''
            if not old: continue
            new,changes=replace_safe(old)
            if changes:
                plans.append((feast.pk,field,old,new,changes))
                n+=len(changes)
    print(f'Проверено. Однозначных замен: {n}; полей: {len(plans)}; правил: {len(RULES)}',flush=True)
    if not plans:
        print('Ничего изменять не требуется.');return
    backup_dir=ROOT/'backups'/'sqlite';backup_dir.mkdir(parents=True,exist_ok=True)
    stamp=datetime.now().strftime('%Y%m%d_%H%M%S')
    backup=backup_dir/f'before_neutral_hymns_{stamp}.sqlite3'
    with sqlite3.connect(str(db)) as src, sqlite3.connect(str(backup)) as dst:src.backup(dst)
    print('Резервная копия:',backup,flush=True)
    report_dir=ROOT/'reports';report_dir.mkdir(exist_ok=True)
    report=report_dir/f'hymns_neutral_changes_{stamp}.csv'
    # Persist a durable audit BEFORE modifying database, retaining literal original phrase.
    with report.open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.writer(f,delimiter=';')
        w.writerow(['feast_id','field','правило','исходный_фрагмент','новый_фрагмент','контекст'])
        for fid,field,old,new,changes in plans:
            for rule,before,after,context in changes:
                w.writerow([fid,field,rule,before,after,context.replace('\n',' ')])
    print('Журнал замен:',report,flush=True)
    # Atomic replacement; stop if any original field has changed since scanning.
    with transaction.atomic():
        for fid,field,old,new,changes in plans:
            result=CalendarFeast.objects.filter(pk=fid,**{field:old}).update(**{field:new})
            if result!=1:
                raise RuntimeError(f'Данные изменились в процессе: {fid}/{field}. Все изменения отменены.')
    print(f'ГОТОВО. Изменено фрагментов: {n}; текстовых полей: {len(plans)}.',flush=True)
    print('Исторические названия, личные эпитеты и неочевидные случаи не менялись.',flush=True)

if __name__=='__main__': main()
