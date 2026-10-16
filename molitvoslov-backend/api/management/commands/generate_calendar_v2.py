"""Safe experimental generator of civil calendar days from the 2026 feast library.

python manage.py generate_calendar_v2 --year 2027 --month 1 --dry-run
python manage.py generate_calendar_v2 --year 2027 --month 1 --apply --allow-incomplete
Existing days are never touched unless --replace-existing is explicitly set.
2026 is immutable. Incomplete reading rules are reported, not guessed.
"""

import csv
import json
import sqlite3
import time
import uuid
from collections import Counter
from datetime import date
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from api.calendar_engine_v2 import (
    REFERENCE_YEAR,
    Memorial,
    build_schedule,
    calculate_fasting,
    julian_month_day,
    orthodox_pascha,
    pick_main,
    resolve_readings,
    year_days,
)
from api.calendar_models import CalendarDay, CalendarFeast, CalendarReading, CalendarFastType

READING_UUID_NAMESPACE = uuid.UUID("3c9d3e41-af31-42bc-b64c-d0e20b6108e2")


def source_rules_2026():
    """Take the 2026 curated links as input, never the raw Azbyka importer."""
    days = list(
        CalendarDay.objects.filter(date_gregorian__year=REFERENCE_YEAR)
        .prefetch_related("feasts")
        .order_by("date_gregorian")
    )
    if len(days) != 365:
        raise CommandError(f"Для эталона требуется 365 дней 2026, найдено {len(days)}")
    expected = list(year_days(REFERENCE_YEAR))
    if [d.date_gregorian for d in days] != expected:
        raise CommandError("Эталон 2026 имеет пропущенные или повторяющиеся даты")
    result = []
    for d in days:
        feast_list = list(d.feasts.all())
        ids = {f.pk for f in feast_list}
        if d.main_feast_id and d.main_feast_id not in ids:
            raise CommandError(f"Нарушена связь главной памяти 2026: {d.date_gregorian}")
        for f in feast_list:
            result.append(
                Memorial(
                    id=f.pk,
                    title=f.title,
                    source_date=d.date_gregorian,
                    is_reference_main=(f.pk == d.main_feast_id),
                    stored_easter_offset=f.easter_offset,
                )
            )
    return result


def load_reading_rules(path):
    if not path:
        return {}
    obj = json.loads(Path(path).read_text(encoding="utf-8-sig"))
    if not isinstance(obj, dict):
        raise CommandError("Файл чтений должен быть JSON-объектом: ISO дата => проверенные чтения")
    return obj


def snapshot(db, output_dir):
    output_dir.mkdir(parents=True, exist_ok=True)
    dest = output_dir / (
        "before_generate_calendar_v2_" + time.strftime("%Y%m%d_%H%M%S") + ".sqlite3"
    )
    if dest.exists():
        raise CommandError("Имя резервной копии занято, повторите через секунду")
    with sqlite3.connect(str(db)) as src, sqlite3.connect(str(dest)) as dst:
        src.backup(dst)
    return dest


def report_csv(path, rows, headers):
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=headers, delimiter=";", extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


