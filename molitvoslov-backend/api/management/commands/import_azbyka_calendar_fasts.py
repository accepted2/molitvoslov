"""Import yearly Azbyka calendar flags and safe fasting labels into local Django CalendarDay.

Usage:
    python manage.py import_azbyka_calendar_fasts --year 2026 --dry-run
    python manage.py import_azbyka_calendar_fasts --year 2026 --apply

Does not infer dietary strictness; retains existing fasting type/code and meal guidance.
"""

from __future__ import annotations

from collections import Counter
from datetime import date, timedelta
from pathlib import Path
import json
import sqlite3
import time

import requests
from bs4 import BeautifulSoup
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connections, transaction

from api.calendar_models import CalendarDay

AZBYKA_URL = "https://azbyka.ru/days/calendar/{year}"
ALLOWED_CLASSES = {"post", "solid", "great12", "easter", "memorial", "calendar-parent"}


def orthodox_easter(year: int) -> date:
    # Julian Paschalion, converted to the civil Gregorian calendar (1900-2099).
    if not 1900 <= year <= 2099:
        raise ValueError("Правило Пасхалии в этой версии поддерживает только 1900–2099 годы")
    a, b, c = year % 4, year % 7, year % 19
    d = (19 * c + 15) % 30
    e = (2 * a + 4 * b - d + 34) % 7
    julian_month = (d + e + 114) // 31
    julian_day = (d + e + 114) % 31 + 1
    return date(year, julian_month, julian_day) + timedelta(days=13)


def fast_period_name(target_date: date) -> str:
    """Identify four major fasts by date; Azbyka's `post` remains authority for fasting status."""
    year = target_date.year
    easter = orthodox_easter(year)
    if easter - timedelta(days=48) <= target_date < easter:
        return "Великий пост"
    if easter + timedelta(days=57) <= target_date <= date(year, 7, 11):
        return "Петров пост"
    if date(year, 8, 14) <= target_date <= date(year, 8, 27):
        return "Успенский пост"
    if target_date >= date(year, 11, 28) or target_date <= date(year, 1, 6):
        return "Рождественский пост"
    return ""


def fetch_calendar(year: int, timeout: float) -> dict[str, dict]:
    url = AZBYKA_URL.format(year=year)
    response = requests.get(
        url, timeout=timeout, headers={"User-Agent": "Molitvoslov-calendar-import/1.0"}
    )
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "lxml")
    data = {}
    for item in soup.select("a.pika-day[data-date]"):
        raw_date = item.get("data-date", "")
        if not raw_date.startswith(f"{year}-"):
            continue
        try:
            target = date.fromisoformat(raw_date)
        except ValueError:
            continue
        if target.year != year:
            continue
        classes = set(item.get("class", []))
        markers = sorted(classes & ALLOWED_CLASSES)
        # A date appears in adjacent month grids too. Prefer its own month;
        # the out-of-month placeholder may omit styling classes entirely.
        outside = "is-outside-current-month" in classes
        previous = data.get(raw_date)
        if previous is not None:
            if previous["outside"] and not outside:
                pass  # Replace the placeholder with the canonical month cell.
            elif not previous["outside"] and outside:
                continue
            elif previous["classes"] != markers:
                raise CommandError(
                    f"Противоречивые признаки основной ячейки {raw_date}: "
                    f"{previous['classes']} / {markers}"
                )
            else:
                continue
        data[raw_date] = {
            "classes": markers,
            "title": item.get("title", "").strip(),
            "outside": outside,
        }
    expected = 366 if (year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)) else 365
    if len(data) != expected:
        raise CommandError(
            f"Azbyka вернула {len(data)} уникальных дат вместо {expected}; запись запрещена"
        )
    if sum("easter" in item["classes"] for item in data.values()) != 1:
        raise CommandError("Azbyka не отметила ровно один день Пасхи; запись запрещена")
    return data


def local_sqlite_backup() -> Path:
    connection = connections["default"]
    if connection.vendor != "sqlite":
        raise CommandError("Автоматический backup реализован только для локальной SQLite")
    db_path = Path(connection.settings_dict["NAME"])
    if not db_path.is_file():
        raise CommandError(f"Не найдена SQLite: {db_path}")
    destination = Path(settings.BASE_DIR) / "backups" / "sqlite"
    destination.mkdir(parents=True, exist_ok=True)
    backup_path = destination / f"db_fasts_{time.strftime('%Y-%m-%d_%H-%M-%S')}.sqlite3"
    with sqlite3.connect(str(db_path)) as src, sqlite3.connect(str(backup_path)) as dst:
        src.backup(dst)
    return backup_path


