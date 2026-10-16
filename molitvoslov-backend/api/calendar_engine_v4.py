"""Date-rule corrections for known feast commemorations, plus explainable precedence.

No writes. No text copying. Rules are pinned to canonical 2026 feast IDs AND
verified reference titles/dates so accidental DB-ID reuse fails closed.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from api.calendar_engine_v3 import (
    REFERENCE_YEAR,
    DateRule,
    Memorial,
    build_schedule_v3,
    classify_v3,
    normalize,
    orthodox_pascha,
    rule_target,
    year_days,
    calculate_fasting,
    julian_month_day,
    resolve_readings,
)


@dataclass(frozen=True)
class Correction:
    feast_id: int
    source_date: str
    title: str
    kind: str
    anchor: int | str
    evidence: str


# References documented in README. Do not infer movable observances from
# simply containing a word such as "Собор" or "икона".
CONFIRMED_CORRECTIONS = (
    Correction(4627, "2026-06-07", "Всех святых", "pascha", 56, "Неделя 1-я по Пятидесятнице"),
    Correction(
        4631,
        "2026-06-07",
        "Собор мучеников Холмских и Подляшских",
        "weekday",
        "SUN_AFTER_JUN1",
        "Первое воскресенье июня, после 1 июня",
    ),
    Correction(
        4634,
        "2026-06-07",
        "Икона Богородицы Умягчение злых сердец",
        "pascha",
        56,
        "Неделя Всех святых",
    ),
    Correction(
        4635, "2026-06-07", "Икона Богородицы Нерушимая Стена", "pascha", 56, "Неделя Всех святых"
    ),
    Correction(
        4688,
        "2026-06-14",
        "Собор всех преподобных и Богоносных отцов, во Святой Горе Афонской просиявших",
        "pascha",
        63,
        "Неделя 2-я по Пятидесятнице",
    ),
    Correction(
        4818,
        "2026-06-28",
        "Собор преподобных отцов Псково-Печерских",
        "pascha",
        77,
        "Неделя 4-я по Пятидесятнице",
    ),
    Correction(
        4992,
        "2026-07-19",
        "Святитель Арсений, епископ Тверской",
        "weekday",
        "SUN_AFTER_JUL12",
        "Первое воскресенье после 12 июля (особое празднование)",
    ),
    Correction(
        4993,
        "2026-07-19",
        "Собор Тверских святых",
        "weekday",
        "SUN_AFTER_JUL12",
        "Первое воскресенье после 12 июля",
    ),
)
CORRECTIONS_BY_ID = {c.feast_id: c for c in CONFIRMED_CORRECTIONS}


def classify_v4(memory: Memorial) -> DateRule:
    correction = CORRECTIONS_BY_ID.get(memory.id)
    if correction is None:
        return classify_v3(memory)
    if str(memory.source_date) != correction.source_date or normalize(memory.title) != normalize(
        correction.title
    ):
        raise ValueError(
            f"Память {memory.id} не совпадает с проверенным правилом: "
            f"{memory.source_date}, {memory.title}"
        )
    rule = DateRule(
        memory.id,
        correction.kind,
        memory.source_date,
        correction.anchor,
        "Подтверждённое исключение: " + correction.evidence,
        memory.is_reference_main,
        memory.title,
    )
    if target_v4(rule, REFERENCE_YEAR) != memory.source_date:
        raise ValueError(f"Исключение {memory.id} не воспроизводит 2026")
    return rule


def target_v4(rule: DateRule, year: int):
    if rule.kind == "weekday" and rule.anchor == "SUN_AFTER_JUN1":
        june1 = date(year, 6, 1)
        return june1 + timedelta(days=(6 - june1.weekday()) % 7 or 7)
    return rule_target(rule, year)


def build_schedule_v4(memories, year):
    if not REFERENCE_YEAR <= year <= 2099:
        raise ValueError("Поддерживается расчёт 2026–2099; запись 2026 запрещена командой")
    schedule = {day: [] for day in year_days(year)}
    special, visited = [], set()
    for memory in memories:
        key = (memory.source_date, memory.id)
        if key in visited:
            continue
        visited.add(key)
        rule = classify_v4(memory)
        target = target_v4(rule, year)
        if target is None:
            special.append(rule)
        elif target in schedule and all(r.feast_id != rule.feast_id for r in schedule[target]):
            schedule[target].append(rule)
    return schedule, special


def main_priority_v4(rule: DateRule) -> int:
    """Explicit presentation priority, not a claim about the order of services.

    Scores settle clear calendar banner choices; uncertain ties stay blockers.
    """
    title = normalize(rule.title)
    if "светлое христово воскресение" in title or title == "пасха":
        return 1200
    if any(
        s in title
        for s in (
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
        )
    ):
        return 1000
    if "собор новомучеников и исповедников церкви русской" in title:
        return 850
    if "димитриевская родительская суббота" in title:
        return 820
    if rule.kind == "pascha":
        return 750
    if rule.kind == "weekday":
        return 730
    if "попразднство" in title or "отдание" in title:
        return 650
    if rule.is_reference_main:
        return 400
    return 0


def choose_main_v4(rules):
    """Return (main_id, ambiguous_main_ids). Never break priority ties by PK."""
    if not rules:
        return None, []
    candidates = [r for r in rules if r.is_reference_main]
    if not candidates:
        # The only case without an explicitly reference-main card: unique
        # highest rule score or else hard blocker, not guessed ID selection.
        candidates = list(rules)
    maxscore = max(main_priority_v4(r) for r in candidates)
    leaders = sorted({r.feast_id for r in candidates if main_priority_v4(r) == maxscore})
    if len(leaders) > 1:
        return None, leaders
    return leaders[0], []
