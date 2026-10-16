"""Generate complete YEAR ROWS and curated feast links for a year or year range.

2026 is an immutable reference.  Yearly rows, links, and *basic* fasting flags
are generated locally, reusing existing CalendarFeast PKs. Verified readings
may be added from a separately audited JSON table; unverified ones are never
fabricated. This is NOT an authoritative Typikon / lectionary implementation.
"""

from __future__ import annotations

import csv
import hashlib
import json
import sqlite3
import uuid
from collections import Counter
from datetime import date, datetime, timezone
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connections, transaction

from api.calendar_engine_v4 import (
    REFERENCE_YEAR,
    build_schedule_v4 as build_schedule,
    classify_v4,
    calculate_fasting,
    julian_month_day,
    orthodox_pascha,
    choose_main_v4,
    resolve_readings,
    year_days,
)
from api.calendar_models import CalendarDay, CalendarFeast, CalendarFastType, CalendarReading
from api.management.commands.generate_calendar_v2 import source_rules_2026, load_reading_rules

READING_NAMESPACE = uuid.UUID("670bc41a-a691-45ca-b24d-60699c0ecf3b")


def selected_years(*, year=None, start=None, end=None):
    if year is not None:
        if start is not None or end is not None:
            raise ValueError("Используйте либо --year, либо --start-year с --end-year.")
        start = end = year
    elif start is None or end is None:
        raise ValueError("Укажите --year или обе границы --start-year и --end-year.")
    if not (REFERENCE_YEAR < start <= end <= 2099):
        raise ValueError("Можно генерировать только 2027–2099, в правильном порядке.")
    if end - start > 15:
        raise ValueError("За один запуск допускается до 16 лет: выполняйте диапазоны частями.")
    return list(range(start, end + 1))


def _write_csv(path, rows, columns):
    with path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=columns, delimiter=";", extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def _write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, default=str), encoding="utf-8")


def _validated_overrides(path):
    if not path:
        return {}
    data = json.loads(Path(path).read_text(encoding="utf-8-sig"))
    if not isinstance(data, dict):
        raise ValueError("Файл --main-overrides должен быть объектом дата -> числовой ID.")
    overrides = {}
    for ds, pk in data.items():
        try:
            dt = date.fromisoformat(ds)
        except (ValueError, TypeError) as e:
            raise ValueError(f"Некорректная дата в --main-overrides: {ds!r}") from e
        if type(pk) is not int or pk <= 0:
            raise ValueError(f"Для {ds} укажите положительный числовой ID главной памяти.")
        overrides[dt] = pk
    return overrides


def _fingerprint_2026():
    days = list(
        CalendarDay.objects.filter(date_gregorian__year=REFERENCE_YEAR)
        .order_by("date_gregorian")
        .values_list("pk", "date_gregorian", "main_feast_id")
    )
    ids = [d[0] for d in days]
    through = CalendarDay.feasts.through
    links = list(
        through.objects.filter(calendarday_id__in=ids)
        .order_by("calendarday_id", "calendarfeast_id")
        .values_list("calendarday_id", "calendarfeast_id")
    )
    fingerprint = hashlib.sha256(repr((days, links)).encode("utf-8")).hexdigest()
    return (fingerprint, len(days), len(links))


def _assert_reference(source):
    original = {}
    main = {}
    for memory in source:
        original.setdefault(memory.source_date, set()).add(memory.id)
        if memory.is_reference_main:
            if memory.source_date in main and main[memory.source_date] != memory.id:
                raise CommandError("В эталоне несколько главных памятей за один день.")
            main[memory.source_date] = memory.id
    schedule, special = build_schedule(source, REFERENCE_YEAR)
    if len(original) != 365 or len(schedule) != 365 or special:
        raise CommandError("Не удалось полностью классифицировать эталон 2026.")
    for d, rules in schedule.items():
        if set(r.feast_id for r in rules) != original.get(d, set()) or choose_main_v4(rules)[
            0
        ] != main.get(d):
            raise CommandError(f"Несовпадение с эталоном за {d}; запись запрещена.")
    return len(source)


