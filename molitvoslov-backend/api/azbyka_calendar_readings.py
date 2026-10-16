import re
from dataclasses import dataclass
from datetime import date

import requests
from bs4 import BeautifulSoup

from api.calendar_reading_identity import normalized_reading_key


AZBYKA_DAY_URL = "https://azbyka.ru/days/{date}"

GOSPEL_BOOKS = {"Мф", "Мк", "Лк", "Ин"}
# Canonical abbreviations used by Azbyka's liturgical lectionary.
# Only names that actually occur in source references are normalized below.
OLD_TESTAMENT_BOOKS = {
    "Быт",
    "Исх",
    "Лев",
    "Чис",
    "Втор",
    "Нав",
    "Суд",
    "Руф",
    "1Цар",
    "2Цар",
    "3Цар",
    "4Цар",
    "1Пар",
    "2Пар",
    "Езд",
    "Неем",
    "Есф",
    "Иов",
    "Пс",
    "Притч",
    "Еккл",
    "Песн",
    "Прем",
    "Сир",
    "Ис",
    "Иер",
    "Плач",
    "Вар",
    "Иез",
    "Дан",
    "Ос",
    "Иоил",
    "Ам",
    "Авд",
    "Ион",
    "Мих",
    "Наум",
    "Авв",
    "Соф",
    "Агг",
    "Зах",
    "Мал",
}
APOSTLE_BOOKS = {
    "Деян",
    "Иак",
    "1Пет",
    "2Пет",
    "1Ин",
    "2Ин",
    "3Ин",
    "Иуд",
    "Рим",
    "1Кор",
    "2Кор",
    "Гал",
    "Еф",
    "Флп",
    "Кол",
    "1Фес",
    "2Фес",
    "1Сол",
    "2Сол",
    "1Тим",
    "2Тим",
    "Тит",
    "Флм",
    "Евр",
}

_BOOK_PART = (
    r"(?:[123]\s*)?"
    r"(?:Притч|Плач|Песн|Прем|Еккл|Втор|Неем|Иоил|Наум|Зах|Мал|Быт|Исх|Лев|Чис|Нав|Суд|Руф|Цар|Пар|Езд|Есф|Иов|Пс|Сир|Ис|Иер|Вар|Иез|Дан|Ос|Ам|Авд|Ион|Мих|Авв|Соф|Агг|Мф|Мк|Лк|Ин|Деян|Иак|Пет|Иуд|Рим|Кор|Гал|Еф|Флп|Кол|"
    r"Фес|Сол|Тим|Тит|Флм|Евр)"
)

REFERENCE_RE = re.compile(
    rf"(?P<book>{_BOOK_PART})\.?\s*"
    r"(?P<verses>"
    r"\d+:\d+"
    r"(?:"
    r"[–—-]\d+(?::\d+)?"
    r"|,\d+(?::\d+)?(?:[–—-]\d+(?::\d+)?)?"
    r")*"
    r")"
    r"(?P<zach>\s*\([^)]*зач[^)]*\))?",
    re.IGNORECASE,
)

SPACE_RE = re.compile(r"\s+")
SERVICE_PREFIX_RE = re.compile(
    r"^(?:" r"Лит(?:\.|ургия)?" r"|На\s+литургии" r")\s*[–—-]?\s*",
    re.IGNORECASE,
)

STOP_TEXTS = {
    "богослужебные чтения дня",
    "цитата дня из библии",
    "библия за год",
}


class AzbykaReadingsError(RuntimeError):
    pass


@dataclass(frozen=True)
class ParsedReading:
    kind: str
    label: str
    title: str
    order: int


@dataclass(frozen=True)
class ParsedDayReadings:
    day: date
    url: str
    source_text: str
    readings: tuple[ParsedReading, ...]


def normalize_space(value):
    return SPACE_RE.sub(" ", value or "").strip()


def normalize_book(value):
    return re.sub(r"\s+", "", value or "").replace(".", "")


def normalize_verses(value):
    value = normalize_space(value)
    value = value.replace("—", "–").replace("-", "–")
    return re.sub(r"\s+", "", value)


def normalize_zach(value):
    if not value:
        return ""

    value = normalize_space(value)
    # На странице Азбуки вокруг сокращений иногда появляются пробелы:
    # "( зач. 235)" / "(зач . 235)". В базе храним единый вид.
    value = re.sub(r"\(\s+", "(", value)
    value = re.sub(r"\s+\)", ")", value)
    value = re.sub(r"\s+\.", ".", value)
    value = re.sub(r"\.\s*", ". ", value)
    return value.strip()


