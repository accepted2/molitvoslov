"""Deduplicate verified John of Kronstadt root listings; remove Azbyka separators.

Only removes CategoryText root links for prayers whose normalized body
exactly matches a prayer already linked in a dedicated Ioann subcategory.
No Text records or personal data are deleted.

Run after import_ioann_kronstadt_collections:
  python manage.py cleanup_ioann_kronstadt_duplicates --dry-run
  python manage.py cleanup_ioann_kronstadt_duplicates
"""
import re
import unicodedata

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from api.models import Category, CategoryText

ROOT = "raznye-molitvy"
COLLECTIONS = (
    "molitvy-ioanna-kronshtadtskogo",
    "ioann-kronshtadtsky-molitvy",
    "ioann-kronshtadtsky-moya-zhizn-vo-khriste",
)


def remove_separator_lines(value):
    pieces = re.split(r"\n\s*\n", (value or "").replace("\r\n", "\n"))
    return "\n\n".join(
        part for part in pieces
        if not re.fullmatch(r"(?:\*\s*){3,}", part.strip())
    ).strip()


def canonical(value):
    body = unicodedata.normalize("NFD", str(value or "")).lower()
    body = "".join(char for char in body if unicodedata.category(char) != "Mn")
    body = body.replace("ё", "е")
    return re.sub(r"\s+", " ", re.sub(r"[^а-яa-z0-9іїєґ]+", " ", body)).strip()


class Command(BaseCommand):
    help = "Clean decorative separators and safely unlink duplicate Ioann root prayers."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        if not Category.objects.filter(slug=ROOT).exists():
            raise CommandError("Root category is missing: " + ROOT)
        missing = [slug for slug in COLLECTIONS
                   if not Category.objects.filter(slug=slug).exists()]
        if missing:
            raise CommandError("Import the two prayer collections before cleanup: " + ", ".join(missing))
        with transaction.atomic():
            imported = []
            for item in CategoryText.objects.filter(category__slug__in=COLLECTIONS)\
                    .select_related("text").order_by("id"):
                text = item.text
                new_body = remove_separator_lines(text.translation)
                if new_body != text.translation and new_body:
                    text.translation = new_body
                    text.save(update_fields=["translation"])
                    self.stdout.write("Removed decorative separators: " + text.slug)
                norm = canonical(text.translation or text.content or text.traditional_content)
                if len(norm) > 70:
                    imported.append(norm)
            imported_set = set(imported)
            self.stdout.write("Imported prayers used for exact matching: " + str(len(imported_set)))
            deleted = 0
            retained = 0
            for row in CategoryText.objects.filter(category__slug=ROOT)\
                    .select_related("text").order_by("id"):
                text = row.text
                if not re.search(r"иоанн.*кронштадт", (text.title or "")+" "+(text.description or ""), re.I):
                    continue
                norm = canonical(text.translation or text.content or text.traditional_content)
                if len(norm) > 70 and norm in imported_set:
                    self.stdout.write("Unlink exact root duplicate: " + text.slug)
                    row.delete()  # unlink only; Text and all other links stay intact
                    deleted += 1
                else:
                    self.stdout.write("Keep distinct or unmatched root prayer: " + text.slug)
                    retained += 1
            self.stdout.write(f"Root duplicates unlinked: {deleted}; retained for review: {retained}")
            if options["dry_run"]:
                transaction.set_rollback(True)
                self.stdout.write("DRY RUN: all changes rolled back.")
            else:
                self.stdout.write(self.style.SUCCESS("Django prayer cleanup completed."))