def _make_backup(db, timestamp):
    folder = Path(settings.BASE_DIR) / "backups" / "sqlite"
    folder.mkdir(parents=True, exist_ok=True)
    backup = folder / f"before_calendar_years_v4_{timestamp}.sqlite3"
    if backup.exists():
        raise CommandError(f"Резервная копия уже существует: {backup}")
    try:
        with sqlite3.connect(str(db), timeout=45) as source, sqlite3.connect(str(backup)) as dest:
            source.backup(dest)
            integrity = dest.execute("PRAGMA integrity_check").fetchone()[0]
            foreign_keys = dest.execute("PRAGMA foreign_key_check").fetchall()
        if integrity != "ok" or foreign_keys:
            raise CommandError(f"BACKUP повреждён: integrity={integrity}, FK={len(foreign_keys)}")
    except Exception:
        backup.unlink(missing_ok=True)
        raise
    return backup


def _fast_defaults(fast, known_types):
    # Only baseline fasting status; dietary grades are NOT inferred.
    code = "no-fast" if fast.status in ("ordinary", "fast_free") else ""
    if fast.status == "cheese" and "cheese" in known_types:
        code = "cheese"
    title = (
        "Постный день"
        if fast.status == "fast"
        else (
            "Сырная седмица"
            if fast.status == "cheese"
            else "Поста нет" if code == "no-fast" else ""
        )
    )
    return dict(
        fast_type=known_types.get(code),
        fast_type_code=code,
        fast_type_title=title,
        fast_name=fast.period if fast.status in ("fast", "cheese") else "",
        fast_description="",
    )


def _new_readings(day_obj, reading_result):
    """Populate verified readings only on dates without existing reading rows."""
    if not reading_result.complete or day_obj.readings.exists():
        return 0
    seen = set()
    records = []
    for index, r in enumerate(reading_result.readings):
        k = (
            str(r["kind"]),
            str(r["title"]),
            str(r.get("label", "")),
            int(r.get("order", (index + 1) * 10)),
        )
        if k in seen:
            continue
        seen.add(k)
        reading_uid = uuid.uuid5(
            READING_NAMESPACE, "|".join((str(day_obj.date_gregorian), *map(str, k)))
        )
        records.append(
            CalendarReading(
                day=day_obj, sync_uid=reading_uid, kind=k[0], title=k[1], label=k[2], order=k[3]
            )
        )
    if records:
        CalendarReading.objects.bulk_create(records)
    updates = {}
    first_gospel = next((item.title for item in records if item.kind == "gospel"), "")
    first_apostle = next((item.title for item in records if item.kind == "apostle"), "")
    if not day_obj.gospel_title and first_gospel:
        updates["gospel_title"] = first_gospel
    if not day_obj.apostolic_title and first_apostle:
        updates["apostolic_title"] = first_apostle
    if updates:
        CalendarDay.objects.filter(pk=day_obj.pk).update(**updates)
    return len(records)