def reading_kind(book):
    canonical = normalize_book(book)

    if canonical in GOSPEL_BOOKS:
        return "gospel"

    if canonical in OLD_TESTAMENT_BOOKS:
        return "old_testament"

    if canonical in APOSTLE_BOOKS:
        return "apostle"

    return None


def _clean_label(value):
    value = normalize_space(value)
    value = re.sub(r"\s+\.", ".", value)
    # Не снимаем точку справа: "Ряд.", "Свт.", "Сщмч." — это часть
    # привычной богослужебной подписи.
    value = value.strip(" ;,–—-")
    value = value.lstrip(". ")
    value = SERVICE_PREFIX_RE.sub("", value)
    value = value.strip(" ;,–—-")
    value = value.lstrip(". ")

    replacements = {
        "на утрени": "Утр.",
        "утр": "Утр.",
        "утр.": "Утр.",
    }

    if re.fullmatch(r"ап(?:\.|остол)?", value, flags=re.IGNORECASE):
        return ""
    lowered = value.lower()
    if lowered in replacements:
        return replacements[lowered]
    if lowered == "рядовое":
        return "Ряд."

    return value


def _new_label_from_prefix(prefix):
    prefix = normalize_space(prefix)
    prefix = prefix.strip()

    if not prefix:
        return None

    # Azbyka often prints "Рядовое: Лит. – Ап.: ... . Ев.: ... . Веч. – ...".
    # "Ап." and "Ев." are column labels, not separate liturgical rubrics.
    if re.search(r"(?:^|[.;])\s*(?:Веч\.?|На вечерне)\s*[–—-]?\s*$", prefix, re.I):
        return "Веч."
    prefix = re.sub(r"(?:Лит\.?\s*[–—-]\s*)?(?:Ап|Ев)\.?\s*:\s*$", "", prefix, flags=re.I)
    prefix = normalize_space(prefix)
    if not prefix.strip(" .;"):
        return None

    # Отдельный маркер утрени перед первым воскресным Евангелием.
    if re.search(r"(?:^|[.;])\s*(?:Утр\.?|На утрени)\s*[–—-]?\s*$", prefix, re.I):
        return "Утр."

    # "Лит. –" само по себе не является подписью группы.
    if re.search(r"(?:^|[.;])\s*Лит\.?\s*[–—-]?\s*$", prefix, re.I):
        return ""

    if ":" not in prefix:
        return None

    candidate = prefix.rsplit(":", 1)[0]

    # Берём только последнюю смысловую часть между ссылками.
    candidate = re.split(r"(?<=[;])\s+", candidate)[-1]
    candidate = candidate.lstrip(" .;,")
    candidate = SERVICE_PREFIX_RE.sub("", candidate)

    # Частый формат: ". Лит. – Недели по Воздвижении:"
    candidate = re.sub(r"^Лит\.?\s*[–—-]\s*", "", candidate, flags=re.I)

    # Если перед меткой осталось окончание предыдущего предложения,
    # берём часть после последнего разделителя " – ".
    if " – " in candidate:
        candidate = candidate.rsplit(" – ", 1)[-1]

    candidate = _clean_label(candidate)

    if len(candidate) > 100:
        return None

    return candidate


def parse_readings_text(text):
    text = normalize_space(text)
    matches = list(REFERENCE_RE.finditer(text))

    if not matches:
        return []

    result = []
    current_label = ""
    previous_end = 0

    for index, match in enumerate(matches, start=1):
        prefix = text[previous_end : match.start()]
        new_label = _new_label_from_prefix(prefix)

        if new_label is not None:
            current_label = new_label

        book = normalize_book(match.group("book"))
        kind = reading_kind(book)

        previous_end = match.end()

        if kind is None:
            continue

        verses = normalize_verses(match.group("verses"))
        zach = normalize_zach(match.group("zach"))

        title = f"{book}.{verses}"
        if zach:
            title += f" {zach}"

        reading = ParsedReading(
            kind=kind,
            label=current_label,
            title=title,
            order=index * 10,
        )

        # Same Scripture on the same service must appear only once, even
        # when source rows differ in punctuation, order or a generic label.
        duplicate = any(
            normalized_reading_key(existing) == normalized_reading_key(reading)
            for existing in result
        )
        if not duplicate:
            result.append(reading)

    return result


def _heading_level(tag):
    if not tag or not tag.name or not re.fullmatch(r"h[1-6]", tag.name):
        return None
    return int(tag.name[1])


