"""Import the user-supplied daily prayer of St Philaret into canonical Django.

Run AFTER installing the offline prayer:
  python manage.py import_filaret_daily_prayer --dry-run
  python manage.py import_filaret_daily_prayer

The source, original text and stable IDs come from the already validated
offline prayer manifest. Text and CategoryText are reused if they exist.
The command NEVER exports/replaces the rest of the user's local catalog.
"""
from pathlib import Path
import json
import re
import unicodedata

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Max

from api.models import Category, CategoryText, Text

APP = Path(__file__).resolve().parents[4] / "molitvoslov-app"
MANIFEST = APP / "tools" / "prayer_sources" / "filaret_daily_prayer_20261119.json"
CONTENT = APP / "src" / "data" / "offlineContent.json"


def normalize(value):
    value = unicodedata.normalize("NFD", str(value or "").lower())
    value = "".join(c for c in value if unicodedata.category(c) not in ("Mn", "Me"))
    return re.sub(r"\s+", " ", re.sub(
        r"[^a-zа-я0-9іїєґ]+", " ", value.replace("ё", "е")
    )).strip()


def matches(prayer, body):
    value = normalize(body)
    # Preserve the Russian-language tab when reusing existing texts.
    return value == normalize(getattr(prayer, "translation") or "")


class Command(BaseCommand):
    help = "Persist St Philaret's daily prayer in Разные молитвы, without overwrites."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--source", default=str(MANIFEST))
        parser.add_argument("--input", default=str(CONTENT))

    def handle(self, *args, **options):
        try:
            source = json.loads(Path(options["source"]).read_text(encoding="utf-8-sig"))
            offline = json.loads(Path(options["input"]).read_text(encoding="utf-8-sig"))
        except (OSError, ValueError) as exc:
            raise CommandError("Required curated prayer source is missing: " + str(exc)) from exc
        slug = source.get("slug")
        text = source.get("text")
        if (slug != "ezhednevnaya-molitva-svyatitelya-filareta-drozdova" or
                source.get("category_slug") != "raznye-molitvy" or
                source.get("language") != "ru" or
                not isinstance(text, str) or len(text) < 450):
            raise CommandError("Unexpected Philaret prayer manifest")
        linked = [
            row for row in (offline.get("category_texts") or {}).get("raznye-molitvy", [])
            if isinstance(row, dict) and
            isinstance(row.get("text"), dict) and
            matches_text(row["text"], text, offline.get("texts") or {})
        ]
        if len(linked) != 1:
            raise CommandError(
                "The offline catalog must contain exactly one link to the full "
                "Filaret prayer before Django synchronization."
            )
        row = linked[0]
        offline_slug = row["text"].get("slug")
        offline_id = int(row["text"].get("id") or 0)
        offline_link_id = int(row.get("id") or 0)
        if offline_id <= 0 or offline_link_id <= 0:
            raise CommandError("Offline prayer lacks stable Text or CategoryText ID")
        try:
            with transaction.atomic():
                category = Category.objects.filter(slug="raznye-molitvy").first()
                if not category:
                    raise CommandError("Canonical Разные молитвы category does not exist")
                existing = Text.objects.filter(slug=offline_slug).first()
                if existing and not matches(existing, text):
                    raise CommandError("Existing Text slug has different content: " + offline_slug)
                if existing is None:
                    candidates = [
                        candidate for candidate in Text.objects.only(
                            "id", "slug", "title", "translation", "content",
                            "traditional_content", "translation_uk"
                        ) if matches(candidate, text)
                    ]
                    if len(candidates) > 1:
                        raise CommandError("Multiple identical Django texts; review before linking")
                    existing = candidates[0] if candidates else None
                if existing:
                    if existing.id != offline_id or existing.slug != offline_slug:
                        raise CommandError(
                            "Django has matching text with different slug/ID. "
                            "Reconcile offline and Django identifiers before exporting."
                        )
                    self.stdout.write("REUSE EXISTING TEXT: " + existing.slug)
                else:
                    conflicted = Text.objects.filter(pk=offline_id).first()
                    if conflicted:
                        raise CommandError(
                            f"Text id {offline_id} belongs to {conflicted.slug}; refusing overwrite"
                        )
                    existing = Text.objects.create(
                        id=offline_id, slug=offline_slug, title=source["title"],
                        language="ru", content="", translation=text,
                        traditional_content="", title_uk="", traditional_title="",
                        description="", description_uk="", translation_uk="",
                        description_position="after", is_visible=True,
                    )
                    self.stdout.write("CREATE TEXT: " + existing.slug + f" (ID {offline_id})")

                joins = list(CategoryText.objects.filter(
                    category=category, text=existing
                ).order_by("id"))
                if len(joins) > 1:
                    raise CommandError("Multiple canonical category links; refusing duplicate")
                if joins:
                    if joins[0].id != offline_link_id:
                        raise CommandError(
                            "Existing category link ID differs from offline link; "
                            "reconcile before export."
                        )
                    self.stdout.write("EXISTING LINK: " + offline_slug)
                else:
                    if CategoryText.objects.filter(pk=offline_link_id).exists():
                        raise CommandError(
                            "CategoryText ID already belongs to another prayer: " +
                            str(offline_link_id)
                        )
                    order = (CategoryText.objects.filter(category=category)
                             .aggregate(value=Max("order"))["value"] or 0) + 10
                    CategoryText.objects.create(
                        id=offline_link_id, category=category, text=existing, order=order
                    )
                    self.stdout.write("LINK TO Разные молитвы: " + offline_slug)

                if options["dry_run"]:
                    transaction.set_rollback(True)
                    self.stdout.write("DRY RUN: transaction rolled back")
                else:
                    self.stdout.write(self.style.SUCCESS(
                        "PASS: St Philaret prayer persisted in Django; other content untouched."
                    ))
        except CommandError:
            raise


def matches_text(embedded, body, index):
    full = index.get(embedded.get("slug"), embedded)
    return normalize(body) in {
        normalize(full.get(key) or "")
        for key in ("translation", "content", "traditional_content", "translation_uk")
    }
