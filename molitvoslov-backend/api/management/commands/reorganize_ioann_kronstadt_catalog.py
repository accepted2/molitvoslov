"""Reorganize the canonical Django St John of Kronstadt prayer categories.

Use after importing both Azbyka collections:
 python manage.py reorganize_ioann_kronstadt_catalog --dry-run
 python manage.py reorganize_ioann_kronstadt_catalog

Keeps Text and all user references. Exact duplicates: unlink only the root
CategoryText row. Distinct St John prayers: relocate original CategoryText
record to the nested main collection (or reuse its existing link).
"""
import re
import unicodedata

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Max

from api.models import Category, CategoryText

ROOT = "raznye-molitvy"
MAIN = "ioann-kronshtadtsky-molitvy"
GRATITUDE = "molitvy-ioanna-kronshtadtskogo"
VOLUMES = "ioann-kronshtadtsky-moya-zhizn-vo-khriste"
COLLECTIONS = (MAIN, GRATITUDE, VOLUMES)


def canonical(body):
    value = unicodedata.normalize("NFD", str(body or "")).lower()
    value = "".join(char for char in value if unicodedata.category(char) != "Mn")
    value = value.replace("ё", "е")
    return re.sub(r"\s+", " ", re.sub(r"[^а-яa-z0-9іїєґ]+", " ", value)).strip()


def body_of(text):
    return text.translation or text.content or text.traditional_content or ""


def is_saint_prayer(text):
    title = canonical(text.title)
    description = canonical(text.description)
    has_prayer = bool(re.search(r"(?:^|\s)молитв[а-я]*", title))
    has_author = any(re.search(
        r"иоанн[а-я]*\s+(?:\S+\s+){0,4}кронштадтск", value
    ) for value in (title, description))
    return has_prayer and has_author


class Command(BaseCommand):
    help = "Nest St John gratitude prayers and consolidate root prayer links safely."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        try:
            with transaction.atomic():
                categories = {
                    c.slug: c for c in Category.objects.filter(slug__in=[ROOT, *COLLECTIONS])
                }
                missing = [slug for slug in [ROOT, *COLLECTIONS] if slug not in categories]
                if missing:
                    raise CommandError("Import the prayer collections first: " + ", ".join(missing))
                root = categories[ROOT]
                main = categories[MAIN]
                gratitude = categories[GRATITUDE]
                volumes = categories[VOLUMES]
                if main.parent_id != root.id or volumes.parent_id != main.id:
                    raise CommandError("Existing prayer collection hierarchy differs; nothing changed")
                if gratitude.parent_id not in (root.id, main.id):
                    raise CommandError("Gratitude category belongs to another parent; nothing changed")
                required = ((MAIN, 15), (GRATITUDE, 3), (VOLUMES, 3))
                for slug, minimum in required:
                    count = CategoryText.objects.filter(category=categories[slug]).count()
                    if count < minimum:
                        raise CommandError(
                            f"Incomplete imported category {slug}: found {count}, expected {minimum}"
                        )

                existing = []
                for row in CategoryText.objects.filter(
                    category__slug__in=COLLECTIONS
                ).select_related("text").order_by("id"):
                    normalized = canonical(body_of(row.text))
                    if len(normalized) >= 60:
                        existing.append((normalized, row.text.slug, row.category.slug))

                if gratitude.parent_id != main.id:
                    gratitude.parent = main
                    gratitude.save(update_fields=["parent"])
                    self.stdout.write("NEST CATEGORY: " + gratitude.name + " -> " + main.name)

                next_order = (CategoryText.objects.filter(category=main)
                              .aggregate(value=Max("order"))["value"] or 0) + 10
                duplicate_count = 0
                moved_count = 0
                for row in list(CategoryText.objects.filter(category=root)
                                .select_related("text").order_by("order", "id")):
                    prayer = row.text
                    if not is_saint_prayer(prayer):
                        continue
                    normalized = canonical(body_of(prayer))
                    if len(normalized) < 30:
                        raise CommandError(
                            "Root St John prayer is incomplete; cannot move: " + prayer.slug
                        )
                    exact = next(
                        ((slug, category_slug) for body, slug, category_slug in existing
                         if body == normalized and slug != prayer.slug),
                        None,
                    )
                    already_in_main = CategoryText.objects.filter(
                        category=main, text=prayer
                    ).exists()
                    if exact or already_in_main:
                        self.stdout.write(
                            "DUPLICATE: unlink root only: " + prayer.slug +
                            (" (matches " + exact[0] + ")" if exact else "")
                        )
                        row.delete()  # Text and stable IDs are never deleted
                        duplicate_count += 1
                        continue

                    self.stdout.write(
                        "MOVE ORIGINAL TEXT: " + prayer.slug + " -> " + main.slug
                    )
                    # Reuse the same CategoryText ID; this also keeps order
                    # deterministic in future Django offline exports.
                    row.category = main
                    row.order = next_order
                    row.save(update_fields=["category", "order"])
                    next_order += 10
                    moved_count += 1

                self.stdout.write(
                    f"Result: {moved_count} original prayers moved, "
                    f"{duplicate_count} exact root links removed. No Text deleted."
                )
                if options["dry_run"]:
                    transaction.set_rollback(True)
                    self.stdout.write("DRY RUN: DB transaction rolled back.")
                else:
                    self.stdout.write(self.style.SUCCESS(
                        "PASS: St John of Kronstadt collections reorganized in Django."
                    ))
        except CommandError:
            raise
