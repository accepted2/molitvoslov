"""Export compact fasting/feast markers to an offline React Native JSON bundle.

Run after local import:
    python manage.py export_calendar_markers --year 2026

No database writes. The output is generated from the local SQLite source of truth.
"""

import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from api.calendar_models import CalendarDay


class Command(BaseCommand):
    help = "Создать годовой JSON календарных признаков для офлайн-работы приложения"

    def add_arguments(self, parser):
        parser.add_argument("--year", type=int, required=True)

    def handle(self, *args, **options):
        year = options["year"]
        if year < 1900 or year > 2200:
            raise CommandError("Год вне диапазона.")
        result = {}
        for day in CalendarDay.objects.filter(date_gregorian__year=year).iterator():
            payload = day.source_payload if isinstance(day.source_payload, dict) else {}
            markers = payload.get("azbyka_calendar_markers")
            if not isinstance(markers, dict):
                continue
            result[day.date_gregorian.isoformat()] = {
                "calendar_markers": markers,
                "fast_type_code": day.fast_type_code,
                "fast_type_title": day.fast_type_title,
                "fast_name": day.fast_name,
                "fast_description": day.fast_description,
            }
        expected = 366 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 365
        if len(result) != expected:
            raise CommandError(f"Неполный год: {len(result)} из {expected}. Экспорт отменён.")
        target = (
            Path(settings.BASE_DIR).parent
            / "molitvoslov-app"
            / "src"
            / "data"
            / "calendar"
            / f"markers-{year}.json"
        )
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(
            json.dumps(
                {"year": year, "days": result, "total_days": len(result)},
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        self.stdout.write(self.style.SUCCESS(f"Создан файл {target} ({len(result)} дней)"))
