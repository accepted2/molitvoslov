"""Publish only changed public records to the mobile delta feed.

Initial deployment:
  python manage.py migrate
  python manage.py publish_offline_content_updates --baseline

After editing public content:
  python manage.py publish_offline_content_updates

A baseline must be made from the same dataset used to build the bundled APK.
The command never reads or publishes user accounts, memorials, or private records.
"""
import hashlib
import json
from types import SimpleNamespace

from django.core.management.base import BaseCommand, CommandError
from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction
from django.db.models.functions import ExtractYear

from api.bible_content import build_bible_content_payload
from api.calendar_models import CalendarDay
from api.calendar_serializers import CalendarDaySerializer
from api.content_update_models import OfflineContentChange, OfflineContentSnapshot
from api.mobile_content import build_mobile_content_payload


def normalized_json(value):
    return json.loads(json.dumps(value, cls=DjangoJSONEncoder, ensure_ascii=False))


def signature(value):
    data = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(data.encode("utf-8")).hexdigest()



def field_changes(before, after, path=()):
    """Minimal path-based JSON changes; equal-length lists preserve item identity."""
    if before == after:
        return []
    if isinstance(before, dict) and isinstance(after, dict):
        changes = []
        for key in sorted(before.keys() - after.keys()):
            changes.append({"op": "remove", "path": [*path, key]})
        for key in sorted(after.keys() - before.keys()):
            changes.append({"op": "set", "path": [*path, key], "value": after[key]})
        for key in sorted(before.keys() & after.keys()):
            changes.extend(field_changes(before[key], after[key], (*path, key)))
        return changes
    if isinstance(before, list) and isinstance(after, list) and len(before) == len(after):
        changes = []
        for index, (old_item, new_item) in enumerate(zip(before, after)):
            changes.extend(field_changes(old_item, new_item, (*path, index)))
        return changes
    return [{"op": "set", "path": list(path), "value": after}]


def delivery_payload(old, value, checksum):
    full = {"kind": "full", "value": value, "checksum": checksum}
    if old is None:
        return full
    patch = {
        "kind": "patch",
        "base_checksum": old.checksum,
        "checksum": checksum,
        "operations": field_changes(old.payload, value),
    }
    if len(json.dumps(patch, ensure_ascii=False)) < len(json.dumps(full, ensure_ascii=False)):
        return patch
    return full

def published_objects(years):
    public = build_mobile_content_payload()
    # The public package contains duplicates for fast lookup; keep its exact shape
    # but publish individual list/maps entries instead of sending the whole file.
    for name in ("categories", "daily_quotes"):
        yield "public", name, normalized_json(public.get(name, []))
    for group in ("category_texts", "texts"):
        for key, value in public.get(group, {}).items():
            yield "public", f"{group}/{key}", normalized_json(value)
    for group in ("prayer_rules", "psalters", "kathismas", "akathists", "canons"):
        content = public.get(group, {})
        if "list" in content:
            yield "public", f"{group}/list", normalized_json(content["list"])
        for lookup in ("by_slug", "by_number"):
            for key, value in content.get(lookup, {}).items():
                yield "public", f"{group}/{lookup}/{key}", normalized_json(value)

    bible = build_bible_content_payload("rst")
    if bible:
        yield "bible", "rst/translation", normalized_json(bible["translation"])
        for book in bible.get("books", []):
            book_meta = {key: value for key, value in book.items() if key != "chapters"}
            yield "bible", f"rst/book/{book['code']}", normalized_json(book_meta)
            for chapter in book.get("chapters", []):
                yield "bible", f"rst/chapter/{book['code']}/{chapter['number']}", normalized_json(chapter)

    dates = CalendarDay.objects.filter(
        date_gregorian__year__in=years
    ).select_related("main_feast", "fast_type").prefetch_related("feasts", "readings").order_by("date_gregorian")
    contexts = {
        lang: {"request": SimpleNamespace(query_params={"lang": lang}, headers={})}
        for lang in ("ru", "uk")
    }
    for day in dates.iterator(chunk_size=64):
        date = day.date_gregorian.isoformat()
        for lang in ("ru", "uk"):
            yield "calendar", f"{date}/{lang}", normalized_json(
                CalendarDaySerializer(day, context=contexts[lang]).data
            )


