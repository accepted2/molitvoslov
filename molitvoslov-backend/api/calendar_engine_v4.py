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
    Correction(3800, "2026-02-21", "Собор всех преподобных отцов, в подвиге просиявших", "pascha", -50, "Azbyka календарные списки 2026, 2027, 2028: Пасха -50"),
    Correction(3919, "2026-03-08", "Собор всех преподобных отцов Киево-Печерских", "pascha", -35, "Azbyka календарные списки 2026, 2027, 2028: Пасха -35"),
    Correction(4189, "2026-04-14", "Мученики Христодул и Анастасия Патрские, убиенные в Ахаии", "pascha", 2, "Azbyka календарные списки 2026, 2027, 2028: Пасха +2"),
    Correction(4190, "2026-04-14", "Преподобномученики отцы Давидо-Гареджийские", "pascha", 2, "Azbyka календарные списки 2026, 2027, 2028: Пасха +2"),
    Correction(4196, "2026-04-15", "Собор преподобных отцов, на Богошественной Горе Синай подвизавшихся", "pascha", 3, "Azbyka календарные списки 2026, 2027, 2028: Пасха +3"),
    Correction(4389, "2026-05-09", "Собор новомучеников, в Бутове пострадавших", "pascha", 27, "Azbyka календарные списки 2026, 2027, 2028: Пасха +27"),
    Correction(4477, "2026-05-21", "Мученики, в долине Ферейдан", "pascha", 39, "Azbyka календарные списки 2026, 2027, 2028: Пасха +39"),
    Correction(4546, "2026-05-28", "Преподобный Давид Гареджийский", "pascha", 46, "Azbyka календарные списки 2026, 2027, 2028: Пасха +46"),
    Correction(4749, "2026-06-21", "Собор святых Санкт-Петербургской митрополии", "pascha", 70, "Azbyka календарные списки 2026, 2027, 2028: Пасха +70"),
    Correction(4750, "2026-06-21", "Собор святых Удмуртской земли", "pascha", 70, "Azbyka календарные списки 2026, 2027, 2028: Пасха +70"),
    Correction(4752, "2026-06-21", "Собор святых Чувашской митрополии", "pascha", 70, "Azbyka календарные списки 2026, 2027, 2028: Пасха +70"),
    Correction(3943, "2026-03-13", "Преподобный Кассиан (Иоанн Кассиан) Римлянин, иеромонах", "julian_feb_last_day", None, "Azbyka 2026-03-13, 2027-03-13, 2028-03-13: последний день февраля ст. ст."),
    Correction(3948, "2026-03-13", "Преподобный Иоанн (Варсонофий) Нитрийский, епископ Дамасский, отшельник", "julian_feb_last_day", None, "Azbyka 2026-03-13, 2027-03-13, 2028-03-13: последний день февраля ст. ст."),
    Correction(3949, "2026-03-13", "Исповедник Феоктирист (Феостирикт) Медикийский", "julian_feb_last_day", None, "Azbyka 2026-03-13, 2027-03-13, 2028-03-13: последний день февраля ст. ст."),
    Correction(3950, "2026-03-13", "Икона Богородицы Девпетерувская", "julian_feb_last_day", None, "Azbyka 2026-03-13, 2027-03-13, 2028-03-13: последний день февраля ст. ст."),
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
    if rule.kind == "julian_feb_last_day":
        # In the supported range 1900..2099 the Julian/Gregorian gap is
        # 13 days. The last Julian February day is Feb 28 (ordinary) or
        # Feb 29 (Julian leap); both map to March 13 civil.
        if not 1900 <= year <= 2099:
            raise ValueError("Последний день февраля по юлианскому стилю: 1900–2099")
        return date(year, 3, 13)
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
    # Great observances outside the twelve: below Pascha / the Twelve,
    # but above ordinary saints and inherited reference-year main flags.
    if "покров пресвятой богородицы" in title:
        return 900
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
    """Choose the day banner by verified high feast rank, then 2026 main.

    A Great Feast is never displaced by an unrelated reference-year saint.
    The 2026 main assignment is a *fallback*, not a veto against a feast
    of known higher rank. Equal-priority contenders remain review blockers:
    no arbitrary smallest-PK winner is possible.
    """
    if not rules:
        return None, []

    highest_score = max(main_priority_v4(r) for r in rules)
    if highest_score >= 650:
        # Explicit liturgical observances (Pascha, Twelve, great feast,
        # known movable days) outrank inherited reference-year main flags.
        candidates = [r for r in rules if main_priority_v4(r) == highest_score]
    else:
        # For ordinary saints, preserve the 2026 reference main whenever
        # it still occurs on the new day. It may not, when a movable feast
        # shifts to another date.
        candidates = [r for r in rules if r.is_reference_main] or list(rules)

    maxscore = max(main_priority_v4(r) for r in candidates)
    leaders = sorted({r.feast_id for r in candidates if main_priority_v4(r) == maxscore})
    if len(leaders) > 1:
        return None, leaders
    return leaders[0], []
