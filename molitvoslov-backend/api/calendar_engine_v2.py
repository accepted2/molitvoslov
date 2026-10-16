"""Молитвослов: year-independent Orthodox calendar engine, version 2.

Computes calendar observances and fasting status.  It deliberately DOES NOT
pretend to calculate daily lectionary pericopes without vetted reading tables.
Date rules are inferred from the curated 2026 CalendarDay linkage. This is an
initial conservative inference and NOT a canonical typikon database.
"""

from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date, timedelta
import re
from typing import Sequence

REFERENCE_YEAR = 2026


def orthodox_pascha(year: int) -> date:
    """Julian computus to Gregorian civil date. Valid only for 1900..2099."""
    if not 1900 <= year <= 2099:
        raise ValueError("Текущая версия Пасхалии поддерживает годы 1900–2099")
    a, b, c = year % 4, year % 7, year % 19
    d = (19 * c + 15) % 30
    e = (2 * a + 4 * b - d + 34) % 7
    month = (d + e + 114) // 31
    day = (d + e + 114) % 31 + 1
    return date(year, month, day) + timedelta(days=13)


def julian_month_day(day: date) -> tuple[int, int]:
    """Return Julian MM/DD in 1900..2099, when Julian-Gregorian offset is 13d."""
    if not 1900 <= day.year <= 2099:
        raise ValueError("Конверсия в старый стиль поддерживает 1900–2099")
    d = day - timedelta(days=13)
    return d.month, d.day


def year_days(year: int):
    for ordinal in range((date(year + 1, 1, 1) - date(year, 1, 1)).days):
        yield date(year, 1, 1) + timedelta(days=ordinal)


