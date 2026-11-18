"""Import the locally reviewed two John of Kronstadt collections into Django.

Run AFTER the offline importer:
 python manage.py import_ioann_kronstadt_collections --dry-run
 python manage.py import_ioann_kronstadt_collections

Django is the canonical source for the next export_mobile_content run.
"""
import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from api.models import Category, CategoryText, Text

MISC = "raznye-molitvy"
CATEGORIES = [
    "molitvy-ioanna-kronshtadtskogo",
    "ioann-kronshtadtsky-molitvy",
    "ioann-kronshtadtsky-moya-zhizn-vo-khriste",
]


class Command(BaseCommand):
    help = "Persist reviewed Ioann Kronstadt prayer collections in Django for future offline exports."

    def add_arguments(self, parser):
        default = settings.BASE_DIR.parent / "molitvoslov-app" / "src" / "data" / "offlineContent.json"
        parser.add_argument("--input", default=str(default))
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        source = Path(options["input"]).resolve()
        if not source.exists():
            raise CommandError("Offline content not found: " + str(source))
        payload = json.loads(source.read_text(encoding="utf-8-sig"))
        categories = {c["slug"]: c for c in payload.get("categories", [])}
        roots = [name for name in CATEGORIES if name not in categories]
        if roots:
            raise CommandError("Run the offline import first; missing category: " + ", ".join(roots))
        for slug, count in zip(CATEGORIES, (3, 15, 3)):
            rows = payload.get("category_texts", {}).get(slug)
            if not isinstance(rows, list) or len(rows) < count:
                raise CommandError(f"Incomplete local category {slug}: expected at least {count} entries")
        try:
            with transaction.atomic():
                parent = Category.objects.filter(slug=MISC).first()
                if not parent:
                    raise CommandError("Django category raznye-molitvy is missing")
                imported = {}
                categories_created = 0
                prayers_created = 0
                links_created = 0
                for slug in CATEGORIES:
                    item = categories[slug]
                    parent_slug = MISC if slug != CATEGORIES[2] else CATEGORIES[1]
                    parent_obj = parent if parent_slug == MISC else imported[parent_slug]
                    entry = Category.objects.filter(slug=slug).first()
                    if entry:
                        if entry.parent_id != parent_obj.id:
                            raise CommandError("Existing category belongs to another parent: " + slug)
                        if entry.name != item["name"]:
                            entry.name = item["name"]
                            entry.save(update_fields=["name"])
                    else:
                        entry = Category.objects.create(
                            slug=slug, name=item["name"], name_uk=item.get("name_uk") or "",
                            parent=parent_obj, order=int(item.get("order") or 0), icon=item.get("icon") or ""
                        )
                        categories_created += 1
                    imported[slug] = entry
                    rows = payload["category_texts"][slug]
                    expected_prefixes = {
                        CATEGORIES[0]: "ioann-kronshtadtsky-",
                        CATEGORIES[1]: "ioann-kronstadt-azbyka-prayer-",
                        CATEGORIES[2]: "ioann-kronstadt-moya-zhizn-tom-",
                    }
                    for row in rows:
                        item_data = row.get("text") or {}
                        text_slug = item_data.get("slug") or ""
                        if not text_slug.startswith(expected_prefixes[slug]):
                            continue  # Never accidentally import unrelated category content.
                        source_text = payload["texts"].get(text_slug)
                        if not source_text:
                            raise CommandError("Prayer missing from text index: " + text_slug)
                        body = source_text.get("translation") or ""
                        if not body.strip():
                            raise CommandError("No prayer body: " + text_slug)
                        prayer = Text.objects.filter(slug=text_slug).first()
                        if prayer:
                            if (prayer.translation or "").strip() != body.strip():
                                raise CommandError("A curated prayer was edited in Django; not overwriting: " + text_slug)
                        else:
                            prayer = Text.objects.create(
                                slug=text_slug, title=source_text["title"],
                                description=source_text.get("description") or "",
                                content=source_text.get("content") or "",
                                translation=body,
                                traditional_content=source_text.get("traditional_content") or "",
                                language="ru", is_visible=True,
                            )
                            prayers_created += 1
                        _, created = CategoryText.objects.get_or_create(
                            category=entry, text=prayer,
                            defaults={"order": int(row.get("order") or 0)}
                        )
                        links_created += int(created)
                self.stdout.write(
                    f"Verified: {categories_created} new categories, "
                    f"{prayers_created} new texts, {links_created} new links."
                )
                if options["dry_run"]:
                    transaction.set_rollback(True)
                    self.stdout.write("DRY RUN — Django transaction rolled back.")
                else:
                    self.stdout.write(self.style.SUCCESS(
                        "Two prayer collections persisted in Django. "
                        "Future export_mobile_content will preserve them."
                    ))
        except CommandError:
            raise
