import re
import unicodedata
from dataclasses import dataclass
from difflib import SequenceMatcher
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup


AZBYKA_BASE_URL = "https://azbyka.ru"
AZBYKA_DAY_URL = "https://azbyka.ru/days/{date}"

HEADING_RE = re.compile(r"^h[1-6]$")
VOICE_RE = re.compile(r"глас\s+(\d+)", re.IGNORECASE)

RANK_PATTERNS = [
    r"\bсвященномуч\w*\b",
    r"\bсщмч\w*\b",
    r"\bсвятител\w*\b",
    r"\bсвт\w*\b",
    r"\bпреподоб\w*\b",
    r"\bпрп\w*\b",
    r"\bмученик\w*\b",
    r"\bмч\w*\b",
    r"\bпророк\w*\b",
    r"\bпрор\w*\b",
    r"\bапостол\w*\b",
    r"\bап\w*\b",
    r"\bблаженн\w*\b",
    r"\bблж\w*\b",
    r"\bправедн\w*\b",
    r"\bправ\w*\b",
    # Церковную должность (епископ, пресвитер и т. п.) НЕ удаляем:
    # она помогает отличить одноимённых святых.
    r"\bсвят\w*\b",
    r"\bотц\w*\b",
    r"\bжитие\b",
    r"\bстрадани\w*\b",
]

HOLINESS_RANKS = [
    ("hieromartyr", [r"\bсвященномуч\w*\b", r"\bсщмч\.?\b"]),
    ("martyr", [r"\bмученик\w*\b", r"\bмч\.?\b"]),
    ("reverend", [r"\bпреподоб\w*\b", r"\bпрп\.?\b"]),
    ("prophet", [r"\bпророк\w*\b", r"\bпрор\.?\b"]),
    ("apostle", [r"\bапостол\w*\b", r"\bап\.?\b"]),
    ("blessed", [r"\bблаженн\w*\b", r"\bблж\.?\b"]),
    ("righteous", [r"\bправедн\w*\b", r"\bправ\.?\b"]),
    ("hierarch", [r"\bсвятител\w*\b", r"\bсвт\.?\b"]),
]

GENERIC_WORDS = {
    "и",
    "во",
    "в",
    "на",
    "от",
    "до",
    "при",
    "из",
    "сего",
    "святаго",
    "святого",
    "святых",
    "память",
    "памяти",
}


class AzbykaFeastError(RuntimeError):
    pass


@dataclass(frozen=True)
class DaySaintLink:
    title: str
    url: str


@dataclass(frozen=True)
class SaintContent:
    title: str
    url: str
    troparion_title: str = ""
    troparion_content: str = ""
    troparion_echo: int | None = None
    kontakion_title: str = ""
    kontakion_content: str = ""
    kontakion_echo: int | None = None
    life_title: str = ""
    life_content: str = ""


@dataclass(frozen=True)
class DayHymnGroup:
    title: str
    troparion_title: str = ""
    troparion_content: str = ""
    troparion_echo: int | None = None
    kontakion_title: str = ""
    kontakion_content: str = ""
    kontakion_echo: int | None = None


@dataclass(frozen=True)
class MatchResult:
    source: DaySaintLink | None
    score: float
    second_score: float
    reason: str = ""


def normalize_space(value):
    return re.sub(r"\s+", " ", value or "").strip()


def tag_text(tag):
    # Не вставляем искусственные пробелы между inline-узлами. На Azbyka
    # ударная гласная внутри слова может быть обёрнута отдельным <span>;
    # get_text(" ", ...) превращал "Фо́ки" в "Ф о ки".
    return normalize_space(tag.get_text("", strip=False))


def strip_accents(value):
    normalized = unicodedata.normalize("NFD", value or "")
    return "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")


def normalize_name(value):
    value = strip_accents(value).lower().replace("ё", "е")
    value = re.sub(r"\([^)]*\)", " ", value)
    value = re.sub(r"\b(?:ок|около|после)?\s*\d{2,4}\b", " ", value)
    value = re.sub(r"[^а-яa-z0-9]+", " ", value)

    for pattern in RANK_PATTERNS:
        value = re.sub(pattern, " ", value)

    tokens = [
        token
        for token in normalize_space(value).split()
        if token not in GENERIC_WORDS and len(token) > 1
    ]

    return " ".join(tokens)


