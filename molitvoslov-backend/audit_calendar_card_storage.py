#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""READ-ONLY: локальный аудит карточек календаря перед очисткой и многолетней схемой.
python -X utf8 audit_calendar_card_storage.py
Ничего не удаляет, не меняет и не синхронизирует.
"""
import csv
import hashlib
import json
import os
import re
import sqlite3
import uuid
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

ROOT=Path(__file__).resolve().parent
os.chdir(ROOT)
os.environ.setdefault("DJANGO_SETTINGS_MODULE","backend.settings")
import django
django.setup()
from django.apps import apps
from django.conf import settings
from django.db import connection
from django.db.models import Q
from api.calendar_models import CalendarDay,CalendarFeast,CalendarFastType,CalendarReading

IMPORT_NAMESPACE=uuid.UUID("7d2f2de2-0c81-4ca9-a852-924a35d5e46b")
TEXT_FIELDS=("title","short_title","title_uk","short_title_uk","life_title","life_content",
             "troparion_title","troparion_content","kontakion_title","kontakion_content",
             "description","life_content_uk","troparion_content_uk","kontakion_content_uk")
def write_csv(path,rows,columns):
    with path.open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.DictWriter(f,fieldnames=columns,delimiter=";",extrasaction="ignore")
        w.writeheader();w.writerows(rows)
def compact(s):
    return re.sub(r"\s+"," ",(s or "").casefold().replace("ё","е")).strip()
def id_digest(f):
    # Text signatures are *comparison hints*, not proof that cards are identical.
    vals=[f.life_content or "",f.troparion_content or "",f.kontakion_content or ""]
    if not any(vals): return ""
    return hashlib.sha256(json.dumps(vals,ensure_ascii=False).encode("utf-8")).hexdigest()[:16]

def model_references():
    # Discover declared FK / OneToOne / ManyToMany references, including other apps.
    specs=[]
    seen=set()
    for model in apps.get_models():
        for field in model._meta.get_fields(include_hidden=False):
            if not getattr(field,"is_relation",False):continue
            if getattr(field,"auto_created",False):continue
            if getattr(field,"related_model",None)!=CalendarFeast:continue
            k=(model._meta.label,field.name)
            if k in seen:continue
            seen.add(k)
            specs.append((model,field))
    return specs

def collect_refs():
    refs=defaultdict(lambda:defaultdict(set))
    specs=model_references()
    # Only read queries; avoid relying on undocumented relation types.
    for model,field in specs:
        label=f"{model._meta.label}.{field.name}"
        if field.many_to_many:
            through=field.remote_field.through
            # ORM M2M managers are safe and avoid guessing through field names.
            qs=model.objects.values_list("pk",flat=True).iterator(chunk_size=500)
            for pk in qs:
                obj=model.objects.get(pk=pk)
                for fid in getattr(obj,field.name).values_list("pk",flat=True):
                    refs[fid][label].add(str(pk))
        else:
            attname=field.attname
            for pk,fid in model.objects.exclude(**{attname:None}).values_list("pk",attname).iterator(chunk_size=1000):
                refs[fid][label].add(str(pk))
    return refs,[f"{m._meta.label}.{f.name}" for m,f in specs]

def main():
    eng=settings.DATABASES["default"]["ENGINE"]
    if eng!="django.db.backends.sqlite3":raise SystemExit("СТОП: необходима локальная SQLite, не Supabase.")
    db=Path(settings.DATABASES["default"]["NAME"]).resolve()
    if not db.exists():raise SystemExit("СТОП: SQLite не найдена: "+str(db))
    ts=datetime.now().strftime("%Y%m%d_%H%M%S")
    out=ROOT/"reports"/f"calendar_cards_audit_{ts}"
    out.mkdir(parents=True,exist_ok=True)
    print("SQLite:",db)
    print("Режим: только чтение. Проверка связей...")
    refs,covered=collect_refs()
    cards=list(CalendarFeast.objects.all().iterator(chunk_size=500))
    linked2026=defaultdict(list)
    for d in CalendarDay.objects.filter(date_gregorian__year=2026).prefetch_related("feasts").iterator(chunk_size=100):
        for feast in d.feasts.all():linked2026[feast.pk].append(str(d.date_gregorian))
        if d.main_feast_id:linked2026[d.main_feast_id].append(str(d.date_gregorian)+" [main]")
    siggroups=defaultdict(list);namegroups=defaultdict(list)
    for f in cards:
        sig=id_digest(f)
        if sig:siggroups[sig].append(f.pk)
        key=compact(f.title)
        if key:namegroups[key].append(f.pk)
    rows=[]
    for f in cards:
        rel=refs.get(f.pk,{})
        types=sorted(rel)
        keys2026=sorted(set(linked2026.get(f.pk,[])))
        # An old card may have sync_uid, and a new day-based import may be orphaned.
        # Neither sync_uid nor source_id is an authoritative retention rule.
        if rel: status="REFERENCED_KEEP"
        else: status="ORPHAN_REVIEW_ONLY"
        sig=id_digest(f)
        rows.append(dict(
            id=f.pk, status=status, title=f.title,short_title=f.short_title,
            source_id=f.source_id or "",sync_uid=str(f.sync_uid or ""),
            likely_old_source_id=int(bool(f.source_id)),
            has_sync_uid=int(bool(f.sync_uid)),
            references_total=sum(len(z) for z in rel.values()),
            reference_models=" | ".join(f"{k}:{len(v)}" for k,v in sorted(rel.items())),
            dates_2026=" | ".join(keys2026),
            other_same_title_ids=" | ".join(str(i) for i in namegroups.get(compact(f.title),[]) if i!=f.pk)[:400],
            same_text_ids=" | ".join(str(i) for i in siggroups.get(sig,[]) if i!=f.pk)[:400] if sig else "",
            text_signature=sig,
            has_life=int(bool(f.life_content)),has_troparion=int(bool(f.troparion_content)),
            has_kontakion=int(bool(f.kontakion_content)),has_icon=int(bool(f.icon_url)),
            text_chars=sum(len(getattr(f,x) or "") for x in TEXT_FIELDS),
            julian_month=f.julian_month or "",julian_day=f.julian_day or "",
            easter_offset=f.easter_offset if f.easter_offset is not None else "",
            date_type=f.date_type,all_dates=json.dumps(f.all_dates,ensure_ascii=False)
        ))
    write_csv(out/"cards.csv",rows,list(rows[0]) if rows else ["id"])
    orphan=[r for r in rows if r["status"]=="ORPHAN_REVIEW_ONLY"]
    write_csv(out/"orphan_candidates.csv",orphan,list(rows[0]) if rows else ["id"])
    duplicates=[]
    for kind,groups in (("same_title",namegroups),("same_ru_hymn_life",siggroups)):
        for key,ids in groups.items():
            if len(ids)<2:continue
            duplicates.append(dict(group_type=kind,group_key=key[:150],count=len(ids),
                                   feast_ids=",".join(map(str,ids)),
                                   referenced_count=sum(bool(refs.get(i)) for i in ids)))
    write_csv(out/"duplicate_groups.csv",duplicates,
              ["group_type","group_key","count","feast_ids","referenced_count"])
    days=[]
    for d in CalendarDay.objects.all().prefetch_related("feasts").iterator(chunk_size=150):
        feastids=set(d.feasts.values_list("id",flat=True))
        days.append(dict(date=str(d.date_gregorian),year=d.date_gregorian.year,
                         feast_count=len(feastids),main_feast_id=d.main_feast_id or "",
                         main_missing_from_feasts=int(bool(d.main_feast_id and d.main_feast_id not in feastids)),
                         readings_count=CalendarReading.objects.filter(day=d).count(),
                         fast_type_id=d.fast_type_id or "",fast_code=d.fast_type_code))
    write_csv(out/"days.csv",days,list(days[0]) if days else ["date"])
    fastrows=[dict(id=f.pk,code=f.code,name=f.name,sync_uid=str(f.sync_uid),
                   days_count=CalendarDay.objects.filter(fast_type=f).count()) for f in CalendarFastType.objects.all()]
    write_csv(out/"fast_types.csv",fastrows,["id","code","name","sync_uid","days_count"])
    with sqlite3.connect(f"file:{db.as_posix()}?mode=ro",uri=True) as conn:
        fk=conn.execute("PRAGMA foreign_key_check").fetchall()
        integrity=conn.execute("PRAGMA integrity_check").fetchone()[0]
        page_size=conn.execute("PRAGMA page_size").fetchone()[0]
        pages=conn.execute("PRAGMA page_count").fetchone()[0]
        free=conn.execute("PRAGMA freelist_count").fetchone()[0]
    summary={
       "timestamp":ts,"sqlite":str(db),"sqlite_bytes":db.stat().st_size,
       "sqlite_pages_bytes":pages*page_size,"freelist_bytes_estimate":free*page_size,
       "integrity_check":integrity,"foreign_key_issues":fk[:100],
       "cards_total":len(cards),"cards_referenced":len(cards)-len(orphan),
       "orphan_candidates_count":len(orphan),
       "orphans_with_source_id":sum(bool(r["source_id"]) for r in orphan),
       "orphans_with_sync_uid":sum(bool(r["sync_uid"]) for r in orphan),
       "cards_with_source_id":sum(bool(r["source_id"]) for r in rows),
       "cards_with_sync_uid":sum(bool(r["sync_uid"]) for r in rows),
       "2026_days":sum(r["year"]==2026 for r in days),
       "2026_days_with_no_feasts":sum(r["year"]==2026 and r["feast_count"]==0 for r in days),
       "2026_main_missing_from_feasts":sum(r["year"]==2026 and r["main_missing_from_feasts"] for r in days),
       "other_years":dict(Counter(r["year"] for r in days if r["year"]!=2026)),
       "reference_fields_checked":covered,
       "duplicates_group_count":len(duplicates),
       "fast_types_count":len(fastrows),
       "notes":[
         "orphan_candidates.csv — возможные кандидаты, НЕ список на автоматическое удаление.",
         "Поле sync_uid может принадлежать старой карточке. Ссылка Azbyka не сохранена отдельно; идентификаторы текущего импортёра включают дату.",
         "Похожие названия и одинаковые тексты не доказывают, что это одна память.",
         "Проверены объявленные Django FK/M2M связи; внешние ссылки по числовому id, GenericForeignKey и JSON необходимо проверить отдельно.",
         "После безопасного удаления SQLite может требовать VACUUM для фактического уменьшения файла; аудит VACUUM не вызывает.",
         "Годовые посты и Пасха требуют отдельной модели правил/расчёта, не копирования 2026 года.",
       ]
    }
    (out/"summary.json").write_text(json.dumps(summary,ensure_ascii=False,indent=2,default=str),encoding="utf-8")
    print(f"ВСЕГО карточек: {len(cards)}; используются: {len(cards)-len(orphan)}; кандидатов в сироты: {len(orphan)}")
    print(f"2026 дней: {summary['2026_days']}; главный праздник отсутствует в M2M: {summary['2026_main_missing_from_feasts']}")
    print("SQLite:",summary["sqlite_bytes"],"байт; integrity:",integrity,"; FK-проблем:",len(fk))
    print("ОТЧЁТ:",out)
    print("База не изменена.")
if __name__=="__main__":main()