def _is_readings_paragraph(text):
    """Accept tabulated services, not later conditional prose with Bible quotes."""
    text = normalize_space(text)
    match = REFERENCE_RE.search(text)
    if not match:
        return False

    prefix = text[:match.start()].strip(" •*–—-")
    if not prefix:
        return True  # A bare Bible reference (or pair of references).

    # The source uses paragraphs such as "Субботы: Лит. – Ап.: ...".
    # Short rubrics followed by a colon are day appointments; explanatory
    # sentences ("Если служба полиелейная, читается ...") are NOT.
    if re.match(r"^(?:если|когда|в случае|примечани|см\\.)\\b", prefix, re.I):
        return False

    if ":" in prefix and len(prefix) <= 160:
        return True

    # "Лит. – ..." / "Утр. – ..." / "На веч. – ..." formats may lack ":".
    if re.match(
        r"^(?:лит\\.?|на литургии|утр\\.?|на утрени|веч\\.?|на веч\\.|"
        r"на [1369]-?м часе|ряд\\.?|рядовое|субботы|недели|мч\\.|"
        r"вмч\\.|свт\\.|сщмч\\.|богородицы)\\b",
        prefix, re.I,
    ):
        return True

    return False


def extract_readings_text(html):
    """Extract ALL scripture reading groups belonging to the day section.

    Older implementation returned the FIRST <p> only, silently losing e.g.
    martyr and ordinary readings on 2027-01-16.
    """
    soup = BeautifulSoup(html, "lxml")

    heading = None
    for candidate in soup.find_all(re.compile(r"^h[1-6]$")):
        text = normalize_space(candidate.get_text(" ", strip=True)).lower()
        if "чтения" in text and "священного писания" in text:
            heading = candidate
            break

    if heading is None:
        raise AzbykaReadingsError('Не найден блок "Чтения Священного Писания".')

    level = _heading_level(heading) or 2
    chunks = []
    first_found = False

    # A heading may contain navigation links (which are not readings).
    # Look at every independent <p>/<li> until the NEXT same/higher heading.
    # Avoid processing a wrapper <li> and its child <p> twice.
    for tag in heading.find_all_next():
        tag_level = _heading_level(tag)
        if tag_level is not None and tag_level <= level:
            break

        if tag.name not in {"p", "li"}:
            continue
        if tag.name == "li" and tag.find(["p", "li"]):
            continue
        if tag.name == "p" and tag.find_parent("li") and tag.find_parent("li").find("p") is None:
            continue

        text = normalize_space(tag.get_text(" ", strip=True))
        if not text:
            continue
        lower = text.lower()
        if lower in STOP_TEXTS:
            if first_found:
                break
            continue

        if _is_readings_paragraph(text):
            chunks.append(text)
            first_found = True
            continue

        if first_found:
            # Finish at the first paragraph of explanatory prose. It may
            # itself quote Scripture but must not become a new day's reading.
            if REFERENCE_RE.search(text):
                break
            # Ignore empty controls and short navigation text between groups.
            if len(text) > 120:
                break

    if chunks:
        return " ".join(chunks)

    # Fallback: alternative markup with <div> instead of separate paragraphs.
    # Take one complete div, not nested duplicates of the same content.
    for tag in heading.find_all_next():
        tag_level = _heading_level(tag)
        if tag_level is not None and tag_level <= level:
            break
        if tag.name != "div":
            continue
        text = normalize_space(tag.get_text(" ", strip=True))
        if _is_readings_paragraph(text):
            return text

    raise AzbykaReadingsError("В блоке чтений не найдены поддерживаемые ссылки.")


def fetch_day_readings(day, session=None, timeout=20):
    if not isinstance(day, date):
        raise TypeError("day должен быть datetime.date")

    url = AZBYKA_DAY_URL.format(date=day.isoformat())
    own_session = session is None
    session = session or requests.Session()

    try:
        response = session.get(
            url,
            timeout=timeout,
            headers={
                "User-Agent": (
                    "MolitvoslovCalendarImporter/1.0 " "(personal church-calendar data import)"
                )
            },
        )
        response.raise_for_status()
        source_text = extract_readings_text(response.text)
        readings = tuple(parse_readings_text(source_text))

        if not readings:
            raise AzbykaReadingsError(
                f"На странице {url} не найдено Евангельских/Апостольских чтений."
            )

        return ParsedDayReadings(
            day=day,
            url=url,
            source_text=source_text,
            readings=readings,
        )
    except requests.RequestException as error:
        raise AzbykaReadingsError(f"Не удалось загрузить {url}: {error}") from error
    finally:
        if own_session:
            session.close()
