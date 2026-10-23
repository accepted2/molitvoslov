import re
from dataclasses import dataclass
from datetime import date

import requests
from bs4 import BeautifulSoup


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

    return value


def _new_label_from_prefix(prefix):
    prefix = normalize_space(prefix)
    prefix = prefix.strip()

    if not prefix:
        return None

    # New Azbyka layout: a service heading precedes Liturgy / Apostle / Gospel
    # within a <p>. Respect headings even when previous references precede ";".
    grouped = re.search(
        r"(?:^|;\s*)([^;:]{2,75}):\s*"
        r"(?:(?:Лит\.?|На литургии)\s*[–—-]?\s*)?"
        r"(?:(?:Ап\.?|Ев\.?|Евангелие|Апостол)\s*:\s*)?$",
        prefix, re.I,
    )
    if grouped:
        candidate = _clean_label(grouped.group(1).rsplit(" – ", 1)[-1])
        if candidate.lower() in {"ап.", "ев.", "ап", "ев", "евангелие", "апостол"}:
            return None
        if candidate.lower() in {"рядовое", "рядовые"}:
            return "Ряд."
        if candidate and not candidate.lower().startswith(("в служебных", "если ")):
            return candidate

    # The old Azbyka layout can place "Утр. – Страстотерпцев:"
    # immediately before the first passage.
    morning_group = re.search(
        r"(?:^|[.;]\s*)(?:Утр\.?|На утрени)\s*[–—-]\s*"
        r"([^;:]{2,75}):\s*$", prefix, re.I,
    )
    if morning_group:
        return _clean_label(morning_group.group(1))

    # Отдельный маркер утрени перед первым воскресным Евангелием.
    if re.search(r"(?:^|[.;])\s*(?:Утр\.?|На утрени)\s*[–—-]?\s*$", prefix, re.I):
        return "Утр."

    # "Лит. –" alone does not change a saint/service group.
    if re.search(r"(?:^|[.;])\s*Лит\.?\s*[–—-]?\s*$", prefix, re.I):
        return None

    # Ап.: / Ев.: designate the type of reading, never its group label.
    marker = re.search(r"(?:Ап\.?|Ев\.?|Евангелие|Апостол)\s*:\s*$", prefix, re.I)
    if marker:
        lead = prefix[:marker.start()].strip()
        lead = re.sub(r"(?:Лит\.?|На литургии)\s*[–—-]?\s*$", "", lead, flags=re.I).strip()
        # A heading can be followed by "Лит. –", and can contain dots (Сщмч.).
        group = re.search(r"(?:^|[;]\s*)([^;:]{2,75}):\s*$", lead)
        if group:
            label = _clean_label(group.group(1))
            if label.lower() in {"рядовое", "рядовые"}:
                return "Ряд."
            if label and not label.lower().startswith(("в служебных", "если ")):
                return label
        return None

    # Azbyka's explanatory note is a genuine reading alternate, not a heading.
    if re.search(r"в служебных апостоле и евангелии.*чтения за упокой", prefix, flags=re.I):
        return "За упокой"

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

        # Keep repeated assignments, including identical texts and labels.
        # Different services can legitimately cite the same Scripture passage.
        result.append(reading)

    return result


def _heading_level(tag):
    if not tag or not tag.name or not re.fullmatch(r"h[1-6]", tag.name):
        return None
    return int(tag.name[1])


def extract_readings_text(html):
    soup = BeautifulSoup(html, "lxml")

    # Prefer Azbyka's dedicated readings block. It contains every group
    # (daily, Theotokos, saints), possibly split among several paragraphs.
    groups = soup.select(".readings-text .readings-groups")
    if groups:
        parts = []
        for group in groups:
            # Each <p> is a separate service, usually introduced by <i>name:</i>.
            # Flattening the whole container previously lost the first label and
            # carried the previous label into the next service.
            paragraphs = group.find_all(["p", "li"], recursive=True)
            if not paragraphs:
                paragraphs = [group]
            for paragraph in paragraphs:
                text = normalize_space(paragraph.get_text(" ", strip=True))
                if not REFERENCE_RE.search(text):
                    continue
                heading = paragraph.find("i")
                if heading and not heading.find_parent(["span"]):
                    name = normalize_space(heading.get_text(" ", strip=True)).rstrip(":").strip()
                    if name:
                        if name.lower() in {"рядовое", "рядовые"}:
                            name = "Ряд."
                        # Remove the source header and the first service/type
                        # marker; the remaining Ев./Ап. markers denote types,
                        # not changes to the service assignment.
                        text = text[len(normalize_space(heading.get_text(" ", strip=True))):].strip()
                        text = re.sub(
                            r"^(?:(?:Лит\\.?|На литургии|Утр\\.?|На утрени)\\s*[–—-]?\\s*)?"
                            r"(?:(?:Ап\\.?|Ев\\.?|Апостол|Евангелие)\\s*:\\s*)?",
                            "", text, flags=re.I)
                        text = f"{name}: {text}"
                parts.append(text)
        text = " ; ".join(parts)
        if REFERENCE_RE.search(text):
            return text

    heading = None
    for candidate in soup.find_all(re.compile(r"^h[1-6]$")):
        text = normalize_space(candidate.get_text(" ", strip=True)).lower()
        if "чтения" in text and "священного писания" in text:
            heading = candidate
            break

    if heading is None:
        raise AzbykaReadingsError('Не найден блок "Чтения Священного Писания".')

    level = _heading_level(heading) or 2

    # All consecutive Scripture paragraphs belong to the same reading section.
    # Previously we returned after the first paragraph, dropping subsequent
    # assignments (e.g. Theotokos and martyrs on 2026-11-06).
    chunks = []
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
            chunks.append(text)
        # Non-reference paragraphs can separate normal and optional services.
        # Continue collecting until the next same/higher-level section heading.

    if chunks:
        return " ; ".join(chunks)

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

    # Do not crawl ancestor containers: these may include unrelated Bible
    # references and produce confidently wrong results on exceptional days.
    # If this page has no static passage text, fail closed.
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
