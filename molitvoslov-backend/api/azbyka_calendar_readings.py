import re
from dataclasses import dataclass
from datetime import date

import requests
from bs4 import BeautifulSoup


AZBYKA_DAY_URL = "https://azbyka.ru/days/{date}"

GOSPEL_BOOKS = {"Мф", "Мк", "Лк", "Ин"}
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
    r"(?:Мф|Мк|Лк|Ин|Деян|Иак|Пет|Иуд|Рим|Кор|Гал|Еф|Флп|Кол|"
    r"Фес|Сол|Тим|Тит|Флм|Евр)"
)

REFERENCE_RE = re.compile(
    rf"(?P<book>{_BOOK_PART})\.?\s*"
    r"(?P<verses>"
    r"\d+:\d+"
    r"(?:"
    r"[–—-]\d+(?::\d+)?"
    r"|,\d+(?:[–—-]\d+(?::\d+)?)?"
    r")*"
    r")"
    r"(?P<zach>\s*\([^)]*зач[^)]*\))?",
    re.IGNORECASE,
)

SPACE_RE = re.compile(r"\s+")
SERVICE_PREFIX_RE = re.compile(
    r"^(?:"
    r"Лит(?:\.|ургия)?"
    r"|На\s+литургии"
    r")\s*[–—-]?\s*",
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
    value = re.sub(r"\s*\.\s*", ". ", value)
    return value


def reading_kind(book):
    canonical = normalize_book(book)

    if canonical in GOSPEL_BOOKS:
        return "gospel"

    if canonical in APOSTLE_BOOKS:
        return "apostle"

    return None


def _clean_label(value):
    value = normalize_space(value)
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

    lowered = value.lower()
    if lowered in replacements:
        return replacements[lowered]

    return value


def _new_label_from_prefix(prefix):
    prefix = normalize_space(prefix)
    prefix = prefix.strip()

    if not prefix:
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

        # Один и тот же отрывок может встречаться в разных группах —
        # это разные чтения. Удаляем только точный дубль по содержанию.
        duplicate = any(
            existing.kind == reading.kind
            and existing.label == reading.label
            and existing.title == reading.title
            for existing in result
        )
        if not duplicate:
            result.append(reading)

    return result


def _heading_level(tag):
    if not tag or not tag.name or not re.fullmatch(r"h[1-6]", tag.name):
        return None
    return int(tag.name[1])


def extract_readings_text(html):
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

    # Берём первый абзац после заголовка, в котором действительно есть
    # новозаветная ссылка. Пояснительные примечания ниже не импортируем
    # как отдельные чтения.
    for tag in heading.find_all_next():
        tag_level = _heading_level(tag)
        if tag_level is not None and tag_level <= level:
            break

        if tag.name not in {"p", "li"}:
            continue

        text = normalize_space(tag.get_text(" ", strip=True))
        lowered = text.lower()

        if any(stop in lowered for stop in STOP_TEXTS):
            break

        if REFERENCE_RE.search(text):
            return text

    # Fallback для страниц, где чтения завернуты не в <p>.
    chunks = []
    for tag in heading.find_all_next():
        tag_level = _heading_level(tag)
        if tag_level is not None and tag_level <= level:
            break

        if tag.name in {"script", "style", "noscript"}:
            continue

        if tag.name in {"a", "button"}:
            text = normalize_space(tag.get_text(" ", strip=True))
            if text.lower() in STOP_TEXTS:
                break

        if tag.name == "div":
            text = normalize_space(tag.get_text(" ", strip=True))
            if REFERENCE_RE.search(text):
                chunks.append(text)
                break

    if chunks:
        return chunks[0]

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
                    "MolitvoslovCalendarImporter/1.0 "
                    "(personal church-calendar data import)"
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