def _soft_stem(token):
    # Нужен не морфологический анализ, а лишь устойчивое сравнение
    # "Синопийскаго" / "Синопского", "Ионы" / "Иона" и подобных форм.
    for ending in (
        "ийскаго",
        "ского",
        "скому",
        "ским",
        "ских",
        "ская",
        "ской",
        "ийский",
        "ский",
        "ого",
        "ему",
        "ами",
        "ями",
        "ов",
        "ев",
        "ей",
        "ой",
        "ий",
        "ый",
        "ая",
        "яя",
        "ое",
        "ее",
        "ы",
        "и",
        "а",
        "я",
        "у",
        "ю",
        "е",
    ):
        if token.endswith(ending) and len(token) - len(ending) >= 3:
            return token[: -len(ending)]
    return token


def holiness_rank(value):
    normalized = strip_accents(value).lower().replace("ё", "е")
    for rank, patterns in HOLINESS_RANKS:
        if any(re.search(pattern, normalized) for pattern in patterns):
            return rank
    return ""


def match_key(value):
    return " ".join(_soft_stem(token) for token in normalize_name(value).split())


def similarity(left, right):
    left_rank = holiness_rank(left)
    right_rank = holiness_rank(right)

    # Самая важная защита от ложных совпадений одноимённых святых:
    # "прп. Иона" не может автоматически стать "прор. Ионой".
    if left_rank and right_rank and left_rank != right_rank:
        return 0.0

    left_key = match_key(left)
    right_key = match_key(right)

    if not left_key or not right_key:
        return 0.0

    if left_key == right_key:
        return 1.0

    left_tokens = set(left_key.split())
    right_tokens = set(right_key.split())
    intersection = left_tokens & right_tokens
    overlap = len(intersection) / max(len(left_tokens | right_tokens), 1)
    sequence = SequenceMatcher(None, left_key, right_key).ratio()
    score = max(sequence, overlap * 0.9 + sequence * 0.1)

    # Старые данные часто содержат короткое имя, а Azbyka — полное:
    # "преподобного Ионы пресвитера" против
    # "прп. Ионы, пресвитера, отца ...".
    # Если совпали чин святости и минимум два значимых токена, короткое
    # название можно считать сильным подмножеством полного.
    if (
        left_rank
        and left_rank == right_rank
        and min(len(left_tokens), len(right_tokens)) >= 2
        and (left_tokens <= right_tokens or right_tokens <= left_tokens)
    ):
        score = max(score, 0.92)

    return score


def find_best_source(local_title, sources, threshold=0.62, margin=0.08):
    ranked = sorted(
        ((similarity(local_title, source.title), source) for source in sources),
        key=lambda item: item[0],
        reverse=True,
    )

    if not ranked:
        return MatchResult(None, 0.0, 0.0, "на странице нет ссылок на святых")

    score, source = ranked[0]
    second_score = ranked[1][0] if len(ranked) > 1 else 0.0

    if score < threshold:
        return MatchResult(
            None,
            score,
            second_score,
            f"низкая уверенность совпадения ({score:.2f})",
        )

    if second_score >= threshold and score - second_score < margin:
        return MatchResult(
            None,
            score,
            second_score,
            (
                "неоднозначное совпадение "
                f"({score:.2f} против {second_score:.2f})"
            ),
        )

    return MatchResult(source, score, second_score)


def _heading_level(tag):
    if not tag or not tag.name or not HEADING_RE.fullmatch(tag.name):
        return None
    return int(tag.name[1])


def _next_text_block(heading):
    level = _heading_level(heading) or 3

    for tag in heading.find_all_next():
        tag_level = _heading_level(tag)
        if tag_level is not None and tag_level <= level:
            return ""

        if tag.name not in {"p", "li"}:
            continue

        text = tag_text(tag)
        if not text:
            continue

        if text.lower().startswith("перевод:"):
            continue

        return text

    return ""


