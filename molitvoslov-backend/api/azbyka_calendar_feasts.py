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
    r"\bепископ\w*\b",
    r"\bмитрополит\w*\b",
    r"\bпресвитер\w*\b",
    r"\bигумен\w*\b",
    r"\bархиепископ\w*\b",
    r"\bсвят\w*\b",
    r"\bотц\w*\b",
    r"\bжитие\b",
    r"\bстрадани\w*\b",
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


def match_key(value):
    return " ".join(_soft_stem(token) for token in normalize_name(value).split())


def similarity(left, right):
    left_key = match_key(left)
    right_key = match_key(right)

    if not left_key or not right_key:
        return 0.0

    if left_key == right_key:
        return 1.0

    left_tokens = set(left_key.split())
    right_tokens = set(right_key.split())
    overlap = len(left_tokens & right_tokens) / max(len(left_tokens | right_tokens), 1)
    sequence = SequenceMatcher(None, left_key, right_key).ratio()

    # Совпадение имени/географического прозвания важнее порядка слов.
    return max(sequence, overlap * 0.9 + sequence * 0.1)


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
    memory_heading = None

    for heading in soup.find_all(HEADING_RE):
        text = tag_text(heading).lower()
        if text in {"день памяти", "дни памяти"}:
            memory_heading = heading
            break

    if memory_heading is None:
        return "", ""

    level = _heading_level(memory_heading) or 2
    parts = []

    for tag in memory_heading.find_all_next():
        tag_level = _heading_level(tag)
        if tag_level is not None and tag_level <= level:
            break

        if tag.name != "p":
            continue

        text = tag_text(tag)
        if not text:
            continue

        # Список дат памяти иногда размечен абзацами — он не является житием.
        if re.fullmatch(r"\d{1,2}\s+[а-яё]+(?:\s*[-–—].*)?", text, re.I):
            continue

        if text not in parts:
            parts.append(text)

    content = "\n\n".join(parts).strip()

    if not content:
        return "", ""

    return f"Житие {saint_title}", content


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

    # Берём только ссылки, которые физически находятся ДО заголовка
    # "Чтения Священного Писания". На sourceline полагаться нельзя:
    # lxml/BeautifulSoup не гарантируют корректные номера строк после парсинга.
    anchors = list(readings_heading.find_all_previous("a", href=True))
    anchors.reverse()

    for anchor in anchors:
        href = normalize_space(anchor.get("href") or "")
        if not href:
            continue

        # Azbyka может отдавать как относительные /days/sv-..., так и
        # абсолютные https://azbyka.ru/days/sv-... ссылки. Смотрим именно
        # path, чтобы query/fragment и форма URL не ломали импорт.
        parsed_href = urlparse(urljoin(AZBYKA_BASE_URL, href))
        path = parsed_href.path.rstrip("/")
        if not re.fullmatch(r"/days/sv-[^/?#]+", path):
            continue

        title = tag_text(anchor)
        if not title:
            continue

        url = urljoin(AZBYKA_BASE_URL, path)
        if url in seen:
            continue

        seen.add(url)
        sources.append(DaySaintLink(title=title, url=url))

    if not sources:
        raise AzbykaFeastError("На странице дня не найдены ссылки на святых.")

    return sources


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

        if lowered.startswith("тропарь") and not values["troparion_content"]:
            content = _next_text_block(heading)
            if content:
                values["troparion_title"] = heading_text
                values["troparion_content"] = content
                voice = VOICE_RE.search(heading_text)
                values["troparion_echo"] = int(voice.group(1)) if voice else None

        if lowered.startswith("кондак") and not values["kontakion_content"]:
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
