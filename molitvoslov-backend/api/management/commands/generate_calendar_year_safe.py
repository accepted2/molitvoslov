"""Create calendar year from existing canonical feast cards, preserving existing day edits."""

from __future__ import annotations
import json
import sqlite3
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import connections, transaction
from api.calendar_models import CalendarDay, CalendarFeast
from api.management.commands.import_azbyka_calendar_fasts import orthodox_easter


def target_julian_day(year, month, day):
    # Julian month/day converted to Gregorian; applicable 1900-2099.
    # 29 February Julian does not exist in all target years.
    try:
        return date(year, month, day) + timedelta(days=13)
    except ValueError:
        return None


def days_of(year):
    d, stop = date(year, 1, 1), date(year + 1, 1, 1)
    while d < stop:
        yield d
        d += timedelta(days=1)


def observed_date(feast, target_year, pascha):
    if feast.easter_offset is not None:
        return pascha + timedelta(days=feast.easter_offset), "pascha"
    if feast.julian_month and feast.julian_day:
        y = target_year - 1 if feast.julian_month == 12 and feast.julian_day >= 19 else target_year
        calculated = target_julian_day(y, feast.julian_month, feast.julian_day)
        if calculated and calculated.year == target_year:
            return calculated, "julian"
        return None, "out-of-year"
    return None, "unclassified"


def backup_sqlite():
    conn = connections["default"]
    if conn.vendor != "sqlite":
        raise CommandError("Запись разрешена только в локальную SQLite")
    src = Path(conn.settings_dict["NAME"])
    if not src.is_file():
        raise CommandError(f"Не найдена база {src}")
    folder = Path(settings.BASE_DIR) / "backups" / "sqlite"
    folder.mkdir(parents=True, exist_ok=True)
    stamp = __import__("datetime").datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    dst = folder / f"calendar_before_generation_{stamp}.sqlite3"
    with sqlite3.connect(str(src)) as source, sqlite3.connect(str(dst)) as target:
        source.backup(target)
    return dst