def _collect_life(soup, saint_title):
    headings = list(soup.find_all(HEADING_RE))

    # Обычная страница святого: после "День памяти" часто сразу идёт житие.
    for heading in headings:
        text = tag_text(heading).lower()
        if text not in {"день памяти", "дни памяти"}:
            continue

        level = _heading_level(heading) or 2
        parts = []

        for tag in heading.find_all_next():
            tag_level = _heading_level(tag)
            if tag_level is not None and tag_level <= level:
                break

            if tag.name != "p":
                continue

            value = tag_text(tag)
            if not value:
                continue

            if re.fullmatch(r"\d{1,2}\s+[а-яё]+(?:\s*[-–—].*)?", value, re.I):
                continue

            if value not in parts:
                parts.append(value)

        content = "\n\n".join(parts).strip()
        if content:
            return f"Житие {saint_title}", content

    # Праздники и иконы на Azbyka устроены иначе:
    # "Историческое содержание" / "История". Эти тексты сохраняем в
    # life_* — в приложении это тот же разворачиваемый информационный блок.
    for heading in headings:
        text = tag_text(heading).lower()
        if text not in {"историческое содержание", "история"}:
            continue

        level = _heading_level(heading) or 2
        parts = []

        for tag in heading.find_all_next():
            tag_level = _heading_level(tag)
            if tag_level is not None and tag_level <= level:
                break

            if tag.name != "p":
                continue

            value = tag_text(tag)
            if value and value not in parts:
                parts.append(value)

        content = "\n\n".join(parts).strip()
        if content:
            return f"История: {saint_title}", content

    return "", ""


def extract_day_saint_links(html):
    soup = BeautifulSoup(html, "lxml")

    readings_heading = None
    for heading in soup.find_all(HEADING_RE):
        text = tag_text(heading).lower()
        if "чтения" in text and "священного писания" in text:
            readings_heading = heading
            break

    if readings_heading is None:
        raise AzbykaFeastError('Не найден блок "Чтения Священного Писания".')

    sources = []
    seen = set()

    # В календарном списке Azbyka бывают разные типы карточек:
    # /days/sv-*       — один святой
    # /days/svv-*      — собор/группа святых
    # /days/prazdnik-* — праздник
    # /days/ikona-*    — икона Божией Матери
    #
    # Поэтому нельзя ограничиваться только /days/sv-* — иначе, например,
    # 6 октября пропадут Зачатие Иоанна Предтечи, Ксанфиппа и Поликсения,
    # Андрей/Иоанн/Пётр/Антонин и Словенская икона.
    list_items = list(readings_heading.find_all_previous("li"))
    list_items.reverse()

    allowed_path = re.compile(
        r"^/days/(?:sv|svv|prazdnik|ikona)-[^/?#]+$"
    )

    for item in list_items:
        source_url = ""

        for anchor in item.find_all("a", href=True):
            href = normalize_space(anchor.get("href") or "")
            if not href:
                continue

            parsed_href = urlparse(urljoin(AZBYKA_BASE_URL, href))
            path = parsed_href.path.rstrip("/")

            if not allowed_path.fullmatch(path):
                continue

            source_url = urljoin(AZBYKA_BASE_URL, path)
            break

        if not source_url:
            continue

        # Берём текст всего <li>, а не только <a>. Это важно для записей
        # вида "Иконы Божией Матери: Словенская (1635)", где префикс
        # находится вне ссылки.
        title = tag_text(item)
        if not title:
            continue

        if source_url in seen:
            continue

        seen.add(source_url)
        sources.append(DaySaintLink(title=title, url=source_url))

    if not sources:
        raise AzbykaFeastError(
            "На странице дня не найдены карточки памятей/праздников."
        )

    return sources

