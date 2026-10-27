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
from datetime import date
from types import SimpleNamespace

from django.core.management.base import BaseCommand, CommandError
from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction
from django.db.models.functions import ExtractYear
from django.db.models import Q

from api.bible_content import build_bible_content_payload
from api.calendar_models import CalendarDay
from api.calendar_serializers import CalendarDaySerializer
from api.content_update_models import OfflineContentChange, OfflineContentSnapshot
from api.mobile_content import build_mobile_content_payload
from api.models import (Akathist, Text, Canon, PrayerRule, Psalter, Kathisma, Category,
                        CategoryText, PublicAppAsset)
from api.serializers import (AkathistSerializer, AkathistSummarySerializer, TextSerializer,
    CanonSerializer, CanonSummarySerializer, PrayerRuleSerializer, PsalterSerializer,
    KathismaSerializer, CategorySerializer, CategoryTextSerializer)


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
    if old is None or old.payload is None:
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
    for key, value in public.get("app_assets", {}).items():
        yield "public", f"app_assets/{key}", normalized_json(value)
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


def akathist_objects(slug):
    """Only one akathist and its nested Text records, without constructing the full catalog."""
    akathist = (
        Akathist.objects.filter(slug=slug, is_visible=True)
        .select_related("troparion", "kontakion_before")
        .prefetch_related("sections__text__categories")
        .first()
    )
    if akathist is None:
        raise CommandError(f"Visible akathist not found: {slug}")

    detail = normalized_json(AkathistSerializer(akathist).data)
    yield "public", f"akathists/by_slug/{slug}", detail

    text_ids = {
        section.text_id
        for section in akathist.sections.all()
        if section.text_id
    }
    for related_text in (akathist.troparion, akathist.kontakion_before):
        if related_text is not None:
            text_ids.add(related_text.id)
    texts = Text.objects.filter(id__in=text_ids, is_visible=True).prefetch_related("categories")
    for item in TextSerializer(texts, many=True).data:
        yield "public", f"texts/{item['slug']}", normalized_json(item)

    # Small list only: it is needed when a new akathist is published.
    visible = Akathist.objects.filter(is_visible=True).order_by("id")
    summary = normalized_json(AkathistSummarySerializer(visible, many=True).data)
    yield "public", "akathists/list", summary



