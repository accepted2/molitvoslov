"""Conservative cleanup of imported saint lives and liturgical texts.

The importer uses this for SOURCE data only. Manually edited Django fields
are protected separately by calendar_import._assign_imported_value.

Do not treat TM, ® or © in Church-Slavonic/legacy-Ponomar encodings as
trademarks. They are often part of church-text glyph conventions.
"""
from __future__ import annotations

import re

_REMOVABLE_INVISIBLES = "\u200b\u00ad\ufeff\u2060"
_NAV_NAMES = (
    "Акафист", "Акафіст", "Тропарь", "Тропар", "Кондак",
    "Служба в Минее", "Служба в Мінеї",
)
_NAV_PART = "(?:" + "|".join(re.escape(v) for v in _NAV_NAMES) + ")"
_NAV_ROW = re.compile(r"^\s*" + _NAV_PART + r"(?:\s*[·•|]\s*" + _NAV_PART + r")+\s*$", re.I)
_MONTH = (
    r"(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|"
    r"октября|ноября|декабря|січня|лютого|березня|квітня|травня|"
    r"червня|липня|серпня|вересня|жовтня|листопада|грудня)"
)
_DATE_ROW = re.compile(
    r"^\s*\d{1,2}\s+" + _MONTH +
    r"[^\n]{0,175}(?:по\s+ст\.\s*ст\.|за\s+ст\.\s*ст\.)\s*$", re.I,
)
_OLD_DATE_ROW = re.compile(
    r"^\s*(?:Месяца|Місяця|Мiсяця)\s+[^\n]{0,150}"
    r"(?:в\s+\d{1,2}[-–]?[а-яіїєґ]*\s+день\.?|"
    r"(?:на|у)\s+\d{1,2}[-–]?[а-яіїєґ]*\s+день(?:[^\n]*)?)\s*$", re.I,
)
_OTHER_SAINTS = re.compile(
    r"^\s*(?:Інші святі|Другие святые)"
    r"(?:\s+\d{1,2}\s+" + _MONTH + r")?\s*$", re.I,
)
_BLOCK_BREAK = re.compile(r"\n\s*\n+")


def clean_source_field(field: str, value: str) -> str:
    """Remove source webpage chrome; preserve the actual liturgical narrative.

    Only exact front-matter and footer navigation lines are removed.
    No mid-narrative dates, Scripture references, parentheses or footnotes
    are changed. In mixed/ambiguous cases, leave the text unchanged.
    """
    if not isinstance(value, str) or not value:
        return value
    clean = value.translate({ord(char): None for char in _REMOVABLE_INVISIBLES})
    if not field.startswith("life_content"):
        return clean

    blocks = _BLOCK_BREAK.split(clean)
    count = 0
    while count < len(blocks) and (
        _NAV_ROW.fullmatch(blocks[count].strip())
        or _DATE_ROW.fullmatch(blocks[count].strip())
        or _OLD_DATE_ROW.fullmatch(blocks[count].strip())
    ):
        count += 1
    if count:
        blocks = blocks[count:]

    footer_index = None
    for i, block in enumerate(blocks):
        if (_OTHER_SAINTS.fullmatch(block.strip())
                and len("\n\n".join(blocks[:i]).strip()) >= 35):
            footer_index = i
            break
    if footer_index is not None:
        blocks = blocks[:footer_index]

    if count or footer_index is not None:
        candidate = "\n\n".join(blocks).strip()
        if len(candidate) < 30 or (
            len(value) > 150 and len(candidate) < min(80, len(value) * 0.08)
        ):
            return clean
        return candidate
    return clean
