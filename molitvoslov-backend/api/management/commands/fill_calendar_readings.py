"""Fill the existing calendar's CalendarReading rows for a civil year.

Does not create duplicate calendar day cards, change saints/fasts, or overwrite
previously entered readings. Fetches published readings directly for each date.
Use --apply for local SQLite writes; otherwise this is an audit only.

  python manage.py fill_calendar_readings --year 2027 --apply
  python manage.py fill_calendar_readings --year 2027 --date 2027-05-02 --apply
"""
from datetime import date, timedelta
from pathlib import Path

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Дополнить штатные чтения календаря по опубликованным датам. Не меняет святых и посты."

    def add_arguments(self, parser):
        parser.add_argument("--year", type=int, default=2027)
        parser.add_argument("--date", default="", help="Одна дата YYYY-MM-DD для проверки.")
        parser.add_argument("--month", type=int, default=None, help="Один месяц 1..12.")
        parser.add_argument(
            "--special-2027",
            action="store_true",
            help="Проверить только пять дат с Великим каноном: 15–18 марта и 14 апреля 2027.",
        )
        parser.add_argument("--apply", action="store_true", help="Записать в локальную SQLite; иначе dry-run.")
        parser.add_argument("--delay", type=float, default=0.5, help="Пауза между запросами к источнику.")
        parser.add_argument("--report", default="", help="JSON-отчёт. По умолчанию backend/reports/.")

    def handle(self, *args, **opts):
        year = opts["year"]
        if not 2026 <= year <= 2098:
            raise CommandError("Допустимые годы: 2026–2098.")
        if opts["month"] is not None and not 1 <= opts["month"] <= 12:
            raise CommandError("Месяц должен быть от 1 до 12.")
        if opts["date"] and opts["month"] is not None:
            raise CommandError("Используйте --date или --month, но не оба.")
        if opts["special_2027"] and (year != 2027 or opts["date"] or opts["month"] is not None):
            raise CommandError("--special-2027 используется только с --year 2027, без --date/--month.")

        args = []
        if opts["special_2027"]:
            from api.verified_lectionary_2027_special import VERIFIED_SPECIAL_2027
            for target_day in sorted(VERIFIED_SPECIAL_2027):
                args.extend(["--date", target_day.isoformat()])
        elif opts["date"]:
            try:
                day = date.fromisoformat(opts["date"])
            except ValueError as exc:
                raise CommandError("Неверная дата, ожидается YYYY-MM-DD") from exc
            if day.year != year:
                raise CommandError("Дата не соответствует --year.")
            args.extend(["--date", day.isoformat()])
        elif opts["month"] is not None:
            start = date(year, opts["month"], 1)
            stop = date(year + 1, 1, 1) if opts["month"] == 12 else date(year, opts["month"] + 1, 1)
            args.extend(["--range", start.isoformat(), (stop - timedelta(days=1)).isoformat()])
        else:
            args.extend(["--year", str(year)])

        report = Path(opts["report"] or (
            Path(settings.BASE_DIR) / "reports"
            / f"calendar_readings_{year}_{'special_5' if opts['special_2027'] else 'fill'}.json"
        ))
        args.extend([
            "--merge",
            "--apply" if opts["apply"] else "--dry-run",
            "--delay", str(max(0.0, opts["delay"])),
            "--report", str(report),
        ])
        self.stdout.write("Заполнение обычного календаря: CalendarDay.readings; без дополнительных экранов.")
        call_command("import_azbyka_calendar_readings", *args, stdout=self.stdout, stderr=self.stderr)
        self.stdout.write(f"Диагностика: {report}")
        self.stdout.write("Неопубликованные чтения не подменялись расчётными кандидатами.")
