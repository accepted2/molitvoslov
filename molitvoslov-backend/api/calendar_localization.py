import re
import unicodedata
from difflib import SequenceMatcher


IDENTITY_SIMILARITY_THRESHOLD = 0.34

_TRANSLATION_TABLE = str.maketrans(
    {
        "ё": "е",
        "і": "и",
        "ї": "и",
        "є": "е",
        "ґ": "г",
        "й": "и",
    }
)


def normalize_feast_identity(value):
    text = unicodedata.normalize("NFKD", str(value or "").lower())
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = text.translate(_TRANSLATION_TABLE)
    text = re.sub(r"[^а-яa-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def feast_identity_similarity(russian_title, localized_title):
    russian = normalize_feast_identity(russian_title)
    localized = normalize_feast_identity(localized_title)

    if not russian or not localized:
        return 1.0

    if russian == localized:
        return 1.0

    return SequenceMatcher(None, russian, localized).ratio()


def same_feast_identity(russian_title, localized_title, threshold=IDENTITY_SIMILARITY_THRESHOLD):
    if not localized_title:
        return True

    if not russian_title:
        return True

    return feast_identity_similarity(russian_title, localized_title) >= threshold
