"""Read-only source verification: compares stored readings to today's Azbyka results."""

import csv
import time
from datetime import date, timedelta
from pathlib import Path
import requests
from django.core.management.base import BaseCommand, CommandError
from api.calendar_models import CalendarDay
from api.azbyka_calendar_readings import fetch_day_readings, AzbykaReadingsError


def identities(items):
    return [(x.kind, x.label, x.title, int(x.order)) for x in items]


class Command(BaseCommand):
    help = "Network cross-check of all 2027 reading rows; NEVER writes DB"

    def add_arguments(self, p):
        p.add_argument("--year", type=int, default=2027)
        p.add_argument("--output", default="calendar_readings_source_check_2027.csv")
        p.add_argument("--delay", type=float, default=0.35)
        p.add_argument("--timeout", type=float, default=20)

    def handle(self, *args, **opts):
        year = opts["year"]
        if not 1900 <= year <= 2099:
            raise CommandError("Year out of range")
        start = date(year, 1, 1)
        end = date(year, 12, 31)
        days = {
            d.date_gregorian: d
            for d in CalendarDay.objects.filter(date_gregorian__year=year).prefetch_related(
                "readings"
            )
        }
        rows = []
        current = start
        with requests.Session() as session:
            while current <= end:
                day = days.get(current)
                if day is None:
                    rows.append([current, "MISSING_DAY", "", "", ""])
                else:
                    try:
                        parsed = fetch_day_readings(
                            current, session=session, timeout=opts["timeout"]
                        )
                        expected = identities(parsed.readings)
                        actual = identities(day.readings.all())
                        if expected != actual:
                            rows.append(
                                [current, "DIFFERENT", repr(actual), repr(expected), parsed.url]
                            )
                    except (AzbykaReadingsError, requests.RequestException) as exc:
                        rows.append([current, "SOURCE_ERROR", "", str(exc), ""])
                    except Exception as exc:
                        rows.append([current, "UNEXPECTED_ERROR", "", repr(exc), ""])
                current += timedelta(days=1)
                if opts["delay"] > 0 and current <= end:
                    time.sleep(opts["delay"])
        output = Path(opts["output"])
        with output.open("w", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f, delimiter=";")
            w.writerow(["date", "status", "stored", "source_or_error", "source_url"])
            w.writerows(rows)
        self.stdout.write(f"Сверка завершена. Расхождений или проблем: {len(rows)}. Файл: {output}")
        self.stdout.write("База НЕ изменялась. SOURCE_ERROR не означает, что данные неверны.")