class Command(BaseCommand):
    help = "Безопасная генерация года из существующих CalendarFeast; посты и чтения импортируются отдельно."

    def add_arguments(self, parser):
        parser.add_argument("--year", type=int, default=2027)
        parser.add_argument("--source-year", type=int, default=2026)
        mode = parser.add_mutually_exclusive_group(required=True)
        mode.add_argument("--dry-run", action="store_true")
        mode.add_argument("--apply", action="store_true")
        parser.add_argument(
            "--with-readings",
            action="store_true",
            help="Импортировать чтения Azbyka после генерации",
        )
        parser.add_argument(
            "--with-fasts",
            action="store_true",
            help="Импортировать признаки постов Azbyka после генерации",
        )
        parser.add_argument("--report", default="calendar_year_audit.json")

    def handle(self, *args, **opts):
        year, source_year = opts["year"], opts["source_year"]
        if not (1901 <= year <= 2098) or not (1901 <= source_year <= 2098) or year == source_year:
            raise CommandError("Год вне диапазона 1901–2098 или совпадает с исходным")
        if opts["apply"] and connections["default"].vendor != "sqlite":
            raise CommandError("Запрещено изменение удалённой БД")
        existing = {
            d.date_gregorian: d
            for d in CalendarDay.objects.filter(date_gregorian__year=year).prefetch_related(
                "feasts"
            )
        }
        source_days = list(
            CalendarDay.objects.filter(date_gregorian__year=source_year)
            .select_related("main_feast")
            .prefetch_related("feasts")
        )
        if len(source_days) not in (365, 366):
            raise CommandError(f"Исходный год неполный: {len(source_days)} дней")
        # Source links provide a reference main feast and detect cards without date rules.
        ref_main = Counter()
        ref_link_ids = set()
        for d in source_days:
            if d.main_feast_id:
                ref_main[d.main_feast_id] += 1
            ref_link_ids.update(f.pk for f in d.feasts.all())
        ref_link_ids.update(ref_main.keys())
        feasts = list(CalendarFeast.objects.filter(pk__in=ref_link_ids))
        pascha = orthodox_easter(year)
        indexed = defaultdict(list)
        unknown = []
        out_of_year = []
        for feast in feasts:
            when, reason = observed_date(feast, year, pascha)
            if when and when.year == year:
                indexed[when].append(feast)
            elif reason == "unclassified":
                unknown.append({"id": feast.pk, "title": feast.title})
            else:
                out_of_year.append({"id": feast.pk, "reason": reason})
        # Existing main assignments are authoritative unless no longer part of the feast list.
        # Never pretend ambiguous feast ranking is a canonical liturgical precedence.
        counts = Counter()
        proposals = []
        ambiguous = []
        for current in days_of(year):
            cards = sorted(indexed[current], key=lambda f: f.pk)
            ids = [f.pk for f in cards]
            old = existing.get(current)
            if old and old.feasts.exists():
                counts["PRESERVED_MANUAL_OR_EXISTING"] += 1
                continue
            # Prioritize Pascha itself and comparable explicitly Great feast types.
            major = [
                f
                for f in cards
                if (f.celebration_type or "").lower() in ("great", "great_feast", "pascha")
            ]
            if current == pascha:
                paschal = [
                    f
                    for f in cards
                    if "пасх" in (f.title or "").lower()
                    and "предпасх" not in (f.title or "").lower()
                ]
                preferred = paschal[0] if len(paschal) == 1 else None
            elif len(major) == 1:
                preferred = major[0]
            else:
                preferred = None
            if preferred is None:
                remembered = [f for f in cards if ref_main[f.pk] > 0]
                remembered.sort(key=lambda f: (-ref_main[f.pk], f.pk))
                preferred = remembered[0] if remembered else (cards[0] if cards else None)
                if len(cards) > 1:
                    ambiguous.append(current.isoformat())
            counts["CREATE" if old is None else "FILL_EMPTY"] += 1
            proposals.append((current, ids, preferred.pk if preferred else None))
        report = {
            "source_year": source_year,
            "target_year": year,
            "pascha": pascha.isoformat(),
            "mode": "APPLY" if opts["apply"] else "DRY-RUN",
            "source_days": len(source_days),
            "source_cards": len(feasts),
            "planned": dict(counts),
            "days_without_feasts": [d.isoformat() for d in days_of(year) if not indexed[d]],
            "unclassified_cards": unknown,
            "out_of_year_cards": out_of_year,
            "ambiguous_main_days": ambiguous,
            "notes": [
                "Unclassified cards are NOT assigned arbitrarily.",
                "Existing days with linked feasts are preserved, including their main feast.",
                "Automatic main selection is a visual default, not a Typikon precedence determination.",
                "Yearly readings require the independent Azbyka importer.",
                "Azbyka fasting markers do not define dietary strictness.",
            ],
        }
        path = Path(opts["report"]).resolve()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        self.stdout.write(
            f"Отчёт: {path}; Пасха: {pascha}; план: {dict(counts)}; без правил: {len(unknown)}"
        )
        if not opts["apply"]:
            self.stdout.write("DRY-RUN: изменений базы нет; импорт постов и чтений не выполняется.")
            return
        self.stdout.write(f"BACKUP: {backup_sqlite()}")
        with transaction.atomic():
            for current, ids, main_id in proposals:
                d, created = CalendarDay.objects.get_or_create(date_gregorian=current)
                if not created and d.feasts.exists():
                    continue
                # Julian civil date in 1900-2099 is 13 days behind Gregorian.
                jul = current - timedelta(days=13)
                d.julian_month, d.julian_day = jul.month, jul.day
                if d.main_feast_id is None:
                    d.main_feast_id = main_id
                payload = dict(d.source_payload) if isinstance(d.source_payload, dict) else {}
                payload.setdefault(
                    "calendar_year_generator", {"source_year": source_year, "version": 1}
                )
                d.source_payload = payload
                d.save()
                d.feasts.set(ids)
        if opts["with_fasts"]:
            self.stdout.write("POSTS: запуск существующего импортёра признаков поста")
            call_command(
                "import_azbyka_calendar_fasts", "--year", str(year), "--apply", stdout=self.stdout
            )
        if opts["with_readings"]:
            self.stdout.write("READINGS: запуск существующего импортёра чтений (без overwrite)")
            call_command(
                "import_azbyka_calendar_readings",
                "--year",
                str(year),
                "--apply",
                stdout=self.stdout,
            )
        self.stdout.write(
            self.style.SUCCESS(
                "Генерация завершена. Проверяйте отчёт; неполные правила требуют уточнения."
            )
        )
