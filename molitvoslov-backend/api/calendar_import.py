from calendar import monthrange
import json
import os
from datetime import date
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.db import transaction

from .calendar_models import CalendarDay, CalendarFeast


DEFAULT_SOURCE_URL = "https://church-site-backend.onrender.com/api/calendar"

RANK_PRIORITY = {
    "vigil": 50,
    "polyeleos": 40,
    "great_doxology": 30,
    "six_stichera": 20,
    "ordinary": 10,
    "": 0,
}

CELEBRATION_PRIORITY = {
    "great": 100,
    "middle": 60,
    "low": 20,
    "": 0,
}


def source_url():
    return (
        os.environ.get("CHURCH_CALENDAR_SOURCE_URL", "").strip().rstrip("/")
        or DEFAULT_SOURCE_URL
    )


def fetch_source_json(endpoint, params=None, timeout=25):
    query = urlencode(params or {})
    url = f"{source_url()}/{endpoint.lstrip('/')}"
    if query:
        url = f"{url}?{query}"

    request = Request(
        url,
        headers={
            "Accept": "application/json",
            "Accept-Language": "ru",
            "User-Agent": "MolitvoslovCalendarImporter/1.0",
        },
    )

    with urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def _icon_url(data):
    if not data:
        return ""

    main_icon = data.get("main_icon")
    if isinstance(main_icon, str) and main_icon:
        return main_icon

    direct = data.get("icon")
    if isinstance(direct, str) and direct:
        return direct

    icons = data.get("icons") or []
    if icons:
        ordered = sorted(
            icons,
            key=lambda item: (
                0 if item.get("is_main") else 1,
                int(item.get("order") or 0),
                int(item.get("id") or 0),
            ),
        )
        image = ordered[0].get("image")
        if image:
            return image

    return ""


def upsert_feast(data):
    if not data:
        return None

    source_id = data.get("id")
    if source_id in [None, ""]:
        return None

    defaults = {
        "date_type": data.get("date_type") or "",
        "celebration_type": data.get("celebration_type") or "",
        "celebration_rank": data.get("celebration_rank") or "",
        "title": data.get("title") or data.get("short_title") or "Память святого",
        "short_title": data.get("short_title") or "",
        "julian_month": data.get("month") or None,
        "julian_day": data.get("day") or None,
        "easter_offset": data.get("easter_offset"),
        "icon_url": _icon_url(data),
        "troparion_title": data.get("troparion_title") or "",
        "troparion_content": data.get("troparion_content") or "",
        "troparion_echo": data.get("troparion_echo") or None,
        "kontakion_title": data.get("kontakion_title") or "",
        "kontakion_content": data.get("kontakion_content") or "",
        "kontakion_echo": data.get("kontakion_echo") or None,
        "life_title": data.get("life_title") or "",
        "life_content": data.get("life_content") or "",
        "description": data.get("description") or "",
        "all_dates": data.get("all_dates") or [],
    }

    feast, _created = CalendarFeast.objects.update_or_create(
        source_id=int(source_id),
        defaults=defaults,
    )
    return feast


def _priority(feast):
    if not feast:
        return -1

    return (
        CELEBRATION_PRIORITY.get(feast.celebration_type or "", 0)
        + RANK_PRIORITY.get(feast.celebration_rank or "", 0)
    )


def upsert_day(payload):
    if not payload or not payload.get("date_gregorian"):
        return None

    all_feast_payloads = payload.get("all_feasts") or payload.get("feasts") or []
    feast_objects = []

    for feast_payload in all_feast_payloads:
        feast = upsert_feast(feast_payload)
        if feast:
            feast_objects.append(feast)

    main_payload = payload.get("main_feast")
    main_feast = upsert_feast(main_payload) if main_payload else None

    if main_feast and all(
        feast.source_id != main_feast.source_id for feast in feast_objects
    ):
        feast_objects.insert(0, main_feast)

    if main_feast is None and feast_objects:
        main_feast = max(feast_objects, key=_priority)

    target_date = date.fromisoformat(str(payload["date_gregorian"])[:10])

    defaults = {
        "julian_month": payload.get("julian_month") or None,
        "julian_day": payload.get("julian_day") or None,
        "main_feast": main_feast,
        "fast_type_code": payload.get("fast_type_code") or "",
        "fast_type_title": payload.get("fast_type_title") or "",
        "fast_name": payload.get("fast_name") or "",
        "fast_description": payload.get("fast_description") or "",
        "summary": payload.get("summary") or "",
        "short_summary": payload.get("short_summary") or "",
        "gospel_title": payload.get("gospel_title") or "",
        "gospel_reading": payload.get("gospel_reading") or "",
        "apostolic_title": payload.get("apostolic_title") or "",
        "apostolic_reading": payload.get("apostolic_reading") or "",
        "source_payload": {
            "weekday": payload.get("weekday"),
            "weekday_name_ru": payload.get("weekday_name_ru"),
            "week_number": payload.get("week_number"),
        },
    }

    day, _created = CalendarDay.objects.update_or_create(
        date_gregorian=target_date,
        defaults=defaults,
    )

    day.feasts.set(feast_objects)
    return day


@transaction.atomic
def import_month_payload(payload):
    imported = 0
    for item in payload.get("days") or []:
        if upsert_day(item):
            imported += 1
    return imported


def ensure_month(year, month):
    existing = CalendarDay.objects.filter(
        date_gregorian__year=year,
        date_gregorian__month=month,
    ).count()
    expected = monthrange(year, month)[1]

    if existing >= expected:
        return existing

    payload = fetch_source_json("month/", {"year": year, "month": month})
    return import_month_payload(payload)


def ensure_day(target_date):
    day = CalendarDay.objects.filter(date_gregorian=target_date).first()
    if day:
        return day

    try:
        payload = fetch_source_json("day/", {"date": target_date.isoformat()})
    except Exception:
        # Month import is a useful fallback if the source day endpoint is asleep
        # or temporarily fails.
        ensure_month(target_date.year, target_date.month)
        return CalendarDay.objects.filter(date_gregorian=target_date).first()

    return upsert_day(payload)
