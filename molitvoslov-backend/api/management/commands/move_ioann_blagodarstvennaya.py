"""Move the original source prayer "Молитва благодарственная" into gratitude.

Run after both prayer collections have been imported into Django:
    python manage.py move_ioann_blagodarstvennaya --dry-run
    python manage.py move_ioann_blagodarstvennaya

Keep Text ID/slug, favorites, deep links. Move the existing CategoryText row,
or unlink only its duplicate link if a complete gratitude copy exists.
"""
import re
import unicodedata
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Max
from api.models import Category, CategoryText, Text

MAIN="ioann-kronshtadtsky-molitvy"
GRATITUDE="molitvy-ioanna-kronshtadtskogo"
TARGET="ioann-kronstadt-azbyka-prayer-01"


def canonical(value):
    s=unicodedata.normalize("NFD",str(value or "")).lower()
    s="".join(ch for ch in s if unicodedata.category(ch)!="Mn")
    return re.sub(r"\s+"," ",re.sub(r"[^а-яa-z0-9іїєґ]+"," ",s.replace("ё","е"))).strip()


def text_body(text):
    return text.translation or text.content or text.traditional_content or ""


class Command(BaseCommand):
    help="Move the original first Azbyka gratitude prayer under nested Gratitude."

    def add_arguments(self,parser):
        parser.add_argument("--dry-run",action="store_true")

    def handle(self,*args,**options):
        with transaction.atomic():
            main=Category.objects.filter(slug=MAIN).first()
            gratitude=Category.objects.filter(slug=GRATITUDE).first()
            if not main or not gratitude or gratitude.parent_id!=main.id:
                raise CommandError("Required nested gratitude category not found")
            text=Text.objects.filter(slug=TARGET).first()
            if not text or "благодарственн" not in (text.title or "").lower():
                raise CommandError("Original source prayer not found; no changes")
            normalized=canonical(text_body(text))
            if len(normalized)<50:
                raise CommandError("The source prayer text is incomplete")
            old=CategoryText.objects.filter(category=main,text=text).first()
            new=CategoryText.objects.filter(category=gratitude,text=text).first()
            if not old:
                if new:
                    self.stdout.write("PASS: already in gratitude. No changes.")
                    return
                raise CommandError("Source is not linked to the main category; no changes")
            if CategoryText.objects.filter(category=main,text=text).count()!=1:
                raise CommandError("Multiple main-category links for source prayer")
            existing=next((
                other for other in CategoryText.objects.filter(category=gratitude)
                .select_related("text").order_by("id")
                if other.text_id!=text.id and canonical(text_body(other.text))==normalized
            ),None)
            if new or existing:
                self.stdout.write("EXACT_DUPLICATE_UNLINK_MAIN: "+text.slug)
                if existing:self.stdout.write("Identical gratitude text: "+existing.text.slug)
                old.delete()  # Only the join row; preserve Text entirely.
            else:
                old.category=gratitude
                old.order=(CategoryText.objects.filter(category=gratitude)
                           .aggregate(max_order=Max("order"))["max_order"] or 0)+10
                old.save(update_fields=["category","order"])
                self.stdout.write("MOVE_EXISTING_PRAYER: "+text.slug+
                                  " (Text ID "+str(text.id)+")")
            if options["dry_run"]:
                transaction.set_rollback(True)
                self.stdout.write("DRY RUN: transaction rolled back.")
            else:
                self.stdout.write(self.style.SUCCESS(
                    "PASS: gratitude prayer moved without changing prayer text or ID"
                ))