def extract_day_hymn_groups(html):
    soup = BeautifulSoup(html, "lxml")
    groups = []

    for heading in soup.find_all("h2"):
        title = tag_text(heading)
        lowered = title.lower()

        if not title or (
            "тропари, кондаки" in lowered
            or "чтения священного писания" in lowered
        ):
            continue

        values = {
            "troparion_title": "",
            "troparion_content": "",
            "troparion_echo": None,
            "kontakion_title": "",
            "kontakion_content": "",
            "kontakion_echo": None,
        }

        # На странице дня имя святого/праздника обычно H2, а сами
        # "Тропарь..." / "Кондак..." — H3 до следующего H2.
        for child in heading.find_all_next():
            if child is not heading and child.name == "h2":
                break

            if child.name != "h3":
                continue

            hymn_title = tag_text(child)
            hymn_lower = hymn_title.lower()
            content = _next_text_block(child)
            if not content:
                continue

            voice = VOICE_RE.search(hymn_title)
            echo = int(voice.group(1)) if voice else None

            if (
                re.match(r"^(?:и\s+)?тропарь\b", hymn_lower)
                and not values["troparion_content"]
            ):
                values["troparion_title"] = hymn_title
                values["troparion_content"] = content
                values["troparion_echo"] = echo
            elif (
                re.match(r"^(?:и\s+)?кондак\b", hymn_lower)
                and not values["kontakion_content"]
            ):
                values["kontakion_title"] = hymn_title
                values["kontakion_content"] = content
                values["kontakion_echo"] = echo

        if values["troparion_content"] or values["kontakion_content"]:
            groups.append(DayHymnGroup(title=title, **values))

    return groups


def find_best_hymn_group(local_title, groups, threshold=0.62, margin=0.08):
    sources = [
        DaySaintLink(title=group.title, url=str(index))
        for index, group in enumerate(groups)
    ]
    result = find_best_source(
        local_title,
        sources,
        threshold=threshold,
        margin=margin,
    )

    if result.source is None:
        return None, result

    return groups[int(result.source.url)], result


def extract_saint_content(html, url=""):
    soup = BeautifulSoup(html, "lxml")

    h1 = soup.find("h1")
    if h1 is None:
        raise AzbykaFeastError(f"На странице святого нет H1: {url}")

    title = tag_text(h1)

    values = {
        "troparion_title": "",
        "troparion_content": "",
        "troparion_echo": None,
        "kontakion_title": "",
        "kontakion_content": "",
        "kontakion_echo": None,
    }

    for heading in soup.find_all(HEADING_RE):
        heading_text = tag_text(heading)
        lowered = heading_text.lower()

        if (
            re.match(r"^(?:и\s+)?тропарь\b", lowered)
            and not values["troparion_content"]
        ):
            content = _next_text_block(heading)
            if content:
                values["troparion_title"] = heading_text
                values["troparion_content"] = content
                voice = VOICE_RE.search(heading_text)
                values["troparion_echo"] = int(voice.group(1)) if voice else None

        if (
            re.match(r"^(?:и\s+)?кондак\b", lowered)
            and not values["kontakion_content"]
        ):
            content = _next_text_block(heading)
            if content:
                values["kontakion_title"] = heading_text
                values["kontakion_content"] = content
                voice = VOICE_RE.search(heading_text)
                values["kontakion_echo"] = int(voice.group(1)) if voice else None

    life_title, life_content = _collect_life(soup, title)

    return SaintContent(
        title=title,
        url=url,
        life_title=life_title,
        life_content=life_content,
        **values,
    )


def _get(session, url, timeout):
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
        return response.text
    except requests.RequestException as error:
        raise AzbykaFeastError(f"Не удалось загрузить {url}: {error}") from error


def fetch_day_hymn_groups(day, session=None, timeout=20):
    url = AZBYKA_DAY_URL.format(date=day.isoformat())
    own_session = session is None
    session = session or requests.Session()

    try:
        html = _get(session, url, timeout)
        return extract_day_hymn_groups(html)
    finally:
        if own_session:
            session.close()


def fetch_day_saint_links(day, session=None, timeout=20):
    url = AZBYKA_DAY_URL.format(date=day.isoformat())
    own_session = session is None
    session = session or requests.Session()

    try:
        html = _get(session, url, timeout)
        return extract_day_saint_links(html)
    finally:
        if own_session:
            session.close()


def fetch_saint_content(url, session=None, timeout=20):
    own_session = session is None
    session = session or requests.Session()

    try:
        html = _get(session, url, timeout)
        return extract_saint_content(html, url=url)
    finally:
        if own_session:
            session.close()
