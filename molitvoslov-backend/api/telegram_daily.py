"""Православная публикация из существующего календаря и синодальной Библии.

Никакой генерации или пересказа богослужебных текстов.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
import re
from typing import Iterable

from .calendar_models import CalendarDay, CalendarReading
from .models import BibleVerse


BOOK_CODES = {
    "мф": "MAT", "мк": "MRK", "лк": "LUK", "ин": "JHN",
    "деян": "ACT", "рим": "ROM", "1кор": "1CO", "2кор": "2CO",
    "гал": "GAL", "еф": "EPH", "флп": "PHP", "кол": "COL",
    "1сол": "1TH", "2сол": "2TH", "1фес": "1TH", "2фес": "2TH",
    "1тим": "1TI", "2тим": "2TI", "тит": "TIT", "флм": "PHM",
    "евр": "HEB", "иак": "JAS", "1пет": "1PE", "2пет": "2PE",
    "1ин": "1JN", "2ин": "2JN", "3ин": "3JN", "иуд": "JUD",
    "откр": "REV", "апок": "REV", "притч": "PRO",
}
MONTHS = (
    "", "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
)
WEEKDAYS = (
    "понедельник", "вторник", "среда", "четверг", "пятница",
    "суббота", "воскресенье",
)


class ScriptureReferenceError(ValueError):
    """Ссылка не может быть однозначно сопоставлена стихам базы."""


@dataclass(frozen=True)
class VerseRange:
    first_chapter: int
    first_verse: int
    last_chapter: int
    last_verse: int


def parse_reference(reference: str) -> tuple[str, list[VerseRange]]:
    """Мф.10:32–33,37–38,19:27–30; Евр.11:33–12:2 и аналоги."""
    normalized = (
        str(reference).replace("\u00a0", " ").replace("–", "-")
        .replace("—", "-").replace("−", "-").strip()
    )
    # Множество календарных ссылок содержит помету зачала:
    # «Лк.10:1–15 (50 зач. )» — это метаданные, не часть ссылки.
    normalized = re.sub(r"\s*\([^()]*\)\s*$", "", normalized)
    matched = re.fullmatch(
        r"\s*([1-3]?\s*[А-Яа-яЁё]+)\.?\s*(\d+\s*:\s*.+?)\s*",
        normalized,
    )
    if not matched:
        raise ScriptureReferenceError(f"Неизвестный формат ссылки: {reference}")
    alias = re.sub(r"\s+", "", matched.group(1)).casefold()
    code = BOOK_CODES.get(alias)
    if not code:
        raise ScriptureReferenceError(f"Неизвестная книга: {matched.group(1)}")

    chapter = None
    spans = []
    for raw_part in matched.group(2).split(","):
        part = re.fullmatch(
            r"\s*(?:(\d+)\s*:\s*)?(\d+)\s*(?:-\s*(?:(\d+)\s*:\s*)?(\d+))?\s*",
            raw_part,
        )
        if not part:
            raise ScriptureReferenceError(f"Неверный диапазон: {reference}")
        if part.group(1):
            chapter = int(part.group(1))
        if chapter is None:
            raise ScriptureReferenceError(f"Не указана глава: {reference}")
        first_verse = int(part.group(2))
        last_chapter = int(part.group(3)) if part.group(3) else chapter
        last_verse = int(part.group(4)) if part.group(4) else first_verse
        if (
            chapter < 1 or first_verse < 1 or last_chapter < chapter
            or last_verse < 1
            or (last_chapter == chapter and last_verse < first_verse)
        ):
            raise ScriptureReferenceError(f"Недопустимый диапазон: {reference}")
        spans.append(VerseRange(chapter, first_verse, last_chapter, last_verse))
        chapter = last_chapter
    return code, spans


def _fetch_range(book_code: str, span: VerseRange) -> list[tuple[int, int, str]]:
    from django.db.models import Q

    base = BibleVerse.objects.filter(
        chapter__book__code=book_code,
        chapter__book__translation__code="rst",
        chapter__book__translation__is_visible=True,
    )
    if span.first_chapter == span.last_chapter:
        query = Q(
            chapter__number=span.first_chapter,
            number__gte=span.first_verse,
            number__lte=span.last_verse,
        )
    else:
        query = (
            Q(chapter__number=span.first_chapter, number__gte=span.first_verse)
            | Q(
                chapter__number__gt=span.first_chapter,
                chapter__number__lt=span.last_chapter,
            )
            | Q(chapter__number=span.last_chapter, number__lte=span.last_verse)
        )

    rows = list(
        base.filter(query)
        .order_by("chapter__number", "number")
        .values_list("chapter__number", "number", "text")
    )
    if not rows or (rows[0][0], rows[0][1]) != (
        span.first_chapter, span.first_verse
    ) or (rows[-1][0], rows[-1][1]) != (
        span.last_chapter, span.last_verse
    ):
        raise ScriptureReferenceError(
            f"В Библии нет полного диапазона {book_code}: {span}"
        )
    if span.first_chapter == span.last_chapter and len(rows) != (
        span.last_verse - span.first_verse + 1
    ):
        raise ScriptureReferenceError(f"В диапазоне пропущены стихи: {span}")
    return rows


def resolve_scripture(reference: str) -> str:
    """Сохраняет порядок и нумерацию всех стихов, включая разрывные чтения."""
    code, spans = parse_reference(reference)
    parts = []
    previous_chapter = None
    for span in spans:
        for chapter, number, body in _fetch_range(code, span):
            prefix = f"{chapter}:{number}" if chapter != previous_chapter else str(number)
            parts.append(f"{prefix}. {body.strip()}")
            previous_chapter = chapter
    return "\n".join(parts)


def proverbs_quote(target_date: date) -> tuple[str, str]:
    """Детерминированная ротация полных стихов Притчей, без ИИ и пересказов."""
    verses = BibleVerse.objects.filter(
        chapter__book__code="PRO",
        chapter__book__translation__code="rst",
        chapter__book__translation__is_visible=True,
    ).order_by("chapter__number", "number").values_list(
        "chapter__number", "number", "text"
    )
    # Начало/конец строки фильтруем, чтобы не брать очевидно обрезанные фразы.
    candidates = [
        (chapter, number, body.strip())
        for chapter, number, body in verses
        if 35 <= len(body.strip()) <= 250
        and body.strip().endswith((".", "!", "?"))
        and not body.lstrip().lower().startswith(("и ", "а ", "но ", "ибо "))
    ]
    if not candidates:
        raise LookupError("Нет подходящих стихов Книги Притчей в базе.")
    index = (target_date - date(target_date.year, 1, 1)).days % len(candidates)
    chapter, number, body = candidates[index]
    return body, f"Притч. {chapter}:{number}"


def _hymn(text: str) -> str:
    return re.sub(r"\n{3,}", "\n\n", text.replace("//", "\n").replace("/", "\n")).strip()


def _main_feast(day: CalendarDay):
    if day.main_feast:
        return day.main_feast
    for item in day.feasts.all():
        if item.life_content or item.troparion_content:
            return item
    return None


def build_daily_publication(target_date: date, all_readings: bool = False):
    """Возвращает (URL иконы, массив сообщений). Не изменяет базу."""
    day = (
        CalendarDay.objects.select_related("main_feast")
        .prefetch_related("readings", "feasts")
        .filter(date_gregorian=target_date)
        .first()
    )
    if day is None:
        raise LookupError(
            f"В базе нет календаря на {target_date.isoformat()}. "
            "Сначала синхронизируйте церковный календарь."
        )
    feast = _main_feast(day)
    label = (
        f"☦️ Православный календарь\n"
        f"{target_date.day} {MONTHS[target_date.month]} {target_date.year}, "
        f"{WEEKDAYS[target_date.weekday()]}"
    )
    if day.julian_month and day.julian_day:
        label += f"\n{day.julian_day} {MONTHS[day.julian_month]} (ст. ст.)"
    if feast:
        label += f"\n\n🕊 {feast.title}"
    if day.fast_name:
        label += f"\n\nПост: {day.fast_name}"
    messages = [label]

    readings = list(day.readings.all())
    for kind, icon, title in (
        (CalendarReading.KIND_GOSPEL, "📖", "Евангелие дня"),
        (CalendarReading.KIND_APOSTLE, "📜", "Апостол дня"),
    ):
        selected = sorted(
            (r for r in readings if r.kind == kind),
            key=lambda r: (r.order, r.pk),
        )
        if not all_readings:
            selected = selected[:1]
        if not selected:
            messages.append(f"{icon} {title}\nЧтение в календаре не указано.")
            continue
        for i, reading in enumerate(selected):
            designation = title if i == 0 else f"Дополнительное чтение: {title}"
            heading = f"{icon} {designation}"
            if reading.label:
                heading += f" ({reading.label})"
            heading += f"\n{reading.title}"
            try:
                passage = resolve_scripture(reading.title)
            except ScriptureReferenceError as error:
                passage = f"⚠️ Полный текст не найден: {error}"
            messages.append(f"{heading}\n\n{passage}")

    quote, source = proverbs_quote(target_date)
    messages.append(f"💬 Мудрость Соломона\n\n{quote}\n\n— {source}")

    if feast:
        if feast.life_content:
            messages.append(
                f"🕊 {feast.life_title or 'Житие / история праздника'}\n\n"
                f"{feast.life_content.strip()}"
            )
        if feast.troparion_content:
            voice = f", глас {feast.troparion_echo}" if feast.troparion_echo is not None else ""
            messages.append(
                f"🙏 {feast.troparion_title or 'Тропарь'}{voice}\n\n"
                f"{_hymn(feast.troparion_content)}"
            )
        if feast.kontakion_content:
            voice = f", глас {feast.kontakion_echo}" if feast.kontakion_echo is not None else ""
            messages.append(
                f"🙏 {feast.kontakion_title or 'Кондак'}{voice}\n\n"
                f"{_hymn(feast.kontakion_content)}"
            )
    return (feast.icon_url if feast else ""), messages


def split_telegram_text(text: str, limit: int = 3900) -> list[str]:
    """Разбивка на сообщения с запасом ниже Telegram 4096 символов."""
    if limit < 100:
        raise ValueError("limit должен быть не меньше 100")
    result = []
    current = ""
    for line in text.splitlines(keepends=True):
        while len(line) > limit:
            candidate = line[:limit]
            boundary = max(candidate.rfind(" "), candidate.rfind("\n"))
            if boundary < limit // 2:
                boundary = limit
            piece, line = line[:boundary].rstrip(), line[boundary:].lstrip()
            if current.strip():
                result.append(current.rstrip())
                current = ""
            if piece:
                result.append(piece)
        if current and len(current) + len(line) > limit:
            result.append(current.rstrip())
            current = ""
        current += line
    if current.strip():
        result.append(current.rstrip())
    return result


def all_message_parts(messages: Iterable[str]) -> list[str]:
    return [
        chunk for message in messages
        for chunk in split_telegram_text(message)
    ]
