"""Generate a read-only lectionary candidate JSON. NEVER writes CalendarDay/CalendarReading.

python manage.py generate_lectionary_preview --year 2028
"""
import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from api.calendar_models import CalendarDay
from api.lectionary_preview_engine import build_preview


class Command(BaseCommand):
    help = "Build diagnostic-only, unverified annual lectionary candidate JSON from 2026"

    def add_arguments(self, parser):
        parser.add_argument("--year", type=int, required=True)
        parser.add_argument("--output", type=str, default=None)

    def handle(self, *args, **options):
        year = options["year"]
        if not 1902 <= year <= 2097:
            raise CommandError("Year must be in 1902..2097")
        rows = []
        days = list(
            CalendarDay.objects.filter(date_gregorian__year=2026)
            .prefetch_related("readings")
        )
        if len(days) != 365:
            raise CommandError(
                f"2026 reference is incomplete in local database: {len(days)}/365 days"
            )
        for day in days:
            for reading in day.readings.all():
                rows.append({
                    "date": day.date_gregorian.isoformat(),
                    "kind": reading.kind,
                    "label": reading.label,
                    "title": reading.title,
                    "order": reading.order,
                })
        if not rows:
            raise CommandError("No CalendarReading records found for 2026")
        result = build_preview(year, rows)
        output = Path(options["output"] or f"lectionary_preview_{year}.json").resolve()
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(
            json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        self.stdout.write(f'{year}: {result["summary"]}; JSON: {output}')
        self.stdout.write(
            self.style.WARNING("UNVERIFIED PREVIEW ONLY; SQLite/Supabase unchanged")
        )
