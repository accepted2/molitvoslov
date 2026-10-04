from datetime import date, timedelta

from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction


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
        "Единый импорт дня с azbyka.ru: чтения + полный набор памятей "
        "с тропарями, кондаками и житиями. Работает с локальной SQLite."
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

        mode = parser.add_mutually_exclusive_group(required=True)
        mode.add_argument("--dry-run", action="store_true")
        mode.add_argument("--apply", action="store_true")

        parser.add_argument(
            "--timeout",
            type=float,
            default=20,
            help="HTTP timeout, сек. По умолчанию 20.",
        )
        parser.add_argument(
            "--delay",
            type=float,
            default=0.35,
            help="Пауза между запросами/страницами, сек. По умолчанию 0.35.",
        )
        parser.add_argument(
            "--backup-dir",
            default="",
            help=(
                "Каталог автоматических backup дочерних импортов. "
                "По умолчанию <backend>/backups/sqlite."
            ),
        )

    def handle(self, *args, **options):
        dates = self._selected_dates(options)
        if not dates:
            raise CommandError("Не выбраны даты.")

        apply_changes = options["apply"]
        mode_flag = "--apply" if apply_changes else "--dry-run"
        timeout = str(max(1.0, options["timeout"]))
        delay = str(max(0.0, options["delay"]))
        backup_dir = options["backup_dir"]

        self.stdout.write(
            self.style.MIGRATE_HEADING(
                "AZBYKA: единый импорт чтений + памятей"
            )
        )
        self.stdout.write(
            f"Дат: {len(dates)}. "
            f"Режим: {'APPLY' if apply_changes else 'DRY-RUN'}."
        )
        self.stdout.write(
            "Чтения: всегда заменяются данными Azbyka для выбранной даты."
        )
        self.stdout.write(
            "Памяти: старые связи дня заменяются полным набором Azbyka; "
            "старые CalendarFeast физически не удаляются."
        )

        completed = 0

        for index, target_date in enumerate(dates, start=1):
            date_value = target_date.isoformat()
            self.stdout.write("")
            self.stdout.write(
                self.style.MIGRATE_LABEL(
                    f"===== [{index}/{len(dates)}] {date_value} ====="
                )
            )

            reading_args = [
                "--date",
                date_value,
                mode_flag,
                "--overwrite",
                "--fail-on-error",
                "--timeout",
                timeout,
                "--delay",
                delay,
            ]
            feast_args = [
                "--date",
                date_value,
                mode_flag,
                "--replace-day-feasts",
                "--timeout",
                timeout,
                "--delay",
                delay,
            ]

            if backup_dir:
                reading_args.extend(["--backup-dir", backup_dir])
                feast_args.extend(["--backup-dir", backup_dir])

            try:
                if apply_changes:
                    # Один день либо применяется целиком, либо откатывается:
                    # чтения и набор памятей не должны разъехаться.
                    with transaction.atomic():
                        self._run_readings(reading_args)
                        self._run_feasts(feast_args)
                else:
                    self._run_readings(reading_args)
                    self._run_feasts(feast_args)
            except CommandError as error:
                raise CommandError(
                    f"{date_value}: единый импорт остановлен. {error}"
                ) from error

            completed += 1

        self.stdout.write("")
        if apply_changes:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Готово. Полностью обработано дней: {completed}."
                )
            )
        else:
            self.stdout.write(
                self.style.WARNING(
                    f"DRY-RUN завершён. Проверено дней: {completed}. "
                    "Локальная база не изменена."
                )
            )

    def _run_readings(self, args):
        self.stdout.write("")
        self.stdout.write(self.style.HTTP_INFO("---- ЧТЕНИЯ ----"))
        call_command(
            "import_azbyka_calendar_readings",
            *args,
            stdout=self.stdout,
            stderr=self.stderr,
        )

    def _run_feasts(self, args):
        self.stdout.write("")
        self.stdout.write(self.style.HTTP_INFO("---- СВЯТЫЕ / ПРАЗДНИКИ ----"))
        call_command(
            "import_azbyka_calendar_feasts",
            *args,
            stdout=self.stdout,
            stderr=self.stderr,
        )

    def _selected_dates(self, options):
        if options.get("dates"):
            return sorted(
                {
                    parse_iso_date(value, "--date")
                    for value in options["dates"]
                }
            )

        start_raw, end_raw = options["range"]
        start = parse_iso_date(start_raw, "--range START")
        end = parse_iso_date(end_raw, "--range END")

        if end < start:
            raise CommandError("END не может быть раньше START.")

        return list(iter_dates(start, end))
