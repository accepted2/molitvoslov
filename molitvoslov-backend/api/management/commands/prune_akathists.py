from django.core.management.base import BaseCommand
from django.db import transaction

from api.akathist_curated import (
    CURATED_AKATHISTS,
    find_curated_akathist,
)
from api.models import (
    Akathist,
    ReadingProgress,
    SavedItem,
)


class Command(BaseCommand):
    help = (
        "Оставляет только утверждённый список акафистов, "
        "удаляет остальные акафисты и связанные секции."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help=("Только показать, что будет оставлено и удалено, " "не изменяя базу."),
        )

    @transaction.atomic
    def handle(self, *args, **options):
        dry_run = options["dry_run"]

        rows = list(Akathist.objects.all().order_by("id"))

        grouped = {entry["key"]: [] for entry in CURATED_AKATHISTS}
        unlisted = []

        for akathist in rows:
            entry = find_curated_akathist(
                slug=akathist.slug,
                title=akathist.title,
            )

            if entry is None:
                unlisted.append(akathist)
                continue

            grouped[entry["key"]].append(akathist)

        kept = []
        duplicates = []

        for entry in CURATED_AKATHISTS:
            matches = grouped[entry["key"]]

            if not matches:
                continue

            slug_priority = {slug: index for index, slug in enumerate(entry["slugs"])}

            matches.sort(
                key=lambda item: (
                    slug_priority.get(
                        item.slug,
                        999,
                    ),
                    item.id,
                )
            )

            kept.append(matches[0])
            duplicates.extend(matches[1:])

        to_delete = unlisted + duplicates

        self.stdout.write("")
        self.stdout.write("ОСТАВЛЯЕМ:")

        for item in kept:
            self.stdout.write(f"  ✓ {item.title} [{item.slug}]")

        missing_keys = {entry["key"] for entry in CURATED_AKATHISTS} - {
            find_curated_akathist(
                slug=item.slug,
                title=item.title,
            )["key"]
            for item in kept
        }

        if missing_keys:
            self.stdout.write("")
            self.stdout.write(self.style.WARNING("ИЗ УТВЕРЖДЁННОГО СПИСКА " "НЕ НАЙДЕНЫ В БАЗЕ:"))

            for entry in CURATED_AKATHISTS:
                if entry["key"] in missing_keys:
                    self.stdout.write(f'  ! {entry["title"]}')

        self.stdout.write("")
        self.stdout.write(f"БУДЕТ УДАЛЕНО: {len(to_delete)}")

        for item in to_delete:
            self.stdout.write(f"  × {item.title} [{item.slug}]")

        if dry_run:
            self.stdout.write("")
            self.stdout.write(self.style.WARNING("DRY-RUN: база не изменялась."))
            return

        delete_ids = [item.id for item in to_delete]

        if delete_ids:
            SavedItem.objects.filter(
                source_type="akathist",
                source_id__in=delete_ids,
            ).delete()

            ReadingProgress.objects.filter(
                source_type="akathist",
                source_id__in=delete_ids,
            ).delete()

            Akathist.objects.filter(id__in=delete_ids).delete()

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS("Готово: " f"оставлено {len(kept)}, " f"удалено {len(delete_ids)}.")
        )
        self.stdout.write("EPUB-файлы и исходные файлы не удалялись.")