class Command(BaseCommand):
    help = (
        "Генерирует полные годы 2027+ на базе карточек 2026; "
        "сохраняет 2026, существующие чтения и ручные поля постов. "
        "Чтения и пищевой устав без проверенных таблиц остаются неполными."
    )

    def add_arguments(self, parser):
        years = parser.add_mutually_exclusive_group(required=True)
        years.add_argument("--year", type=int, help="Один целый год")
        years.add_argument("--start-year", type=int, help="Первый год диапазона")
        parser.add_argument("--end-year", type=int, help="Последний год диапазона (с --start-year)")
        mode = parser.add_mutually_exclusive_group(required=True)
        mode.add_argument("--dry-run", action="store_true")
        mode.add_argument("--apply", action="store_true")
        parser.add_argument(
            "--allow-incomplete",
            action="store_true",
            help="Разрешить сохранить черновые дни без полного лекционария и пищевых правил",
        )
        parser.add_argument(
            "--exclude-date",
            action="append",
            default=[],
            metavar="YYYY-MM-DD",
            help="Сохранить вручную исправленный день без перезаписи его связей",
        )
        parser.add_argument(
            "--main-overrides",
            default="",
            metavar="JSON",
            help="Проверенные ID главной памяти для дат с конфликтом (дата -> ID)",
        )
        parser.add_argument(
            "--reading-rules",
            default="",
            metavar="JSON",
            help="Файл дат с независимо проверенными чтениями; не обязателен",
        )

    def handle(self, *args, **opt):
        try:
            years = selected_years(year=opt["year"], start=opt["start_year"], end=opt["end_year"])
            overrides = _validated_overrides(opt["main_overrides"])
            excludes = {date.fromisoformat(d) for d in opt["exclude_date"]}
            reading_rules = load_reading_rules(opt["reading_rules"])
        except (ValueError, OSError, json.JSONDecodeError) as e:
            raise CommandError(str(e)) from e
        allowed = {d for year in years for d in year_days(year)}
        outside = (set(overrides) | excludes) - allowed
        if outside:
            raise CommandError(
                "Даты исключений вне диапазона: " + ", ".join(map(str, sorted(outside)))
            )
        if connections["default"].vendor != "sqlite":
            raise CommandError(
                "Запись и проверка допускаются только на локальной SQLite, не на Supabase."
            )
        db = Path(settings.DATABASES["default"]["NAME"]).resolve()
        if not db.is_file():
            raise CommandError(f"Файл локальной SQLite не найден: {db}")

        source = source_rules_2026()
        total_links = _assert_reference(source)
        baseline = _fingerprint_2026()
        if baseline[1] != 365:
            raise CommandError("Эталон 2026 содержит не 365 дней.")
        all_dates = sorted(allowed)
        current_days = {
            d.date_gregorian: d
            for d in (
                CalendarDay.objects.filter(
                    date_gregorian__gte=all_dates[0], date_gregorian__lte=all_dates[-1]
                )
                .select_related("main_feast")
                .prefetch_related("feasts", "readings")
            )
        }
        known_feast_ids = {m.id for m in source}
        if CalendarFeast.objects.filter(pk__in=known_feast_ids).count() != len(known_feast_ids):
            raise CommandError("Некоторые карточки 2026 отсутствуют; запись запрещена.")
        known_types = {ft.code: ft for ft in CalendarFastType.objects.all()}
        # Potential movable synaxises inferred from a single reference year
        # are an audit queue, not a basis for silent automatic relinking.
        rule_review = []
        for memory in source:
            title = memory.title.casefold().replace("ё", "е")
            delta = (memory.source_date - orthodox_pascha(REFERENCE_YEAR)).days
            resolved = classify_v4(memory)
            if (
                resolved.kind == "fixed"
                and 45 <= delta <= 125
                and ("собор" in title or "всех святых" in title)
            ):
                rule_review.append(
                    {
                        "feast_id": memory.id,
                        "source_date": str(memory.source_date),
                        "title": memory.title,
                        "current_rule": "fixed",
                        "reason": "Требуется проверить, не привязано ли празднование к седмице по Пятидесятнице",
                    }
                )
        all_rows = []
        conflict_rows = []
        by_year = {}
        plans = []
        problems = []
        for year in years:
            schedule, special = build_schedule(source, year)
            if special:
                problems.append(f"{year}: нерассчитанных специальных правил: {len(special)}")
            rows = []
            counts = Counter()
            no_readings = 0
            new_feast_links = 0
            for target in year_days(year):
                planned_rules = schedule[target]
                proposed_ids = {r.feast_id for r in planned_rules}
                candidate_main_ids = sorted(
                    {r.feast_id for r in planned_rules if r.is_reference_main}
                )
                guessed_main, tied_main_ids = choose_main_v4(planned_rules)
                if tied_main_ids and not candidate_main_ids:
                    candidate_main_ids = tied_main_ids
                override = overrides.get(target)
                if override is not None and override not in proposed_ids:
                    problems.append(
                        f"{target}: override главной памяти {override} не принадлежит дню"
                    )
                main_id = override if override in proposed_ids else guessed_main
                existing = current_days.get(target)
                existing_feasts = list(existing.feasts.all()) if existing else []
                old_ids = {f.pk for f in existing_feasts}
                old_main = existing.main_feast_id if existing else None
                fast = calculate_fasting(target)
                readings = resolve_readings(target, reading_rules)
                has_old_readings = bool(existing and list(existing.readings.all()))
                if not readings.complete and not has_old_readings:
                    no_readings += 1
                if target in excludes:
                    status = (
                        "EXCLUDED"
                        if existing and old_ids and old_main in old_ids
                        else "EXCLUDED_INVALID"
                    )
                elif not proposed_ids:
                    status = "NO_FEASTS"
                elif tied_main_ids and override is None:
                    status = "MAIN_CONFLICT"
                elif main_id is None or main_id not in proposed_ids:
                    status = "MAIN_UNVERIFIED"
                elif existing is None:
                    status = "CREATE"
                elif old_ids == proposed_ids and old_main == main_id:
                    status = "UNCHANGED"
                else:
                    status = "RELINK"
                counts[status] += 1
                if status == "MAIN_CONFLICT":
                    conflict_rows.append(
                        {
                            "date": str(target),
                            "candidate_ids": ",".join(map(str, candidate_main_ids)),
                            "candidates": " | ".join(
                                f"[{r.feast_id}] {r.title}"
                                for r in planned_rules
                                if r.feast_id in candidate_main_ids
                            ),
                            "proposed_unverified_id": guessed_main or "",
                        }
                    )
                if status in ("NO_FEASTS", "MAIN_CONFLICT", "MAIN_UNVERIFIED", "EXCLUDED_INVALID"):
                    problems.append(
                        f"{target}: {status}; предложено {len(proposed_ids)} памятей; главные: {candidate_main_ids}"
                    )
                if status in ("CREATE", "RELINK", "UNCHANGED"):
                    new_feast_links += len(proposed_ids)
                row = {
                    "date": str(target),
                    "status": status,
                    "old_feasts": len(old_ids),
                    "new_feasts": len(proposed_ids),
                    "main_id": main_id or "",
                    "candidate_main_ids": ",".join(map(str, candidate_main_ids)),
                    "existing_main_id": old_main or "",
                    "old_only_ids": ",".join(map(str, sorted(old_ids - proposed_ids))),
                    "new_only_ids": ",".join(map(str, sorted(proposed_ids - old_ids))),
                    "new_titles": " | ".join(
                        sorted(f"[{r.feast_id}] {r.title}" for r in planned_rules)
                    ),
                    "fast_status": fast.status,
                    "fast_period": fast.period,
                    "fast_diet_verified": False,
                    "existing_readings": int(has_old_readings),
                    "verified_new_readings": int(readings.complete),
                    "excluded": target in excludes,
                }
                rows.append(row)
                all_rows.append(row)
                if status in ("CREATE", "RELINK", "UNCHANGED"):
                    plans.append((target, status, proposed_ids, main_id, fast, readings, existing))
            by_year[str(year)] = {
                "pascha": str(orthodox_pascha(year)),
                "days": len(rows),
                "status": dict(counts),
                "days_without_any_readings": no_readings,
                "proposed_feast_links": new_feast_links,
                "unclassified_memorials": len(special),
            }

        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
        folder = (
            Path(settings.BASE_DIR)
            / "reports"
            / f"calendar_years_v4_{years[0]}_{years[-1]}_{timestamp}"
        )
        folder.mkdir(parents=True, exist_ok=False)
        _write_csv(folder / "days.csv", all_rows, list(all_rows[0]))
        all_problem_rows = [{"problem": p} for p in problems]
        _write_csv(folder / "problems.csv", all_problem_rows, ["problem"])
        _write_csv(
            folder / "main_conflicts.csv",
            conflict_rows,
            ["date", "candidate_ids", "candidates", "proposed_unverified_id"],
        )
        _write_csv(
            folder / "rule_review.csv",
            rule_review,
            ["feast_id", "source_date", "title", "current_rule", "reason"],
        )
        summary = {
            "years": years,
            "mode": "APPLY" if opt["apply"] else "DRY-RUN",
            "reference_2026_days": baseline[1],
            "reference_2026_links": baseline[2],
            "reference_checksum_before": baseline[0],
            "reference_checksum_after": None,
            "source_rule_links": total_links,
            "year_summaries": by_year,
            "blockers": problems,
            "suspected_other_movable_rules_for_review": len(rule_review),
            "ready_for_full_release": False,
            "verified_reading_table_provided": bool(reading_rules),
            "dietary_rules_complete": False,
            "backup": None,
            "applied": {},
            "reminder": "Памяти/главные по выводам 2026 и адресным подтверждённым правилам, не нормативная таблица всех исключений. Чтения/пищевой устав требуют отдельного движка и проверки.",
        }
        _write_json(folder / "summary.json", summary)
        self.stdout.write(f"ЭТАЛОН: 2026 без изменений, дней {baseline[1]}, связей {baseline[2]}.")
        for year in years:
            record = by_year[str(year)]
            self.stdout.write(
                f'{year}: Пасха {record["pascha"]}, дней {record["days"]}, '
                f'статусы {record["status"]}, без чтений {record["days_without_any_readings"]}.'
            )
        self.stdout.write(
            f"Блокирующих проблем: {len(problems)}; памятей для доп. сверки правил: {len(rule_review)}; отчёт {folder}"
        )
        if not opt["apply"]:
            self.stdout.write("DRY-RUN: SQLite не изменена.")
            return
        if problems:
            raise CommandError(
                "Есть блокирующие проблемы — запись всего диапазона запрещена. Откройте problems.csv."
            )
        if not opt["allow_incomplete"]:
            raise CommandError(
                "Чтения/пищевой устав не завершены. Для чернового локального года требуется --allow-incomplete."
            )
        if not plans:
            self.stdout.write("Записывать нечего.")
            return
        backup = _make_backup(db, timestamp)
        summary["backup"] = str(backup)
        _write_json(folder / "summary.json", summary)
        self.stdout.write(f"BACKUP: {backup}")
        applied = Counter()
        try:
            with transaction.atomic():
                if _fingerprint_2026() != baseline:
                    raise CommandError(
                        "Эталон 2026 изменился после подготовки; транзакция отменена."
                    )
                for target, status, ids, main_id, fast, readings, old in plans:
                    if status == "CREATE":
                        jmonth, jday = julian_month_day(target)
                        defaults = _fast_defaults(fast, known_types)
                        obj = CalendarDay.objects.create(
                            date_gregorian=target,
                            julian_month=jmonth,
                            julian_day=jday,
                            main_feast_id=main_id,
                            source_payload={
                                "calendar_engine_v4": {
                                    "source_reference_year": REFERENCE_YEAR,
                                    "stage": "draft",
                                    "fast_status": fast.status,
                                    "fast_reason": fast.basis,
                                    "food_grade_verified": False,
                                    "readings_verified": readings.complete,
                                },
                            },
                            **defaults,
                        )
                        obj.feasts.set(sorted(ids))
                        obj.refresh_from_db()
                        if readings.complete:
                            applied["reading_rows"] += _new_readings(obj, readings)
                        applied["created_days"] += 1
                    else:
                        obj = CalendarDay.objects.select_for_update().get(pk=old.pk)
                        if (
                            obj.date_gregorian != target
                            or obj.date_gregorian.year <= REFERENCE_YEAR
                        ):
                            raise CommandError(f"Неверный день базы: {target}; отмена транзакции.")
                        if status == "RELINK":
                            obj.feasts.set(sorted(ids))
                            CalendarDay.objects.filter(pk=obj.pk).update(main_feast_id=main_id)
                            applied["relinked_days"] += 1
                        else:
                            applied["unchanged_days"] += 1
                        # Existing fasting values, old readings and edited summary are preserved.
                        if readings.complete:
                            applied["reading_rows"] += _new_readings(obj, readings)
                    actual_ids = set(obj.feasts.values_list("pk", flat=True))
                    actual_main = CalendarDay.objects.values_list("main_feast_id", flat=True).get(
                        pk=obj.pk
                    )
                    if actual_ids != ids or actual_main != main_id:
                        raise CommandError(f"Ошибка проверки связей за {target}; откат.")
                if _fingerprint_2026() != baseline:
                    raise CommandError("После генерации обнаружены изменения 2026 года; откат.")
                # Verify every non-excluded day of every selected year exists and has a main feast.
                for year in years:
                    actual = CalendarDay.objects.filter(date_gregorian__year=year)
                    if actual.count() != (
                        366 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 365
                    ):
                        raise CommandError(
                            f"После записи {year} неполный: количество дней неверно; откат."
                        )
                summary["reference_checksum_after"] = baseline[0]
                summary["applied"] = dict(applied)
                summary["result"] = "OK_DRAFT"
        except Exception:
            summary["result"] = "FAILED_ROLLED_BACK"
            _write_json(folder / "summary.json", summary)
            raise
        _write_json(folder / "summary.json", summary)
        self.stdout.write(
            self.style.SUCCESS(
                f'ГОТОВО: {years[0]}–{years[-1]}, создано {applied["created_days"]}, '
                f'перепривязано {applied["relinked_days"]}, исходный 2026 не изменён.'
            )
        )
        self.stdout.write(
            self.style.WARNING(
                "НОВОЕ ПОКОЛЕНИЕ ПОКА ЧЕРНОВОЕ: не переносить в Supabase до проверки уставных чтений, "
                "пищевых разрешений, особых переносов памятей."
            )
        )