class Command(BaseCommand):
    help = "Импорт календарных признаков постов/седмиц Azbyka за год без изменения памятей и чтений"

    def add_arguments(self, parser):
        parser.add_argument("--year", type=int, required=True)
        mode = parser.add_mutually_exclusive_group(required=True)
        mode.add_argument("--dry-run", action="store_true")
        mode.add_argument("--apply", action="store_true")
        parser.add_argument("--timeout", type=float, default=30.0)

    def handle(self, *args, **options):
        year = options["year"]
        apply = options["apply"]
        try:
            _ = orthodox_easter(year)
            days = fetch_calendar(year, max(1.0, options["timeout"]))
        except (ValueError, requests.RequestException) as exc:
            raise CommandError(f"Не удалось получить календарь: {exc}") from exc
        marker_counts = Counter(marker for item in days.values() for marker in item["classes"])
        self.stdout.write(
            f"AZBYKA {year}: дней={len(days)}, режим={'APPLY' if apply else 'DRY-RUN'}"
        )
        self.stdout.write(
            "Классы: " + ", ".join(f"{k}={v}" for k, v in sorted(marker_counts.items()))
        )
        if year == 2026:
            self.stdout.write(
                "Контроль: 2026-11-04 post=" + str("post" in days["2026-11-04"]["classes"])
            )

        current_days = {
            d.date_gregorian.isoformat(): d
            for d in CalendarDay.objects.filter(date_gregorian__year=year)
        }
        creates = updates = unchanged = conflicts = cleared = reset_no_fast = 0
        prepared = []
        for day_string, info in sorted(days.items()):
            dt = date.fromisoformat(day_string)
            markers = info["classes"]
            is_post = "post" in markers
            derived_name = fast_period_name(dt) if is_post else ""
            existing = current_days.get(day_string)
            payload = (
                dict(existing.source_payload)
                if existing and isinstance(existing.source_payload, dict)
                else {}
            )
            previous = payload.get("azbyka_calendar_markers")
            record = {
                "source": AZBYKA_URL.format(year=year),
                "classes": markers,
                "is_fasting_day": is_post,
                "is_solid_week": "solid" in markers,
                "is_major_feast": "great12" in markers,
                "is_easter": "easter" in markers,
                "is_memorial_day": "memorial" in markers,
                "memorial_title": (
                    info["title"].splitlines()[-1].split(". ")[-1].strip()
                    if "memorial" in markers
                    else ""
                ),
                "fast_period_name": derived_name,
            }
            payload["azbyka_calendar_markers"] = record
            old_name = (existing.fast_name or "").strip() if existing else ""
            # The source's post marker is authoritative for the fasting/non-fasting status.
            # Preserve diet prescriptions when status matches; clear known contradictory data.
            name_to_set = derived_name if derived_name and not old_name else None
            equivalent_names = {"Петров пост", "Апостольский пост"}
            if (
                derived_name
                and old_name
                and old_name != derived_name
                and {old_name, derived_name} != equivalent_names
            ):
                conflicts += 1
                if conflicts <= 12:
                    self.stdout.write(
                        self.style.WARNING(
                            f"  Проверить название {day_string}: {old_name!r} / {derived_name!r}; сохраняем прежнее"
                        )
                    )
            changes = {"source_payload": payload}
            if name_to_set:
                changes["fast_name"] = name_to_set
            if old_name and not is_post:
                # E.g. 1-7 June 2026: obsolete 'Apostolic fast' and food prescriptions.
                # A day may be nonfasting as part of a solid week, not just ordinary Tuesday.
                changes.update(
                    fast_name="",
                    fast_type=None,
                    fast_type_code="",
                    fast_type_title="",
                    fast_description="",
                )
                cleared += 1
            elif (
                is_post
                and existing
                and (
                    existing.fast_type_code == "no-fast"
                    or (existing.fast_type and existing.fast_type.code == "no-fast")
                )
            ):
                # The legacy database says "no fast" on a date explicitly marked fasting.
                changes.update(
                    fast_type=None,
                    fast_type_code="",
                    fast_type_title="Постный день",
                    fast_description="",
                )
                reset_no_fast += 1
            elif is_post and (
                not existing
                or not existing.fast_type_title
                and not existing.fast_type_code
                and not existing.fast_type_id
            ):
                changes["fast_type_title"] = "Постный день"
            changed = (
                not existing
                or previous != record
                or any(
                    getattr(existing, key) != val
                    for key, val in changes.items()
                    if key != "source_payload"
                )
            )
            if not existing:
                creates += 1
            elif changed:
                updates += 1
            else:
                unchanged += 1
            prepared.append((dt, existing, changes, changed))
        self.stdout.write(
            f"Итог: CREATE {creates}; UPDATE {updates}; без изменений {unchanged}; предупреждений {conflicts}"
        )
        self.stdout.write(
            f"Очистить устаревшие значения поста: {cleared}; исправить ложное no-fast: {reset_no_fast}"
        )
        self.stdout.write(
            "Сохраняем правила трапезы, кроме явно противоречащих постному статусу Azbyka. Памяти/чтения/иконы не затрагиваем."
        )
        if not apply:
            self.stdout.write(
                "DRY-RUN: база не изменена. Для записи используйте --apply после проверки."
            )
            return
        if connections["default"].vendor != "sqlite":
            raise CommandError("--apply разрешён только для локальной SQLite")
        backup = local_sqlite_backup()
        self.stdout.write(f"BACKUP: {backup}")
        with transaction.atomic():
            for dt, existing, changes, changed in prepared:
                if not changed:
                    continue
                if existing:
                    CalendarDay.objects.filter(pk=existing.pk).update(**changes)
                else:
                    # No guessing of dietary strictness for newly generated dates.
                    CalendarDay.objects.create(
                        date_gregorian=dt,
                        **changes,
                    )
        self.stdout.write(self.style.SUCCESS(f"APPLY завершён: дней {len(days)}; backup {backup}"))
