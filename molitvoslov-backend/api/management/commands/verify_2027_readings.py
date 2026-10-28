"""Read-only cross-check of a calendar year against Azbyka's dated readings.

Reports EVERY day. Compare canonical passage sets separately from multiplicity,
labels and ordering; an unequal exact tuple is not automatically a missing reading.
"""
import csv
import json
import time
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from django.core.management.base import BaseCommand, CommandError
from api.calendar_models import CalendarDay
from api.azbyka_calendar_readings import fetch_day_readings, AzbykaReadingsError


def identity(item):
    return (item.kind, item.label, item.title, int(item.order))


def passages(items):
    return Counter((i[0], i[2]) for i in items)


def pairs(counter):
    return [
        {"kind": kind, "passage": title, "count": count}
        for (kind, title), count in sorted(counter.items())
    ]


def compare(actual, expected):
    a, b = passages(actual), passages(expected)
    if actual == expected:
        status = "EXACT_MATCH"
    elif set(a) != set(b):
        status = "PASSAGE_DIFFERENCE"
    elif a != b:
        status = "DUPLICATE_COUNT_DIFFERENCE"
    else:
        status = "LABEL_OR_ORDER_DIFFERENCE"
    return status, pairs(b - a), pairs(a - b)


class Command(BaseCommand):
    help = "Read-only full-year cross-check against Azbyka, with one CSV row per date"

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
            for d in CalendarDay.objects.filter(date_gregorian__year=year).prefetch_related("readings")
        }
        rows, counts = [], Counter()
        totals = Counter()
        current = start
        retry = Retry(total=2, connect=2, read=2, backoff_factor=0.7,
                      status_forcelist=[429, 500, 502, 503, 504],
                      allowed_methods=frozenset(["GET"]))
        with requests.Session() as session:
            session.mount("https://", HTTPAdapter(max_retries=retry))
            while current <= end:
                day = days.get(current)
                d = current.isoformat()
                record = dict(date=d, status="", stored_count="", source_count="",
                              missing_passages="", extra_passages="", stored="", source="",
                              source_url=f"https://azbyka.ru/days/{d}", error="")
                if day is None:
                    record["status"] = "MISSING_DAY"
                else:
                    actual = [identity(r) for r in day.readings.all()]
                    actual.sort(key=lambda item: (item[3], item[0], item[1], item[2]))
                    record["stored_count"] = len(actual)
                    totals["stored"] += len(actual)
                    record["stored"] = json.dumps(actual, ensure_ascii=False)
                    try:
                        parsed = fetch_day_readings(current, session=session, timeout=opts["timeout"])
                        expected = [identity(r) for r in parsed.readings]
                        expected.sort(key=lambda item: (item[3], item[0], item[1], item[2]))
                        record["source_url"] = parsed.url
                        record["source_count"] = len(expected)
                        totals["source"] += len(expected)
                        record["source"] = json.dumps(expected, ensure_ascii=False)
                        status, missing, extra = compare(actual, expected)
                        record["status"] = status
                        record["missing_passages"] = json.dumps(missing, ensure_ascii=False)
                        record["extra_passages"] = json.dumps(extra, ensure_ascii=False)
                    except (AzbykaReadingsError, requests.RequestException) as exc:
                        record["status"] = "SOURCE_ERROR"
                        record["error"] = str(exc)
                    except Exception as exc:
                        record["status"] = "UNEXPECTED_ERROR"
                        record["error"] = repr(exc)
                rows.append(record)
                counts[record["status"]] += 1
                if opts["delay"] > 0 and current < end:
                    time.sleep(opts["delay"])
                current += timedelta(days=1)

        output = Path(opts["output"])
        output.parent.mkdir(parents=True, exist_ok=True)
        columns = ["date", "status", "stored_count", "source_count",
                   "missing_passages", "extra_passages", "stored", "source",
                   "source_url", "error"]
        with output.open("w", newline="", encoding="utf-8-sig") as f:
            writer = csv.DictWriter(f, fieldnames=columns, delimiter=";")
            writer.writeheader()
            writer.writerows(rows)
        self.stdout.write(f"Сверка {year}: {len(rows)} календарных дат")
        for status in ["EXACT_MATCH", "LABEL_OR_ORDER_DIFFERENCE",
                       "DUPLICATE_COUNT_DIFFERENCE", "PASSAGE_DIFFERENCE",
                       "SOURCE_ERROR", "UNEXPECTED_ERROR", "MISSING_DAY"]:
            self.stdout.write(f"  {status}: {counts[status]}")
        self.stdout.write(f"  Всего чтений SQLite: {totals['stored']}")
        self.stdout.write(f"  Всего чтений Azbyka по успешным датам: {totals['source']}")
        self.stdout.write(f"Отчёт по всем датам: {output}")
        self.stdout.write("SQLite не изменялась. SOURCE_ERROR требует повторной проверки.")
