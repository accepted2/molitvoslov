from django.core.management.base import BaseCommand, CommandError

from api.calendar_import import ensure_month


class Command(BaseCommand):
    help = (
        "Импортировать церковный календарь из Church Site, не изменяя исходный проект. "
        "По умолчанию синхронизируются русский и украинский языки."
    )

    def add_arguments(self, parser):
        parser.add_argument("--start-year", type=int, default=2025)
        parser.add_argument("--end-year", type=int, default=2030)
        parser.add_argument(
            "--month",
            type=int,
            choices=range(1, 13),
            help="Импортировать только один месяц каждого выбранного года.",
        )
        parser.add_argument(
            "--language",
            choices=["ru", "uk", "both"],
            default="both",
            help="Язык календарных данных. По умолчанию: both.",
        )
        parser.add_argument(
            "--overwrite-existing",
            action="store_true",
            help=(
                "Разрешить источнику перезаписывать уже заполненные локальные поля. "
                "По умолчанию существующие значения сохраняются, чтобы не терять "
                "ручные правки из админки."
            ),
        )

    def handle(self, *args, **options):
        start_year = options["start_year"]
        end_year = options["end_year"]
        selected_month = options.get("month")
        language = options["language"]
        overwrite_existing = options["overwrite_existing"]

        if end_year < start_year:
            raise CommandError("end-year не может быть меньше start-year")

        languages = ["ru", "uk"] if language == "both" else [language]
        months = [selected_month] if selected_month else range(1, 13)

        for year in range(start_year, end_year + 1):
            for month in months:
                results = []

                for current_language in languages:
                    try:
                        imported = ensure_month(
                            year,
                            month,
                            language=current_language,
                            force=True,
                            overwrite_existing=overwrite_existing,
                        )
                    except Exception as error:
                        raise CommandError(
                            f"Не удалось импортировать {month:02d}.{year} "
                            f"({current_language}): {error}"
                        ) from error

                    results.append(f"{current_language}: {imported}")

                self.stdout.write(self.style.SUCCESS(f"{month:02d}.{year}: " + ", ".join(results)))

        self.stdout.write(
            self.style.SUCCESS(
                f"Готово. Календарь синхронизирован за {start_year}–{end_year} "
                f"({', '.join(languages)}). "
                f"Перезапись существующих полей: "
                f"{'да' if overwrite_existing else 'нет'}."
            )
        )
