import argparse
import time
import uuid
from datetime import date, timedelta
from pathlib import Path

import requests
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connections, transaction

from api.azbyka_calendar_readings import (
    AzbykaReadingsError,
    fetch_day_readings,
)
from api.calendar_models import CalendarDay, CalendarReading
from api.sqlite_backup import create_sqlite_backup


AZBYKA_READING_NAMESPACE = uuid.UUID(
    "91d7606f-7ea4-4d92-a691-4f88d0d73cd0"
)


def reading_identity(reading):
    return (
        str(reading.kind or ""),
        int(reading.order or 0),
        str(reading.label or ""),
        str(reading.title or ""),
    )


def deterministic_azbyka_reading_uid(target_date, reading):
    """
    Стабильный UUID одного чтения Azbyka.

    Для совершенно нового чтения UUID зависит только от даты и содержимого.
    Уже существующий UUID при повторном импорте сохраняется отдельно ниже.
    """
    kind, order, label, title = reading_identity(reading)
    identity = "|".join(
        [
            target_date.isoformat(),
            kind,
            str(order),
            label,
            title,
        ]
    )
    return uuid.uuid5(AZBYKA_READING_NAMESPACE, identity)


def parse_iso_date(value, option_name):
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError) as error:
        raise CommandError(
            f"{option_name}: используйте дату в формате YYYY-MM-DD."
        ) from error


def iter_dates(start, end):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