class Command(BaseCommand):
    help = "Экспериментальный многолетний движок: памяти 2026 -> выбранный год, посты, проверенные чтения"

    def add_arguments(self, parser):
        parser.add_argument("--year", type=int, required=True)
        parser.add_argument("--month", type=int, choices=range(1, 13), metavar="1..12")
        mode = parser.add_mutually_exclusive_group(required=True)
        mode.add_argument("--dry-run", action="store_true")
        mode.add_argument("--apply", action="store_true")
        parser.add_argument(
            "--replace-existing",
            action="store_true",
            help="Только для будущих лет: заменить связи в уже существующих днях",
        )
        parser.add_argument(
            "--allow-incomplete",
            action="store_true",
            help="Разрешить записать предварительные дни без полной таблицы чтений и исключений",
        )
        parser.add_argument(
            "--reading-rules",
            default="",
            help="JSON с проверенными чтениями на даты; без него чтения помечаются как нерешённые",
        )

    def handle(self, *args, **opt):
        year = opt["year"]
        if year <= REFERENCE_YEAR or not 1900 <= year <= 2099:
            raise CommandError("Доступны только 2027–2099; 2026 не изменяем")
        if connection.vendor != "sqlite":
            raise CommandError("Запуск разрешён только на локальной SQLite, не Supabase")
        db = Path(settings.DATABASES["default"]["NAME"]).resolve()
        if not db.is_file():
            raise CommandError("Локальная SQLite не найдена")
        if opt["replace_existing"] and not opt["apply"]:
            raise CommandError("--replace-existing применяется только вместе с --apply")

        source = source_rules_2026()
        # Prove the inferred source-date rules reproduce every reference link
        # and the main feast in 2026, without writing to that year.
        reference_schedule, reference_special = build_schedule(source, REFERENCE_YEAR)
        original = {}
        original_main = {}
        for m in source:
            original.setdefault(m.source_date, set()).add(m.id)
            if m.is_reference_main:
                original_main[m.source_date] = m.id
        reference_differences = []
        for dt, rules in reference_schedule.items():
            actual = {r.feast_id for r in rules}
            if actual != original.get(dt, set()) or pick_main(rules) != original_main.get(dt):
                reference_differences.append(dt.isoformat())
        if reference_differences:
            raise CommandError(
                "Эталон 2026 НЕ воспроизведён; остановка: " + ", ".join(reference_differences[:20])
            )
        schedule, special = build_schedule(source, year)
        rules = load_reading_rules(opt["reading_rules"])
        dates = [d for d in year_days(year) if not opt["month"] or d.month == opt["month"]]
        preexisting = {
            d.date_gregorian: d
            for d in CalendarDay.objects.filter(
                date_gregorian__gte=dates[0], date_gregorian__lte=dates[-1]
            ).prefetch_related("feasts")
        }
        rows = []
        planned = []
        for day in dates:
            feast_rules = schedule[day]
            main = pick_main(feast_rules)
            fast = calculate_fasting(day)
            readings = resolve_readings(day, rules)
            existing = preexisting.get(day)
            if not feast_rules:
                decision = "NO_FEASTS"
            elif existing and not opt["replace_existing"]:
                decision = "EXISTING_SKIP"
            elif not readings.complete and not opt["allow_incomplete"]:
                decision = "INCOMPLETE_SKIP"
            elif existing:
                decision = "EXISTING_REPLACE"
            else:
                decision = "CREATE"
            old_ids = set(existing.feasts.values_list("pk", flat=True)) if existing else set()
            new_ids = {r.feast_id for r in feast_rules}
            rows.append(
                dict(
                    date=day.isoformat(),
                    status=decision,
                    main_feast_id=main or "",
                    feast_count=len(feast_rules),
                    existing_feasts=len(old_ids),
                    matches=len(new_ids & old_ids),
                    fast_status=fast.status,
                    fast_name=fast.period,
                    fast_basis=fast.basis,
                    readings_verified=int(readings.complete),
                    readings_count=len(readings.readings),
                    missing_from_existing=",".join(map(str, sorted(new_ids - old_ids))),
                    left_in_existing=",".join(map(str, sorted(old_ids - new_ids))),
                    engine_version="2.0",
                )
            )
            if decision in ("CREATE", "EXISTING_REPLACE"):
                planned.append((day, feast_rules, main, fast, readings, existing))

        out = (
            Path(settings.BASE_DIR)
            / "reports"
            / ("calendar_v2_" + str(year) + "_" + time.strftime("%Y%m%d_%H%M%S"))
        )
        out.mkdir(parents=True, exist_ok=True)
        report_csv(out / "days.csv", rows, list(rows[0]))
        report_csv(
            out / "special_rules.csv",
            [
                dict(
                    feast_id=s.feast_id,
                    source_date=s.source_date.isoformat(),
                    title=s.title,
                    why=s.reason,
                )
                for s in special
            ],
            ["feast_id", "source_date", "title", "why"],
        )
        summary = dict(
            year=year,
            month=opt["month"],
            pascha=orthodox_pascha(year).isoformat(),
            reference_year=REFERENCE_YEAR,
            reference_selfcheck="OK: all 365 days and main feasts",
            source_links=len(source),
            days=len(dates),
            status_counts=dict(Counter(r["status"] for r in rows)),
            special_rules=len(special),
            days_without_feasts=sum(not schedule[d] for d in dates),
            days_without_verified_readings=sum(
                not resolve_readings(d, rules).complete for d in dates
            ),
            day_rule="julian_fixed/pascha_offset; special holidays require manual rules",
            diet_level="not computed; no guessed dry/oil/fish",
            source_2026_untouched=True,
            database_untouched=not opt["apply"],
        )
        (out / "summary.json").write_text(
            json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        self.stdout.write(
            f"ЭТАЛОН 2026: совпали все 365 дней, все {len(source)} связей и главные памяти"
        )
        self.stdout.write(f'Пасха {year}: {summary["pascha"]}')
        self.stdout.write(f'Дней: {len(dates)}; статус: {summary["status_counts"]}')
        self.stdout.write(f"Не классифицировано особых памятей (весь эталон): {len(special)}")
        self.stdout.write(
            f'Дней без памятей: {summary["days_without_feasts"]}; без проверенных чтений: {summary["days_without_verified_readings"]}'
        )
        self.stdout.write(f"Отчёты: {out}")
        if not opt["apply"]:
            self.stdout.write("DRY-RUN — ничего не записано.")
            return
        if not planned:
            self.stdout.write("Записывать нечего; база не изменена.")
            return
        backup = snapshot(db, Path(settings.BASE_DIR) / "backups" / "sqlite")
        self.stdout.write(f"BACKUP: {backup}")
        fast_types = {f.code: f for f in CalendarFastType.objects.all()}
        with transaction.atomic():
            for day, feast_rules, main, fast, reading_result, existing in planned:
                # We intentionally never set food strictness; 'cheese' and
                # 'no-fast' are optional existing codes, not newly created types.
                fast_code = (
                    "cheese"
                    if fast.status == "cheese"
                    else "no-fast" if fast.status == "fast_free" else ""
                )
                fast_type = fast_types.get(fast_code)
                base = {
                    "julian_month": julian_month_day(day)[0],
                    "julian_day": julian_month_day(day)[1],
                    "main_feast_id": main,
                    "fast_type": fast_type,
                    "fast_type_code": fast_code,
                    "fast_type_title": (
                        "Постный день"
                        if fast.status == "fast"
                        else "Сырная седмица" if fast.status == "cheese" else ""
                    ),
                    "fast_name": fast.period if fast.status in ("fast", "cheese") else "",
                    "fast_description": "",
                }
                payload = (
                    dict(existing.source_payload)
                    if existing and isinstance(existing.source_payload, dict)
                    else {}
                )
                payload["calendar_engine_v2"] = {
                    "version": "2.0",
                    "reference_year": REFERENCE_YEAR,
                    "status": "complete" if reading_result.complete and not special else "partial",
                    "reading_status": "verified" if reading_result.complete else "unresolved",
                    "fast_status": fast.status,
                    "fast_basis": fast.basis,
                    "diet_rule_verified": False,
                    "date_rules": "julian_fixed+pascha_offset; exceptions pending",
                }
                base["source_payload"] = payload
                if existing:
                    CalendarDay.objects.filter(pk=existing.pk).update(**base)
                    obj = existing
                else:
                    obj = CalendarDay.objects.create(date_gregorian=day, **base)
                obj.feasts.set([r.feast_id for r in feast_rules])
                # Existing manually-entered readings are NOT erased or altered.
                if not existing and reading_result.complete:
                    entries = []
                    for idx, r in enumerate(reading_result.readings):
                        uid = uuid.uuid5(
                            READING_UUID_NAMESPACE, f'{day}|{r["kind"]}|{idx}|{r["title"]}'
                        )
                        entries.append(
                            CalendarReading(
                                day=obj,
                                sync_uid=uid,
                                kind=r["kind"],
                                title=r["title"],
                                label=r.get("label", ""),
                                order=r.get("order", (idx + 1) * 10),
                            )
                        )
                    CalendarReading.objects.bulk_create(entries)
                    g = next(
                        (r["title"] for r in reading_result.readings if r["kind"] == "gospel"), ""
                    )
                    a = next(
                        (r["title"] for r in reading_result.readings if r["kind"] == "apostle"), ""
                    )
                    CalendarDay.objects.filter(pk=obj.pk).update(gospel_title=g, apostolic_title=a)
        self.stdout.write(
            self.style.SUCCESS(f"Готово: дней создано/обновлено {len(planned)}. 2026 не менялся.")
        )
        if not rules:
            self.stdout.write(
                self.style.WARNING(
                    "Чтения НЕ заполнены — нет проверенной таблицы зачал. Новые годы НЕ готовы к релизу."
                )
            )
