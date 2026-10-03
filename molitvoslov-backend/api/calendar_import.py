from calendar import monthrange
import json
import os
import time
from datetime import date
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.db import transaction

from .calendar_localization import same_feast_identity
from .calendar_models import CalendarDay, CalendarFeast, CalendarReading


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
        os.environ.get("CHURCH_CALENDAR_SOURCE_URL", "").strip().rstrip("/") or DEFAULT_SOURCE_URL
    )


def fetch_source_json(endpoint, params=None, language="ru", timeout=None):
    query_params = dict(params or {})
    query_params["language"] = language

    query = urlencode(query_params)
    url = f"{source_url()}/{endpoint.lstrip('/')}"
    if query:
        url = f"{url}?{query}"

    request = Request(
        url,
        headers={
            "Accept": "application/json",
            "Accept-Language": language,
            "User-Agent": "MolitvoslovCalendarImporter/1.1",
        },
    )

    effective_timeout = float(timeout or os.environ.get("CHURCH_CALENDAR_TIMEOUT", "90"))
    retries = max(
        1,
        int(os.environ.get("CHURCH_CALENDAR_RETRIES", "3")),
    )

    last_error = None

    for attempt in range(1, retries + 1):
        try:
            with urlopen(request, timeout=effective_timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as error:
            last_error = error

            if attempt >= retries:
                break

            time.sleep(min(2 * attempt, 5))

    raise last_error


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


def _localized_assignments(data, language):
    suffix = "_uk" if language == "uk" else ""

    return {
        f"title{suffix}": data.get("title") or data.get("short_title") or "",
        f"short_title{suffix}": data.get("short_title") or "",
        f"troparion_title{suffix}": data.get("troparion_title") or "",
        f"troparion_content{suffix}": data.get("troparion_content") or "",
        f"kontakion_title{suffix}": data.get("kontakion_title") or "",
        f"kontakion_content{suffix}": data.get("kontakion_content") or "",
        f"life_title{suffix}": data.get("life_title") or "",
        f"life_content{suffix}": data.get("life_content") or "",
        f"description{suffix}": data.get("description") or "",
    }


def _assign_imported_value(obj, field, value, overwrite_existing=False):
    if value in [None, ""]:
        return False

    current = getattr(obj, field, None)

    if not overwrite_existing and current not in [None, "", [], {}]:
        return False

    if current == value:
        return False

    setattr(obj, field, value)
    return True


def upsert_feast(data, language="ru", overwrite_existing=False):
    if not data:
        return None

    source_id = data.get("id")
    if source_id in [None, ""]:
        return None

    source_id = int(source_id)

    if language == "uk":
        feast = CalendarFeast.objects.filter(source_id=source_id).first()
        if feast is None:
            return None

        incoming_title = data.get("title") or data.get("short_title") or ""
        if not same_feast_identity(feast.title, incoming_title):
            return feast

        changed_fields = []

        for field, value in _localized_assignments(data, language).items():
            if _assign_imported_value(
                feast,
                field,
                value,
                overwrite_existing=overwrite_existing,
            ):
                changed_fields.append(field)

        if changed_fields:
            feast.save(update_fields=[*changed_fields, "updated_at"])

        return feast

    feast, _created = CalendarFeast.objects.get_or_create(
        source_id=source_id,
        defaults={
            "title": data.get("title") or data.get("short_title") or "Память святого",
        },
    )

    _assign_imported_value(
        feast,
        "date_type",
        data.get("date_type"),
        overwrite_existing=overwrite_existing,
    )
    _assign_imported_value(
        feast,
        "celebration_type",
        data.get("celebration_type"),
        overwrite_existing=overwrite_existing,
    )
    _assign_imported_value(
        feast,
        "celebration_rank",
        data.get("celebration_rank"),
        overwrite_existing=overwrite_existing,
    )
    _assign_imported_value(
        feast,
        "julian_month",
        data.get("month"),
        overwrite_existing=overwrite_existing,
    )
    _assign_imported_value(
        feast,
        "julian_day",
        data.get("day"),
        overwrite_existing=overwrite_existing,
    )

    if data.get("easter_offset") is not None:
        _assign_imported_value(
            feast,
            "easter_offset",
            data.get("easter_offset"),
            overwrite_existing=overwrite_existing,
        )

    icon = _icon_url(data)
    _assign_imported_value(
        feast,
        "icon_url",
        icon,
        overwrite_existing=overwrite_existing,
    )

    if data.get("troparion_echo") is not None:
        _assign_imported_value(
            feast,
            "troparion_echo",
            data.get("troparion_echo"),
            overwrite_existing=overwrite_existing,
        )

    if data.get("kontakion_echo") is not None:
        _assign_imported_value(
            feast,
            "kontakion_echo",
            data.get("kontakion_echo"),
            overwrite_existing=overwrite_existing,
        )

    _assign_imported_value(
        feast,
        "all_dates",
        data.get("all_dates") or [],
        overwrite_existing=overwrite_existing,
    )

    for field, value in _localized_assignments(data, language).items():
        if field == "title" and not value:
            value = "Память святого"

        _assign_imported_value(
            feast,
            field,
            value,
            overwrite_existing=overwrite_existing,
        )

    feast.save()
    return feast


def _priority(feast):
    if not feast:
        return -1

    return CELEBRATION_PRIORITY.get(feast.celebration_type or "", 0) + RANK_PRIORITY.get(
        feast.celebration_rank or "", 0
    )


def _day_language_fields(payload, language):
    suffix = "_uk" if language == "uk" else ""

    return {
        f"fast_type_title{suffix}": payload.get("fast_type_title") or "",
        f"fast_name{suffix}": payload.get("fast_name") or "",
        f"fast_description{suffix}": payload.get("fast_description") or "",
        f"summary{suffix}": payload.get("summary") or "",
        f"short_summary{suffix}": payload.get("short_summary") or "",
        f"gospel_title{suffix}": payload.get("gospel_title") or "",
        f"gospel_reading{suffix}": payload.get("gospel_reading") or "",
        f"apostolic_title{suffix}": payload.get("apostolic_title") or "",
        f"apostolic_reading{suffix}": payload.get("apostolic_reading") or "",
    }



def _sync_structured_readings(day, payload, overwrite_existing=False):
    """Создать структурные чтения из старых полей источника, не затирая ручные правки."""

    if day.readings.exists() and not overwrite_existing:
        return

    if overwrite_existing:
        day.readings.all().delete()

    rows = [
        (CalendarReading.KIND_GOSPEL, payload.get("gospel_title") or ""),
        (CalendarReading.KIND_APOSTLE, payload.get("apostolic_title") or ""),
    ]

    for kind, title in rows:
        title = str(title).strip()

        if not title:
            continue

        CalendarReading.objects.create(
            day=day,
            kind=kind,
            title=title,
            order=0,
        )

def upsert_day(payload, language="ru", overwrite_existing=False):
    if not payload or not payload.get("date_gregorian"):
        return None

    target_date = date.fromisoformat(str(payload["date_gregorian"])[:10])
    all_feast_payloads = payload.get("all_feasts") or payload.get("feasts") or []
    main_payload = payload.get("main_feast")

    day, _created = CalendarDay.objects.get_or_create(
        date_gregorian=target_date,
    )

    if language == "ru":
        feast_objects = []

        for feast_payload in all_feast_payloads:
            feast = upsert_feast(
                feast_payload,
                language=language,
                overwrite_existing=overwrite_existing,
            )
            if feast:
                feast_objects.append(feast)

        main_feast = (
            upsert_feast(
                main_payload,
                language=language,
                overwrite_existing=overwrite_existing,
            )
            if main_payload
            else None
        )

        if main_feast and all(feast.source_id != main_feast.source_id for feast in feast_objects):
            feast_objects.insert(0, main_feast)

        if main_feast is None and feast_objects:
            main_feast = max(feast_objects, key=_priority)

        _assign_imported_value(
            day,
            "julian_month",
            payload.get("julian_month"),
            overwrite_existing=overwrite_existing,
        )
        _assign_imported_value(
            day,
            "julian_day",
            payload.get("julian_day"),
            overwrite_existing=overwrite_existing,
        )

        if main_feast and (overwrite_existing or day.main_feast_id is None):
            day.main_feast = main_feast

        _assign_imported_value(
            day,
            "fast_type_code",
            payload.get("fast_type_code"),
            overwrite_existing=overwrite_existing,
        )
    else:
        # Украинский источник используется только как локализация уже
        # импортированной русской канонической записи. Он не должен менять
        # связи дня, главный праздник или структурные поля.
        for feast_payload in all_feast_payloads:
            upsert_feast(
                feast_payload,
                language=language,
                overwrite_existing=overwrite_existing,
            )

        if main_payload:
            upsert_feast(
                main_payload,
                language=language,
                overwrite_existing=overwrite_existing,
            )

    for field, value in _day_language_fields(payload, language).items():
        _assign_imported_value(
            day,
            field,
            value,
            overwrite_existing=overwrite_existing,
        )

    source_payload = dict(day.source_payload or {})
    source_payload.update(
        {
            "weekday": payload.get("weekday"),
            "weekday_name_ru": payload.get("weekday_name_ru"),
            "week_number": payload.get("week_number"),
        }
    )

    imported_languages = set(source_payload.get("imported_languages") or [])
    imported_languages.add(language)
    source_payload["imported_languages"] = sorted(imported_languages)
    day.source_payload = source_payload

    day.save()

    if language == "ru":
        if overwrite_existing or not day.feasts.exists():
            day.feasts.set(feast_objects)

        _sync_structured_readings(
            day,
            payload,
            overwrite_existing=overwrite_existing,
        )

    return day


@transaction.atomic
def import_month_payload(payload, language="ru", overwrite_existing=False):
    imported = 0

    for item in payload.get("days") or []:
        if upsert_day(
            item,
            language=language,
            overwrite_existing=overwrite_existing,
        ):
            imported += 1

    return imported


def _month_has_language(year, month, language):
    rows = CalendarDay.objects.filter(
        date_gregorian__year=year,
        date_gregorian__month=month,
    ).only("source_payload")

    expected = monthrange(year, month)[1]

    if rows.count() < expected:
        return False

    for row in rows:
        imported_languages = set((row.source_payload or {}).get("imported_languages") or [])

        if language in imported_languages:
            continue

        # Старые записи до появления imported_languages
        # считаем русскими только если список языков вообще пуст.
        if language == "ru" and not imported_languages:
            continue

        return False

    return True


def ensure_month(
    year,
    month,
    language="ru",
    force=False,
    overwrite_existing=False,
):
    existing = CalendarDay.objects.filter(
        date_gregorian__year=year,
        date_gregorian__month=month,
    ).count()
    expected = monthrange(year, month)[1]

    if not force and existing >= expected and _month_has_language(year, month, language):
        return existing

    if language == "uk" and not _month_has_language(year, month, "ru"):
        russian_payload = fetch_source_json(
            "month/",
            {"year": year, "month": month},
            language="ru",
        )
        import_month_payload(
            russian_payload,
            language="ru",
            overwrite_existing=overwrite_existing,
        )

    payload = fetch_source_json(
        "month/",
        {"year": year, "month": month},
        language=language,
    )
    return import_month_payload(
        payload,
        language=language,
        overwrite_existing=overwrite_existing,
    )


def sync_month(
    year,
    month,
    languages=("ru", "uk"),
    overwrite_existing=False,
):
    result = {}

    for language in languages:
        result[language] = ensure_month(
            year,
            month,
            language=language,
            force=True,
            overwrite_existing=overwrite_existing,
        )

    return result


def ensure_day(target_date, language="ru", overwrite_existing=False):
    day = CalendarDay.objects.filter(date_gregorian=target_date).first()

    imported_languages = (
        set((day.source_payload or {}).get("imported_languages") or []) if day else set()
    )

    if day:
        if language in imported_languages:
            return day

        # Совместимость со старыми русскими данными,
        # созданными до imported_languages.
        if language == "ru" and not imported_languages:
            return day

    if language == "uk" and (day is None or "ru" not in imported_languages):
        try:
            russian_payload = fetch_source_json(
                "day/",
                {"date": target_date.isoformat()},
                language="ru",
            )
            upsert_day(
                russian_payload,
                language="ru",
                overwrite_existing=overwrite_existing,
            )
        except Exception:
            ensure_month(
                target_date.year,
                target_date.month,
                language="ru",
                overwrite_existing=overwrite_existing,
            )

    try:
        payload = fetch_source_json(
            "day/",
            {"date": target_date.isoformat()},
            language=language,
        )
    except Exception:
        ensure_month(
            target_date.year,
            target_date.month,
            language=language,
            overwrite_existing=overwrite_existing,
        )
        return CalendarDay.objects.filter(date_gregorian=target_date).first()

    return upsert_day(
        payload,
        language=language,
        overwrite_existing=overwrite_existing,
    )