class Command(BaseCommand):
    help = (
        "Импортировать Евангельские и Апостольские чтения "
        "с календаря azbyka.ru в локальную SQLite."
    )

    def add_arguments(self, parser):
        selection = parser.add_mutually_exclusive_group(required=True)
        selection.add_argument(
            "--date",
            action="append",
            dest="dates",
            metavar="YYYY-MM-DD",
            help="Конкретная дата. Можно указать несколько раз.",
        )
        selection.add_argument(
            "--range",
            nargs=2,
            metavar=("START", "END"),
            help="Диапазон дат включительно.",
        )
        selection.add_argument(
            "--year",
            type=int,
            help="Весь календарный год.",
        )

        mode = parser.add_mutually_exclusive_group(required=True)
        mode.add_argument("--dry-run", action="store_true")
        mode.add_argument("--apply", action="store_true")

        parser.add_argument(
            "--overwrite",
            action="store_true",
            help=(
                "Разрешить заменить уже существующие CalendarReading. "
                "Без флага заполненные вручную дни пропускаются."
            ),
        )
        parser.add_argument(
            "--delay",
            type=float,
            default=0.35,
            help="Пауза между запросами к azbyka.ru, сек. По умолчанию 0.35.",
        )
        parser.add_argument(
            "--timeout",
            type=float,
            default=20,
            help="HTTP timeout одного запроса, сек. По умолчанию 20.",
        )
        parser.add_argument(
            "--backup-dir",
            default="",
            help=(
                "Каталог автоматического backup перед первым --apply. "
                "По умолчанию <backend>/backups/sqlite."
            ),
        )
        parser.add_argument(
            "--fail-on-error",
            action="store_true",
            help=argparse.SUPPRESS,
        )

    def handle(self, *args, **options):
        self._assert_local_sqlite()

        dates = self._selected_dates(options)
        if not dates:
            raise CommandError("Не выбраны даты.")

        delay = max(0.0, options["delay"])
        timeout = max(1.0, options["timeout"])
        overwrite = options["overwrite"]
        apply_changes = options["apply"]

        self.stdout.write(
            f"Дат: {len(dates)}. "
            f"Режим: {'APPLY' if apply_changes else 'DRY-RUN'}. "
            f"Overwrite: {'да' if overwrite else 'нет'}."
        )

        session = requests.Session()
        backup_done = False
        created = 0
        replaced = 0
        skipped_existing = 0
        skipped_missing_day = 0
        failed = 0

        try:
            for index, target_date in enumerate(dates, start=1):
                day = (
                    CalendarDay.objects
                    .prefetch_related("readings")
                    .filter(date_gregorian=target_date)
                    .first()
                )

                if day is None:
                    skipped_missing_day += 1
                    self.stdout.write(
                        self.style.WARNING(
                            f"[{index}/{len(dates)}] {target_date}: "
                            "SKIP — CalendarDay отсутствует локально."
                        )
                    )
                    continue

                try:
                    parsed = fetch_day_readings(
                        target_date,
                        session=session,
                        timeout=timeout,
                    )
                except AzbykaReadingsError as error:
                    failed += 1
                    self.stdout.write(
                        self.style.ERROR(
                            f"[{index}/{len(dates)}] {target_date}: ERROR — {error}"
                        )
                    )
                    continue

                existing_readings = list(day.readings.all())
                existing_count = len(existing_readings)
                existing_sync_uids = {
                    reading_identity(reading): reading.sync_uid
                    for reading in existing_readings
                    if reading.sync_uid
                }

                if existing_count and not overwrite:
                    skipped_existing += 1
                    self.stdout.write(
                        self.style.WARNING(
                            f"[{index}/{len(dates)}] {target_date}: "
                            f"SKIP — уже есть чтения: {existing_count}; "
                            f"Azbyka нашла: {len(parsed.readings)}."
                        )
                    )
                    continue

                action = "REPLACE" if existing_count else "CREATE"
                self.stdout.write(
                    f"[{index}/{len(dates)}] {target_date}: "
                    f"{action} {len(parsed.readings)}"
                )
                self.stdout.write(f"  Источник: {parsed.url}")

                for reading in parsed.readings:
                    label = f" [{reading.label}]" if reading.label else ""
                    self.stdout.write(
                        f"  - {reading.kind}{label}: "
                        f"{reading.title} (order={reading.order})"
                    )

                if not apply_changes:
                    continue

                if not backup_done:
                    destination, digest = self._backup(options["backup_dir"])
                    backup_done = True
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"BACKUP перед изменениями: {destination}"
                        )
                    )
                    self.stdout.write(f"SHA256: {digest}")

                with transaction.atomic():
                    if existing_count:
                        day.readings.all().delete()

                    CalendarReading.objects.bulk_create(
                        [
                            CalendarReading(
                                sync_uid=(
                                    existing_sync_uids.get(reading_identity(reading))
                                    or deterministic_azbyka_reading_uid(
                                        target_date,
                                        reading,
                                    )
                                ),
                                day=day,
                                kind=reading.kind,
                                label=reading.label,
                                title=reading.title,
                                order=reading.order,
                            )
                            for reading in parsed.readings
                        ]
                    )

                    self._sync_legacy_fields(day, parsed.readings)

                if existing_count:
                    replaced += 1
                else:
                    created += 1

                if delay and index < len(dates):
                    time.sleep(delay)
        finally:
            session.close()

        self.stdout.write("")
        self.stdout.write("Итог:")
        self.stdout.write(f"  Новых дней с чтениями: {created}")
        self.stdout.write(f"  Заменено дней: {replaced}")
        self.stdout.write(f"  Пропущено заполненных: {skipped_existing}")
        self.stdout.write(f"  Нет CalendarDay: {skipped_missing_day}")
        self.stdout.write(f"  Ошибок парсинга/сети: {failed}")

        if not apply_changes:
            self.stdout.write(
                self.style.WARNING("DRY-RUN: локальная база не изменена.")
            )

        if options["fail_on_error"] and (failed or skipped_missing_day):
            raise CommandError(
                "Импорт чтений завершён не полностью: "
                f"ошибок {failed}, отсутствующих CalendarDay "
                f"{skipped_missing_day}."
            )

    def _assert_local_sqlite(self):
        engine = connections["default"].settings_dict.get("ENGINE", "")
        if engine != "django.db.backends.sqlite3":
            raise CommandError(
                "Источник должен быть локальной SQLite. "
                "Уберите SUPABASE_DB_PASSWORD."
            )

    def _selected_dates(self, options):
        if options.get("dates"):
            return sorted(
                {
                    parse_iso_date(value, "--date")
                    for value in options["dates"]
                }
            )

        if options.get("range"):
            start = parse_iso_date(options["range"][0], "--range START")
            end = parse_iso_date(options["range"][1], "--range END")
            if end < start:
                raise CommandError("END не может быть раньше START.")
            return list(iter_dates(start, end))

        year = options.get("year")
        if year:
            if year < 1900 or year > 2200:
                raise CommandError("Некорректный год.")
            return list(iter_dates(date(year, 1, 1), date(year, 12, 31)))

        return []

    def _backup(self, output_dir):
        database_path = Path(settings.DATABASES["default"]["NAME"])
        destination_dir = (
            Path(output_dir).expanduser()
            if output_dir
            else Path(settings.BASE_DIR) / "backups" / "sqlite"
        )
        return create_sqlite_backup(database_path, destination_dir)

    def _sync_legacy_fields(self, day, readings):
        gospel = next(
            (reading for reading in readings if reading.kind == "gospel"),
            None,
        )
        apostle = next(
            (reading for reading in readings if reading.kind == "apostle"),
            None,
        )

        gospel_title = gospel.title if gospel else ""
        apostolic_title = apostle.title if apostle else ""

        CalendarDay.objects.filter(pk=day.pk).update(
            gospel_title=gospel_title,
            gospel_title_uk=gospel_title,
            apostolic_title=apostolic_title,
            apostolic_title_uk=apostolic_title,
        )