def scoped_objects(scope, value):
    """Build only the requested public keys; avoid full content, Bible and calendar scans."""
    if scope == "akathist_slug":
        yield from akathist_objects(value)
        return

    def emit_texts(ids):
        rows = Text.objects.filter(pk__in=set(ids), is_visible=True).prefetch_related("categories")
        for data in TextSerializer(rows, many=True).data:
            yield "public", f"texts/{data['slug']}", normalized_json(data)

    if scope == "text_slug":
        obj = Text.objects.filter(slug=value, is_visible=True).first()
        if obj is None:
            raise CommandError(f"Visible text not found: {value}")
        yield from emit_texts([obj.pk])
        # A text can be embedded in several public documents. Publish each impacted view.
        for slug in Akathist.objects.filter(sections__text=obj, is_visible=True).values_list("slug", flat=True).distinct():
            for section, key, data in akathist_objects(slug):
                if key != "akathists/list":
                    yield section, key, data
        for slug in Canon.objects.filter(sections__text=obj, is_visible=True).values_list("slug", flat=True).distinct():
            yield from scoped_objects("canon_slug", slug)
        for slug in PrayerRule.objects.filter(items__text=obj, is_visible=True).values_list("slug", flat=True).distinct():
            yield from scoped_objects("prayer_rule_slug", slug)
        for cat_slug in Category.objects.filter(categorytext__text=obj).values_list("slug", flat=True).distinct():
            yield from scoped_objects("category_slug", cat_slug)
        # Related akathist introductory/concluding texts and default reading rule.
        for slug in Akathist.objects.filter(is_visible=True).filter(
            Q(troparion=obj) |
            Q(kontakion_before=obj)
        ).values_list("slug", flat=True).distinct():
            for section, key, data in akathist_objects(slug):
                if key != "akathists/list":
                    yield section, key, data
        return

    if scope == "canon_slug":
        obj = Canon.objects.filter(slug=value, is_visible=True).prefetch_related("sections__text__categories").first()
        if obj is None:
            raise CommandError(f"Visible canon not found: {value}")
        yield "public", f"canons/by_slug/{value}", normalized_json(CanonSerializer(obj).data)
        yield from emit_texts(s.text_id for s in obj.sections.all() if s.text_id)
        yield "public", "canons/list", normalized_json(
            CanonSummarySerializer(Canon.objects.filter(is_visible=True).order_by("id"), many=True).data)
        return

    if scope == "prayer_rule_slug":
        obj = PrayerRule.objects.filter(slug=value, is_visible=True).prefetch_related(
            "items__text__categories", "items__footnotes", "footnotes").first()
        if obj is None:
            raise CommandError(f"Visible prayer rule not found: {value}")
        data = normalized_json(PrayerRuleSerializer(obj).data)
        yield "public", f"prayer_rules/by_slug/{value}", data
        # Original baseline stores serialized full rules in both keys.
        yield "public", "prayer_rules/list", normalized_json(
            PrayerRuleSerializer(PrayerRule.objects.filter(is_visible=True).prefetch_related(
                "items__text__categories", "items__footnotes", "footnotes").order_by("id"),
                many=True).data)
        yield from emit_texts(item.text_id for item in obj.items.all() if item.text_id)
        return

    if scope == "psalter_slug":
        obj = Psalter.objects.filter(slug=value, is_visible=True).prefetch_related("kathismas__psalms").first()
        if obj is None:
            raise CommandError(f"Visible Psalter not found: {value}")
        yield "public", f"psalters/by_slug/{value}", normalized_json(PsalterSerializer(obj).data)
        yield "public", "psalters/list", normalized_json(
            PsalterSerializer(Psalter.objects.filter(is_visible=True).prefetch_related(
                "kathismas__psalms").order_by("id"), many=True).data)
        return

    if scope == "kathisma_number":
        try:
            number = int(value)
        except (TypeError, ValueError):
            raise CommandError("Kathisma number must be an integer")
        matches = Kathisma.objects.filter(number=number).select_related("psalter").prefetch_related(
            "psalms__verses", "glories__after_psalm", "glories__after_verse")
        if matches.count() != 1:
            raise CommandError("Kathisma number must identify exactly one row; check Psalter duplicates")
        obj = matches.first()
        yield "public", f"kathismas/by_number/{number}", normalized_json(KathismaSerializer(obj).data)
        yield from scoped_objects("psalter_slug", obj.psalter.slug)
        return

    if scope == "category_slug":
        category = Category.objects.filter(slug=value).first()
        if category is None:
            raise CommandError(f"Category not found: {value}")
        rows = CategoryText.objects.filter(category=category).select_related(
            "category", "text").prefetch_related("text__categories").order_by("order", "id")
        yield "public", f"category_texts/{value}", normalized_json(CategoryTextSerializer(rows, many=True).data)
        yield "public", "categories", normalized_json(
            CategorySerializer(Category.objects.all().order_by("order", "id"), many=True).data)
        yield from emit_texts(row.text_id for row in rows)
        return

    if scope == "asset_key":
        obj = PublicAppAsset.objects.filter(key=value).first()
        if obj is None:
            raise CommandError(f"App asset not found: {value}")
        yield "public", f"app_assets/{value}", {
            "image_url": obj.image_url, "title": obj.title, "enabled": obj.enabled}
        return

    if scope in ("calendar_date", "calendar_month", "calendar_year"):
        try:
            if scope == "calendar_date":
                dates = [date.fromisoformat(value)]
                days = CalendarDay.objects.filter(date_gregorian__in=dates)
            elif scope == "calendar_month":
                year, month = map(int, value.split("-"))
                if not (1 <= month <= 12):
                    raise ValueError()
                days = CalendarDay.objects.filter(date_gregorian__year=year, date_gregorian__month=month)
            else:
                year = int(value)
                days = CalendarDay.objects.filter(date_gregorian__year=year)
            selected_year = dates[0].year if scope == "calendar_date" else year
            if not (2000 <= selected_year <= 2100):
                raise ValueError()
        except (TypeError, ValueError):
            raise CommandError(f"Invalid {scope} value: {value}")
        days = days.select_related("main_feast", "fast_type").prefetch_related("feasts", "readings").order_by("date_gregorian")
        if not days.exists():
            raise CommandError(f"No calendar days for {value}")
        contexts = {lang: {"request": SimpleNamespace(query_params={"lang": lang}, headers={})}
                    for lang in ("ru", "uk")}
        for day in days.iterator(chunk_size=64):
            for lang in ("ru", "uk"):
                yield "calendar", f"{day.date_gregorian.isoformat()}/{lang}", normalized_json(
                    CalendarDaySerializer(day, context=contexts[lang]).data)
        return
    raise CommandError(f"Unsupported publication scope: {scope}")



