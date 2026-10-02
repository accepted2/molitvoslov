import re
import unicodedata
from difflib import SequenceMatcher


IDENTITY_SIMILARITY_THRESHOLD = 0.50

_TRANSLATION_TABLE = str.maketrans(
    {
        "ё": "е",
        "і": "и",
        "ї": "и",
        "є": "е",
        "ґ": "г",
        "й": "и",
        "ь": "",
        "ъ": "",
    }
)

_GENERIC_PREFIXES = (
    "свят",
    "мучен",
    "преподоб",
    "священномуч",
    "великомуч",
    "апостол",
    "пророк",
    "епископ",
    "архиепископ",
    "митрополит",
    "патриарх",
    "отц",
    "наш",
    "жити",
    "страдани",
    "памят",
    "преставлен",
    "обретен",
    "мощ",
    "блаженн",
    "праведн",
    "равноапостол",
    "чудотвор",
    "собор",
    "икон",
    "праздн",
    "священ",
)

_GENERIC_WORDS = {
    "и",
    "во",
    "в",
    "на",
    "же",
    "со",
    "с",
    "из",
    "к",
    "у",
    "его",
    "ее",
    "ея",
    "их",
    "для",
    "по",
    "ради",
}


def normalize_feast_identity(value):
    text = unicodedata.normalize("NFKD", str(value or "").lower())
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = text.translate(_TRANSLATION_TABLE)
    text = re.sub(r"[^а-яa-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def feast_identity_terms(value):
    result = []

    for word in normalize_feast_identity(value).split():
        if len(word) < 3 or word in _GENERIC_WORDS:
            continue

        if any(word.startswith(prefix) for prefix in _GENERIC_PREFIXES):
            continue

        result.append(word)

    return result


def feast_identity_similarity(russian_title, localized_title):
    russian = normalize_feast_identity(russian_title)
    localized = normalize_feast_identity(localized_title)

    if not russian or not localized:
        return 1.0

    if russian == localized:
        return 1.0

    russian_terms = " ".join(feast_identity_terms(russian_title))
    localized_terms = " ".join(feast_identity_terms(localized_title))

    if russian_terms and localized_terms:
        return SequenceMatcher(None, russian_terms, localized_terms).ratio()

    return SequenceMatcher(None, russian, localized).ratio()


def same_feast_identity(russian_title, localized_title, threshold=IDENTITY_SIMILARITY_THRESHOLD):
    if not localized_title:
        return True

    if not russian_title:
        return True

    return feast_identity_similarity(russian_title, localized_title) >= threshold
