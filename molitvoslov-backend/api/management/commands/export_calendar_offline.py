import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from api.calendar_models import CalendarDay
from api.calendar_serializers import CalendarDaySerializer


class FakeRequest:
    def __init__(self, language):
        self.query_params = {
            "lang": language,
        }
        self.headers = {}


class Command(BaseCommand):
    help = "Экспорт календаря за год в offline JSON для мобильного приложения."

    def add_arguments(self, parser):
        parser.add_argument(
            "--year",
            type=int,
            required=True,
        )

        parser.add_argument(
            "--output",
            type=str,
            required=True,
        )

        parser.add_argument(
            "--allow-incomplete",
            action="store_true",
        )

    def handle(self, *args, **options):
        year = options["year"]

        output_path = Path(options["output"]).expanduser().resolve()

        queryset = (
            CalendarDay.objects.filter(date_gregorian__year=year)
            .select_related(
                "main_feast",
            )
            .prefetch_related(
                "feasts",
            )
            .order_by(
                "date_gregorian",
            )
        )

        days = list(queryset)

        expected_count = 366 if self.is_leap_year(year) else 365

        if len(days) != expected_count and not options["allow_incomplete"]:
            raise CommandError(
                f"В базе найдено {len(days)} дней за {year} год, "
                f"а ожидается {expected_count}. "
                f"Если это намеренно, добавь --allow-incomplete."
            )

        output = {
            "version": 1,
            "year": year,
            "generated_at": timezone.now().isoformat(),
            "days": {},
        }

        ru_request = FakeRequest("ru")
        uk_request = FakeRequest("uk")

        for day in days:
            date_key = day.date_gregorian.isoformat()

            ru_data = CalendarDaySerializer(
                day,
                context={
                    "request": ru_request,
                },
            ).data

            uk_data = CalendarDaySerializer(
                day,
                context={
                    "request": uk_request,
                },
            ).data

            output["days"][date_key] = {
                "ru": ru_data,
                "uk": uk_data,
            }

        output_path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        with output_path.open(
            "w",
            encoding="utf-8",
        ) as file:
            json.dump(
                output,
                file,
                ensure_ascii=False,
                indent=2,
            )

        self.stdout.write(
            self.style.SUCCESS(f"Готово: {len(days)} дней за {year} год\n" f"Файл: {output_path}")
        )

    @staticmethod
    def is_leap_year(year):
        return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)
