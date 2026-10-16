#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Безопасная очистка полностью непривязанных CalendarFeast в локальной SQLite.
Сначала: python -X utf8 cleanup_calendar_orphans.py
Применить: python -X utf8 cleanup_calendar_orphans.py --apply
"""
import argparse
import csv
import hashlib
import json
import os
import sqlite3
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
import django

django.setup()
from django.apps import apps
from django.conf import settings
from django.db import connection, transaction
from django.db.models import Count, Q
from api.calendar_models import CalendarDay, CalendarFeast


def fingerprint():
    """Хеш связей и дат для проверки целостности до/после."""
    h = hashlib.sha256()
    qs = CalendarDay.objects.order_by("date_gregorian").values_list(
        "id", "date_gregorian", "main_feast_id", "fast_type_id"
    )
    count = 0
    for pk, date, main, fast in qs.iterator():
        h.update(f"D|{pk}|{date}|{main}|{fast}\n".encode())
        count += 1
    through = CalendarDay.feasts.through
    for day_id, feast_id in (
        through.objects.order_by("calendarday_id", "calendarfeast_id")
        .values_list("calendarday_id", "calendarfeast_id")
        .iterator()
    ):
        h.update(f"L|{day_id}|{feast_id}\n".encode())
    return h.hexdigest(), count


def check_db():
    with connection.cursor() as cursor:
        cursor.execute("PRAGMA integrity_check")
        integrity = cursor.fetchone()[0]
        cursor.execute("PRAGMA foreign_key_check")
        fks = cursor.fetchall()
    return integrity, fks


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply", action="store_true", help="Сделать backup и удалить непривязанные карточки"
    )
    args = parser.parse_args()
    if settings.DATABASES["default"]["ENGINE"] != "django.db.backends.sqlite3":
        raise SystemExit("СТОП: скрипт предназначен только для локальной SQLite, не Supabase.")
    db = Path(settings.DATABASES["default"]["NAME"]).resolve()
    if not db.is_file():
        raise SystemExit("СТОП: SQLite не найдена: " + str(db))

    # Проверяем все объявленные Django отношения к CalendarFeast; две ожидаемые связи явно учитываются.
    relations = []
    for model in apps.get_models():
        for field in model._meta.get_fields(include_hidden=False):
            if getattr(field, "auto_created", False) or not getattr(field, "is_relation", False):
                continue
            if getattr(field, "related_model", None) is CalendarFeast:
                relations.append(f"{model._meta.label}.{field.name}")
    expected = {"api.CalendarDay.feasts", "api.CalendarDay.main_feast"}
    if set(relations) != expected:
        raise SystemExit("СТОП: схема связей изменилась, требуется новый аудит: " + repr(relations))

    digest_before, days_before = fingerprint()
    integrity_before, fk_before = check_db()
    if integrity_before != "ok" or fk_before:
        raise SystemExit(f"СТОП: ошибка целостности БД: {integrity_before}; FK: {fk_before[:3]}")

    referenced_2026 = set(
        CalendarDay.objects.filter(date_gregorian__year=2026).values_list("feasts__id", flat=True)
    )
    referenced_2026.discard(None)
    referenced_2026.update(
        CalendarDay.objects.filter(date_gregorian__year=2026)
        .exclude(main_feast=None)
        .values_list("main_feast_id", flat=True)
    )
    live_all = set(CalendarDay.objects.values_list("feasts__id", flat=True))
    live_all.discard(None)
    live_all.update(
        CalendarDay.objects.exclude(main_feast=None).values_list("main_feast_id", flat=True)
    )
    all_ids = set(CalendarFeast.objects.values_list("pk", flat=True))
    orphan_ids = sorted(all_ids - live_all)
    other_year_only = live_all - referenced_2026

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    report = ROOT / "reports" / f"calendar_orphan_cleanup_{ts}"
    report.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "id",
        "title",
        "short_title",
        "source_id",
        "sync_uid",
        "life_chars",
        "troparion_chars",
        "kontakion_chars",
        "icon_url",
    ]
    with (report / "orphan_candidates.csv").open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=";")
        writer.writeheader()
        for obj in CalendarFeast.objects.filter(pk__in=orphan_ids).order_by("pk").iterator():
            writer.writerow(
                {
                    "id": obj.pk,
                    "title": obj.title,
                    "short_title": obj.short_title,
                    "source_id": obj.source_id or "",
                    "sync_uid": str(obj.sync_uid or ""),
                    "life_chars": len(obj.life_content or ""),
                    "troparion_chars": len(obj.troparion_content or ""),
                    "kontakion_chars": len(obj.kontakion_content or ""),
                    "icon_url": obj.icon_url,
                }
            )
    summary = {
        "db": str(db),
        "db_bytes_before": db.stat().st_size,
        "days_total": days_before,
        "cards_total": len(all_ids),
        "used_2026": len(referenced_2026),
        "used_other_years_only": len(other_year_only),
        "used_any_year": len(live_all),
        "orphan_count": len(orphan_ids),
        "links_sha256_before": digest_before,
        "mode": "APPLY" if args.apply else "PREVIEW",
        "warning": "Кандидаты не связаны ни с одним CalendarDay; проверьте внешние не-Django ID и JSON до очистки.",
    }
    (report / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(
        f"Карточек всего: {len(all_ids)}; в днях 2026: {len(referenced_2026)}; "
        f"только в других годах: {len(other_year_only)}; сирот: {len(orphan_ids)}"
    )
    print("Папка отчёта:", report)
    if not args.apply:
        print(
            "ПРОСМОТР: база не менялась. Применение: python -X utf8 cleanup_calendar_orphans.py --apply"
        )
        return
    if not orphan_ids:
        print("Удалять нечего.")
        return
    backup_dir = ROOT / "backups" / "sqlite"
    backup_dir.mkdir(parents=True, exist_ok=True)
    backup = backup_dir / f"before_calendar_orphans_{ts}.sqlite3"
    with sqlite3.connect(str(db)) as source, sqlite3.connect(str(backup)) as target:
        source.backup(target)
    print("BACKUP:", backup)

    with transaction.atomic():
        # Защита от изменений календаря со времени первичной проверки.
        if fingerprint()[0] != digest_before:
            raise RuntimeError("СТОП: календарные связи изменились. Удаление отменено.")
        live_check = set(CalendarDay.objects.values_list("feasts__id", flat=True))
        live_check.discard(None)
        live_check.update(
            CalendarDay.objects.exclude(main_feast=None).values_list("main_feast_id", flat=True)
        )
        if set(orphan_ids) & live_check:
            raise RuntimeError("СТОП: найдена новая связь с кандидатом. Удаление отменено.")
        # Основной риск автоматических каскадов: модельные отношения сверх ожидаемых проверены выше.
        removed, details = CalendarFeast.objects.filter(pk__in=orphan_ids).delete()
        if removed != len(orphan_ids):
            raise RuntimeError(
                f"СТОП: удалено не то количество объектов: {removed} != {len(orphan_ids)}; {details}"
            )
        if fingerprint()[0] != digest_before:
            raise RuntimeError("СТОП: изменились связи! Транзакция откатывается.")

    integrity_after, fk_after = check_db()
    digest_after, days_after = fingerprint()
    if (
        integrity_after != "ok"
        or fk_after
        or digest_after != digest_before
        or days_after != days_before
    ):
        raise SystemExit(
            "ОШИБКА КОНТРОЛЯ после очистки! Не выполняйте VACUUM; восстановите backup."
        )
    summary.update(
        {
            "deleted": removed,
            "cards_remaining": CalendarFeast.objects.count(),
            "links_sha256_after": digest_after,
            "integrity_after": integrity_after,
            "db_bytes_after": db.stat().st_size,
            "backup": str(backup),
        }
    )
    (report / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(
        f'ГОТОВО: удалено {removed}; осталось {summary["cards_remaining"]}; связи и дни не изменились.'
    )
    print("SQLite после удаления может не уменьшиться: VACUUM здесь намеренно не выполняется.")


if __name__ == "__main__":
    main()