class Command(BaseCommand):
    help = "Publish changed public records (or establish initial no-download baseline)."

    def add_arguments(self, parser):
        parser.add_argument("--baseline", action="store_true", help="Seed snapshot without publishing a massive initial delta")
        parser.add_argument("--years", nargs="+", type=int, default=None,
                            help="Calendar years; default: all years present in the database")
        parser.add_argument("--bootstrap", action="store_true",
                            help="Publish all existing content as initial events for APKs with unknown baselines")

    def handle(self, *args, **options):
        baseline = options["baseline"]
        years = options["years"]
        bootstrap = options["bootstrap"]
        if years is None:
            years = list(CalendarDay.objects.annotate(
                publication_year=ExtractYear("date_gregorian")
            ).values_list("publication_year", flat=True).distinct().order_by("publication_year"))
        if bootstrap and baseline:
            raise CommandError("--bootstrap and --baseline are mutually exclusive")
        if bootstrap and (OfflineContentSnapshot.objects.exists() or OfflineContentChange.objects.exists()):
            raise CommandError("Bootstrap requires empty publication tables; refusing to replay initial content")
        if not years or any(year < 2000 or year > 2100 for year in years):
            raise CommandError("Invalid calendar years")
        if baseline and (OfflineContentSnapshot.objects.exists() or OfflineContentChange.objects.exists()):
            raise CommandError("Baseline already exists; refusing to reset subscribers' cursors")
        if not baseline and not bootstrap and not OfflineContentSnapshot.objects.exists():
            raise CommandError("First publish requires --baseline (matching APK) or --bootstrap (initial full deltas)")

        # Build once on explicit publication, never on each phone's version check.
        incoming = {}
        for section, key, data in published_objects(years):
            incoming[(section, key)] = (signature(data), data)

        with transaction.atomic():
            current = {
                (row.section, row.object_key): row
                for row in OfflineContentSnapshot.objects.select_for_update().all()
            }
            to_create, to_update, to_delete, changes = [], [], [], []
            for (section, key), (checksum, data) in incoming.items():
                old = current.pop((section, key), None)
                delivery = delivery_payload(old, data, checksum)
                if old is None:
                    to_create.append(OfflineContentSnapshot(
                        section=section, object_key=key, checksum=checksum, payload=data
                    ))
                elif old.checksum != checksum:
                    old.checksum = checksum
                    old.payload = data
                    to_update.append(old)
                else:
                    continue
                if not baseline:
                    changes.append(OfflineContentChange(
                        section=section, object_key=key, operation="upsert", payload=delivery
                    ))
            for old in current.values():
                if old.section == "calendar":
                    # --years is a publication filter, not a delete request.
                    # Preserve snapshots for years omitted from this run.
                    try:
                        year = int(old.object_key[:4])
                    except (TypeError, ValueError):
                        raise CommandError(f"Invalid calendar snapshot key: {old.object_key}")
                    if year not in years:
                        continue
                    raise CommandError("Cannot delete calendar days through delta feed; publish a valid day replacement")
                to_delete.append(old.pk)
                if not baseline:
                    changes.append(OfflineContentChange(
                        section=old.section, object_key=old.object_key,
                        operation="delete", payload=None
                    ))

            if to_create:
                OfflineContentSnapshot.objects.bulk_create(to_create, batch_size=100)
            if to_update:
                OfflineContentSnapshot.objects.bulk_update(
                    to_update, ["checksum", "payload", "updated_at"], batch_size=100
                )
            if to_delete:
                OfflineContentSnapshot.objects.filter(pk__in=to_delete).delete()
            if changes:
                OfflineContentChange.objects.bulk_create(changes, batch_size=100)
        self.stdout.write(self.style.SUCCESS(
            f"Published: baseline={baseline}, bootstrap={bootstrap}, years={years}, total={len(incoming)}, "
            f"new={len(to_create)}, updated={len(to_update)}, deleted={len(to_delete)}, "
            f"delta_events={len(changes)}"
        ))
