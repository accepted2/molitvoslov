"""Publish changed local-reading records only. HTTP GET never builds whole Bible/content."""
import hashlib
import json

from django.db import transaction

from .content_delta_models import PublishedContentItem, PublishedContentChange


def records_for_public(payload):
    result = {}
    for section in ("categories", "daily_quotes"):
        result[(section, "all")] = ([section], payload.get(section, []))
    for section in ("texts", "category_texts"):
        for key, value in (payload.get(section) or {}).items():
            result[(section, str(key))] = ([section, str(key)], value)
    for section in ("prayer_rules", "psalters", "akathists", "canons"):
        bucket = payload.get(section) or {}
        for kind in ("list", "by_slug", "by_number"):
            value = bucket.get(kind)
            if isinstance(value, list):
                for item in value:
                    key = str(item.get("slug") or item.get("id") or "")
                    if key:
                        result[(section + "." + kind, key)] = ([section, kind, key], item)
            elif isinstance(value, dict):
                for key, item in value.items():
                    result[(section + "." + kind, str(key))] = ([section, kind, str(key)], item)
    section = "kathismas"
    for key, value in (payload.get(section, {}).get("by_number") or {}).items():
        result[("kathismas.by_number", str(key))] = ([section, "by_number", str(key)], value)
    return result


def records_for_bible(payload):
    result = {("bible", "translation"): (["translation"], payload["translation"])}
    for book in payload.get("books", []):
        code = str(book["code"])
        metadata = {k: v for k, v in book.items() if k != "chapters"}
        result[("bible.book", code)] = (["books", code], metadata)
        for chapter in book.get("chapters", []):
            num = str(chapter["number"])
            result[("bible.chapter", code + ":" + num)] = (["books", code, "chapters", num], chapter)
    return result


def records_for_calendar(years):
    from .calendar_models import CalendarDay
    from .calendar_serializers import CalendarDaySerializer
    from django.test.client import RequestFactory
    from rest_framework.request import Request

    result = {}
    factory = RequestFactory()
    for year in years:
        days = CalendarDay.objects.filter(date_gregorian__year=year).select_related(
            "main_feast", "fast_type"
        ).prefetch_related("feasts", "readings").order_by("date_gregorian")
        for lang in ("ru", "uk"):
            request = Request(factory.get("/api/calendar/day/", {"lang": lang}))
            for day in days:
                date_key = day.date_gregorian.isoformat()
                key = lang + ":" + date_key
                result[("calendar.day", key)] = (
                    ["calendar", lang, date_key],
                    CalendarDaySerializer(day, context={"request": request}).data,
                )
    return result


def publish_records(records, *, initialize=False):
    """Compare snapshots, emit ordered upsert/delete changes; transactional and idempotent."""
    new_keys = {(scope, key) for scope, key in records}
    scopes = {scope for scope, _key in records}
    with transaction.atomic():
        existing = {
            (item.scope, item.item_key): item
            for item in PublishedContentItem.objects.select_for_update().filter(scope__in=scopes)
        }
        changed = 0
        for (scope, key), (path, value) in sorted(records.items()):
            canonical = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
            checksum = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
            previous = existing.get((scope, key))
            if previous and previous.checksum == checksum:
                continue
            PublishedContentItem.objects.update_or_create(
                scope=scope, item_key=key,
                defaults={"checksum": checksum, "data": value},
            )
            if not initialize:
                PublishedContentChange.objects.create(
                    scope=scope, item_key=key, action="upsert",
                    data={"path": path, "value": value},
                )
            changed += 1
        for (scope, key), previous in existing.items():
            if (scope, key) in new_keys:
                continue
            previous.delete()
            if not initialize:
                PublishedContentChange.objects.create(
                    scope=scope, item_key=key, action="delete",
                    data={"path": path_for_key(scope, key)},
                )
            changed += 1
    return changed


def path_for_key(scope, key):
    if scope in ("categories", "daily_quotes"):
        return [scope]
    if scope == "bible":
        return ["translation"]
    if scope == "bible.book":
        return ["books", key]
    if scope == "bible.chapter":
        book, chapter = key.split(":", 1)
        return ["books", book, "chapters", chapter]
    if scope == "calendar.day":
        lang, day = key.split(":", 1)
        return ["calendar", lang, day]
    if "." in scope:
        section, kind = scope.split(".", 1)
        return [section, kind, key]
    return [scope, key]