class Command(BaseCommand):
    help = "Publish changed public records (or establish initial no-download baseline)."

    def add_arguments(self, parser):
        parser.add_argument("--text-slug", type=str, default=None)
        parser.add_argument("--canon-slug", type=str, default=None)
        parser.add_argument("--prayer-rule-slug", type=str, default=None)
        parser.add_argument("--psalter-slug", type=str, default=None)
        parser.add_argument("--kathisma-number", type=str, default=None)
        parser.add_argument("--category-slug", type=str, default=None)
        parser.add_argument("--asset-key", type=str, default=None)
        parser.add_argument("--calendar-date", type=str, default=None)
        parser.add_argument("--calendar-month", type=str, default=None)
        parser.add_argument("--calendar-year", type=str, default=None)
        parser.add_argument("--akathist-slug", type=str, default=None,
                            help="Publish only one visible akathist, its texts and the akathist list")
        parser.add_argument("--baseline", action="store_true", help="Seed snapshot without publishing a massive initial delta")
        parser.add_argument("--years", nargs="+", type=int, default=None,
                            help="Calendar years; default: all years present in the database")
        parser.add_argument("--dry-run", action="store_true",
                            help="Estimate publication payload without writing snapshots or events")
        parser.add_argument("--bootstrap", action="store_true",
                            help="Publish all existing content as initial events for APKs with unknown baselines")

    def handle(self, *args, **options):
        baseline = options["baseline"]
        years = options["years"]
        bootstrap = options["bootstrap"]
        scope_args = ("akathist_slug", "text_slug", "canon_slug", "prayer_rule_slug",
                      "psalter_slug", "kathisma_number", "category_slug", "asset_key",
                      "calendar_date", "calendar_month", "calendar_year")
        selected = [(name, options[name]) for name in scope_args if options[name] is not None]
        if len(selected) > 1:
            raise CommandError("Select only one scoped publication flag")
        scope, value = selected[0] if selected else (None, None)
        target_akathist = options["akathist_slug"]
        if scope and (baseline or bootstrap):
            raise CommandError("--akathist-slug cannot be combined with --baseline or --bootstrap")
        if scope and options["years"] is not None:
            raise CommandError("--years is not needed for --akathist-slug")

        if years is None and not scope:
            years = list(CalendarDay.objects.annotate(
                publication_year=ExtractYear("date_gregorian")
            ).values_list("publication_year", flat=True).distinct().order_by("publication_year"))
        if bootstrap and baseline:
            raise CommandError("--bootstrap and --baseline are mutually exclusive")
        if bootstrap and (OfflineContentSnapshot.objects.exists() or OfflineContentChange.objects.exists()):
            raise CommandError("Bootstrap requires empty publication tables; refusing to replay initial content")
        if any(year < 2000 or year > 2100 for year in (years or [])):
            raise CommandError("Invalid calendar years")
        if baseline and (OfflineContentSnapshot.objects.exists() or OfflineContentChange.objects.exists()):
            raise CommandError("Baseline already exists; refusing to reset subscribers' cursors")
        if not baseline and not bootstrap and not OfflineContentSnapshot.objects.exists():
            raise CommandError("First publish requires --baseline (matching APK) or --bootstrap (initial full deltas)")

        # Build once on explicit publication, never on each phone's version check.
        incoming = {}
        source = scoped_objects(scope, value) if scope else published_objects(years)
        for section, key, data in source:
            incoming[(section, key)] = (signature(data), data)

        estimated_payload_bytes = sum(
            len(json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
            for _, data in incoming.values()
        )
        self.stdout.write(
            f"Publication scope: years={years}, objects={len(incoming)}, "
            f"uncompressed_json_bytes={estimated_payload_bytes}, "
            f"estimated_initial_mb={estimated_payload_bytes / (1024 * 1024):.1f}"
        )
        if options["dry_run"] and scope:
            existing = {
                (row.section, row.object_key): row.checksum
                for row in OfflineContentSnapshot.objects.filter(
                    section="public",
                    object_key__in=[key for section, key in incoming],
                )
            }
            new_keys = [key for key in incoming if key not in existing]
            changed_keys = [key for key, (checksum, _) in incoming.items()
                            if key in existing and existing[key] != checksum]
            self.stdout.write(
                f"Scoped delta preview: new={len(new_keys)}, updated={len(changed_keys)}, deleted=0"
            )
            for section, key in new_keys:
                self.stdout.write(f"NEW {section} {key}")
            for section, key in changed_keys:
                self.stdout.write(f"UPDATED {section} {key}")
        if options["dry_run"]:
            if baseline:
                baseline_bytes = sum(len(key.encode("utf-8")) + len(section.encode("utf-8")) + 64 for section, key in incoming)
                self.stdout.write(f"Compact baseline checksum/key bytes (excluding DB overhead): {baseline_bytes}")
            self.stdout.write("DRY RUN: no database changes")
            return

        with transaction.atomic():
            snapshot_rows = OfflineContentSnapshot.objects.select_for_update()
            if scope:
                # Lock only snapshots in this scope. Never infer deletions from a partial export.
                from django.db.models import Q as ScopeQ
                selector = ScopeQ(pk__in=[])
                for section, key in incoming:
                    selector |= ScopeQ(section=section, object_key=key)
                snapshot_rows = snapshot_rows.filter(selector)
            current = {
                (row.section, row.object_key): row
                for row in snapshot_rows
            }
            to_create, to_update, to_delete, changes = [], [], [], []
            for (section, key), (checksum, data) in incoming.items():
                old = current.pop((section, key), None)
                delivery = delivery_payload(old, data, checksum)
                if old is None:
                    to_create.append(OfflineContentSnapshot(
                        section=section, object_key=key, checksum=checksum, payload=None if baseline else data
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
            for old in ([] if scope else current.values()):
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
