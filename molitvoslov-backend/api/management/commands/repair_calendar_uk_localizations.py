from django.core.management.base import BaseCommand

from api.calendar_localization import feast_identity_similarity, same_feast_identity
from api.calendar_models import CalendarFeast


UK_FIELDS = [
    "title_uk",
    "short_title_uk",
    "troparion_title_uk",
    "troparion_content_uk",
    "kontakion_title_uk",
    "kontakion_content_uk",
    "life_title_uk",
    "life_content_uk",
    "description_uk",
]


class Command(BaseCommand):
    help = (
        "Найти и, при --apply, очистить украинские поля календарных памятей, "
        "которые по названию относятся к другому святому/празднику. "
        "После очистки API безопасно откатывается к русскому каноническому тексту."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--year",
            type=int,
            help="Проверять только памяти, связанные с днями указанного года.",
        )
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Очистить подозрительные украинские поля. Без флага выполняется dry-run.",
        )

    def handle(self, *args, **options):
        queryset = CalendarFeast.objects.exclude(title_uk="").order_by("source_id", "id")

        year = options.get("year")
        if year:
            queryset = queryset.filter(calendar_days__date_gregorian__year=year).distinct()

        suspicious = []

        for feast in queryset:
            if same_feast_identity(feast.title, feast.title_uk):
                continue

            suspicious.append(
                (
                    feast,
                    feast_identity_similarity(feast.title, feast.title_uk),
                )
            )

        self.stdout.write(f"Подозрительных украинских локализаций: {len(suspicious)}")

        for feast, score in suspicious[:200]:
            self.stdout.write(
                f"  source_id={feast.source_id} similarity={score:.3f}\n"
                f"    RU: {feast.short_title or feast.title}\n"
                f"    UK: {feast.short_title_uk or feast.title_uk}"
            )

        if len(suspicious) > 200:
            self.stdout.write(f"  ... и ещё {len(suspicious) - 200}")

        if not options["apply"]:
            self.stdout.write(
                self.style.WARNING("DRY-RUN: база не изменена. Для очистки добавьте --apply.")
            )
            return

        for feast, _score in suspicious:
            for field in UK_FIELDS:
                setattr(feast, field, "")

            feast.save(update_fields=[*UK_FIELDS, "updated_at"])

        self.stdout.write(
            self.style.SUCCESS(
                f"Готово. Очищено локализаций: {len(suspicious)}. "
                "Для восстановления канонических связей дней выполните повторный "
                "импорт RU, затем UK."
            )
        )