def normalize(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").casefold().replace("ё", "е")).strip()


# Explicit signals in title.  These names are calendar events, NOT ordinary saints.
# Never use bare «троиц», «вознесен», «суббота» as saint names can contain them.
PASCHAL_PATTERNS = tuple(
    re.compile(x, re.I)
    for x in (
        r"(?:пасх[аиуые]|светл(?:ой|ая|ую|ые|аго|ым)\s+седмиц|светлое\s+христово\s+воскресение)",
        r"(?:лазарев[а-я]*\s+суббот|вход\s+господень\s+в\s+иерусалим|недел[яиюе]\s+ваий)",
        r"(?:страстн[а-я]*\s+седмиц|велики[йяе]\s+(?:понедельник|вторник|среда|четверг|пятница|суббота))",
        r"(?:преполовени[еяю]|вознесени[еяю]\s+господн|пятидесятниц|день\s+святого\s+духа)",
        r"(?:радониц|антии?пасх|фомин[а-я]*\s+недел|жен[ -]мироносиц)",
        r"(?:недел[яиюе]\s+(?:о\s+)?(?:мытар|блудн|мясопуст|сыропуст|православия|крестопоклон|самарян|расслабленн|слеп|всех\s+святых))",
        r"(?:суббот[аыуе]\s+(?:акафиста|лазарева|троицкая|мясопустная))",
        r"(?:попразднство|отдание|предпразднство)\s+(?:пятидесятниц|вознесени|пасх|преполовени)",
        r"(?:седмиц[а-я]*\s+(?:по\s+пасх|по\s+пятидесятниц|великого\s+поста|сырн|светл))",
        r"(?:собор\s+всех\s+святых|всех\s+святых,?\s+в\s+земл[ея]\s+(?:русск|российск))",
    )
)

SPECIAL_PATTERNS = tuple(
    re.compile(x, re.I)
    for x in (
        r"димитриевск[а-я]*\s+родительск[а-я]*\s+суббот",
        r"(?:неделя|суббота)\s+(?:пред|по|перед|после)\s+(?:воздвижени|рождеств|богоявлени)",
        r"(?:собор\s+новомучеников\s+и\s+исповедников\s+церкви\s+русской)",
        r"переходящее\s+празднование",
    )
)


@dataclass(frozen=True)
class Memorial:
    id: int
    title: str
    source_date: date
    is_reference_main: bool = False
    stored_easter_offset: int | None = None


@dataclass(frozen=True)
class DateRule:
    feast_id: int
    kind: str  # fixed, pascha, weekday, special
    source_date: date
    anchor: tuple[int, int] | int | None
    reason: str
    is_reference_main: bool
    title: str


def classify(memorial: Memorial) -> DateRule:
    title = normalize(memorial.title)
    if any(p.search(title) for p in PASCHAL_PATTERNS):
        delta = (memorial.source_date - orthodox_pascha(REFERENCE_YEAR)).days
        return DateRule(
            memorial.id,
            "pascha",
            memorial.source_date,
            delta,
            "переходящая память по Пасхе",
            memorial.is_reference_main,
            memorial.title,
        )
    if "димитриевская родительская суббота" in title:
        return DateRule(
            memorial.id,
            "weekday",
            memorial.source_date,
            "SAT_BEFORE_NOV8",
            "суббота перед 8 ноября (контроль исключений Типикона обязателен)",
            memorial.is_reference_main,
            memorial.title,
        )
    if "собор новомучеников и исповедников церкви русской" in title:
        return DateRule(
            memorial.id,
            "weekday",
            memorial.source_date,
            "SUN_NEAREST_FEB7",
            "воскресенье, ближайшее к 7 февраля",
            memorial.is_reference_main,
            memorial.title,
        )
    if "переходящее празднование в 1-е воскресенье после 12 июля" in title:
        return DateRule(
            memorial.id,
            "weekday",
            memorial.source_date,
            "SUN_AFTER_JUL12",
            "первое воскресенье строго после 12 июля",
            memorial.is_reference_main,
            memorial.title,
        )
    if any(p.search(title) for p in SPECIAL_PATTERNS):
        return DateRule(
            memorial.id,
            "special",
            memorial.source_date,
            None,
            "особая привязка — не переносить автоматически",
            memorial.is_reference_main,
            memorial.title,
        )
    # An explicitly saved offset should not silently override the title-based
    # classification if it may come from old, inconsistent data; log conflict.
    if memorial.stored_easter_offset is not None:
        return DateRule(
            memorial.id,
            "special",
            memorial.source_date,
            None,
            "есть easter_offset, но название не распознано — требуется проверка",
            memorial.is_reference_main,
            memorial.title,
        )
    return DateRule(
        memorial.id,
        "fixed",
        memorial.source_date,
        julian_month_day(memorial.source_date),
        "неподвижная память: день/месяц по старому стилю",
        memorial.is_reference_main,
        memorial.title,
    )


def rule_target(rule: DateRule, year: int) -> date | None:
    if rule.kind == "special":
        return None
    if rule.kind == "weekday":
        if rule.anchor == "SAT_BEFORE_NOV8":
            anchor = date(year, 11, 8)
            return anchor - timedelta(days=(anchor.weekday() - 5) % 7 or 7)
        if rule.anchor == "SUN_NEAREST_FEB7":
            anchor = date(year, 2, 7)
            return min(
                (anchor + timedelta(days=x) for x in range(-3, 4)),
                key=lambda d: abs((d - anchor).days) if d.weekday() == 6 else 100,
            )
        if rule.anchor == "SUN_AFTER_JUL12":
            anchor = date(year, 7, 12)
            return anchor + timedelta(days=(6 - anchor.weekday()) % 7 or 7)
        return None
    if rule.kind == "pascha":
        day = orthodox_pascha(year) + timedelta(days=rule.anchor)
        return day if day.year == year else None
    jul_month, jul_day = rule.anchor
    # The civil year starts in the preceding Julian year. Try both to find the
    # single date within this Gregorian year. Julian Feb29 needs a reference leap
    # year; this rule can only come from a 2026 ref which lacks it -> report gap.
    for year_j in (year - 1, year):
        try:
            jul_form = date(year_j, jul_month, jul_day)
        except ValueError:
            continue
        greg_form = jul_form + timedelta(days=13)
        if greg_form.year == year:
            return greg_form
    return None


def build_schedule(memorials: Sequence[Memorial], year: int):
    """Build per-year 1:N links from 2026 source IDs without creating any new IDs."""
    if year < REFERENCE_YEAR:
        raise ValueError("Эталонный 2026 и ранние годы генератором не затрагиваем")
    schedule = {day: [] for day in year_days(year)}
    special = []
    unique = set()
    for m in memorials:
        k = (m.source_date, m.id)
        if k in unique:
            continue
        unique.add(k)
        rule = classify(m)
        target = rule_target(rule, year)
        if target is None:
            special.append(rule)
        elif target in schedule and all(r.feast_id != rule.feast_id for r in schedule[target]):
            schedule[target].append(rule)
    # No fictitious feast on Feb 29 Julian (Mar 13 Gregorian in Julian leap years)
    # unless manually defined in the source.
    return schedule, special


def rank_rule(rule: DateRule) -> int:
    title = normalize(rule.title)
    if "светлое христово воскресение" in title or title == "пасха":
        return 500
    if any(
        x in title
        for x in (
            "рождество христово",
            "богоявление господне",
            "крещение господне",
            "сретение господне",
            "благовещение пресвятой",
            "преображение господне",
            "успение пресвятой",
            "воздвижение честного",
            "вознесение господне",
            "пятидесятница",
            "вход господень в иерусалим",
            "рождество пресвятой",
            "введение во храм",
            "покров пресвятой",
        )
    ):
        return 300
    if rule.is_reference_main:
        return 50
    return 0


def pick_main(rules: Sequence[DateRule]) -> int | None:
    if not rules:
        return None
    return sorted(rules, key=lambda r: (-rank_rule(r), r.feast_id))[0].feast_id


@dataclass(frozen=True)
class FastingDay:
    status: str  # fast | fast_free | ordinary | cheese
    period: str
    basis: str
    dietary_detail_verified: bool = False


def calculate_fasting(day: date) -> FastingDay:
    p = orthodox_pascha(day.year)
    delta = (day - p).days
    if -48 <= delta <= -1:
        return FastingDay(
            "fast", "Великий пост" if delta <= -8 else "Страстная седмица", "пасхальный период"
        )
    if 57 <= delta and day <= date(day.year, 7, 11):
        return FastingDay("fast", "Петров пост", "пасхальный период до 12 июля")
    if date(day.year, 8, 14) <= day <= date(day.year, 8, 27):
        return FastingDay("fast", "Успенский пост", "14–27 августа")
    if day >= date(day.year, 11, 28) or day <= date(day.year, 1, 6):
        return FastingDay("fast", "Рождественский пост", "28 ноября – 6 января")
    if day in (date(day.year, 1, 18), date(day.year, 9, 11), date(day.year, 9, 27)):
        return FastingDay(
            "fast", "Однодневный пост", "навечерие Богоявления/Усекновение/Воздвижение"
        )
    if -55 <= delta <= -49:
        return FastingDay("cheese", "Сырная седмица", "без мяса; отдельное правило трапезы")
    if (
        (date(day.year, 1, 7) <= day <= date(day.year, 1, 17))
        or (-69 <= delta <= -63)
        or (0 <= delta <= 6)
        or (50 <= delta <= 56)
    ):
        return FastingDay("fast_free", "Сплошная седмица", "общая отмена среды/пятницы")
    if day.month == 1 and day.day == 19:
        return FastingDay("fast_free", "Богоявление Господне", "великий праздник")
    if day.weekday() in (2, 4):
        return FastingDay("fast", "Однодневный пост", "среда или пятница")
    return FastingDay("ordinary", "", "обычный день")


@dataclass(frozen=True)
class ReadingResult:
    complete: bool
    readings: tuple
    reason: str


def resolve_readings(day: date, rules: dict | None = None) -> ReadingResult:
    """Only emit readings if an independently verified rule explicitly covers day.

    Rules map ISO dates to explicit reading rows. A yearly table of Orthodox
    lectionary pericopes and the Typikon adjustment rules are NOT yet included.
    No 2026-based guess can be stamped as a verified future reading.
    """
    rules = rules or {}
    record = rules.get(day.isoformat())
    if isinstance(record, dict) and record.get("verified") is True and record.get("readings"):
        data = record["readings"]
        if all(
            x.get("kind") in ("gospel", "apostle", "old_testament") and x.get("title") for x in data
        ):
            return ReadingResult(True, tuple(data), "Проверенные чтения из таблицы правил")
    return ReadingResult(False, (), "Не задана проверенная таблица зачал и уставных перестановок")
