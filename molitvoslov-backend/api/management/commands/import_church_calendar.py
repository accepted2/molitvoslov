from django.core.management.base import BaseCommand, CommandError

from api.calendar_import import ensure_month


class Command(BaseCommand):
    help = "Импортировать церковный календарь из Church Site, не изменяя исходный проект."

    def add_arguments(self, parser):
        parser.add_argument("--start-year", type=int, default=2025)
        parser.add_argument("--end-year", type=int, default=2030)
        parser.add_argument(
            "--month",
            type=int,
            choices=range(1, 13),
            help="Импортировать только один месяц каждого выбранного года.",
        )

    def handle(self, *args, **options):
        start_year = options["start_year"]
        end_year = options["end_year"]
        selected_month = options.get("month")

        if end_year < start_year:
            raise CommandError("end-year не может быть меньше start-year")

        total = 0

        months = [selected_month] if selected_month else range(1, 13)

        for year in range(start_year, end_year + 1):
            for month in months:
                try:
                    imported = ensure_month(year, month)
                except Exception as error:
                    raise CommandError(
                        f"Не удалось импортировать {month:02d}.{year}: {error}"
                    ) from error

                total += imported
                self.stdout.write(
                    self.style.SUCCESS(
                        f"{month:02d}.{year}: в локальной базе {imported} дней"
                    )
                )

        self.stdout.write(
            self.style.SUCCESS(
                f"Готово. Календарь синхронизирован за {start_year}–{end_year}."
            )
        )
