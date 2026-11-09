"""Surgical removal of liturgical *zachalo* footnotes from Ponomar source.

The historic Church Slavonic Scripture words (including the phrase
"Зача́ло є҆ѵⷢ҇лїа" in Mark 1:1) MUST be preserved. Only source Markdown
annotations like "**(Зача́ло 1)**" and "**(Заⷱ҇ 2)**" are removed.
"""
import re
import unicodedata

_ANNOTATION = re.compile(r"\*\*\(\s*([^()\n]{1,45}?)\s*\)\*\*")
_NUMBERED_ZACHALO = re.compile(r"(?:Зачало|За)\s+[0-9]{1,4}", re.IGNORECASE)


def _is_lectionary_annotation(label):
    folded = "".join(
        char for char in unicodedata.normalize("NFD", label)
        if unicodedata.category(char) not in ("Mn", "Me", "Mc")
    )
    return bool(_NUMBERED_ZACHALO.fullmatch(folded))


def strip_lectionary_annotations(value):
    """Return (clean_text, removed_count); don't alter other source strings.

    Retain the original Church Slavonic characters, accents, titla,
    abbreviations, verse numbers and canonical verse wording.
    """
    text = str(value)
    matching = [
        match for match in _ANNOTATION.finditer(text)
        if _is_lectionary_annotation(match.group(1))
    ]
    for match in reversed(matching):
        # Change whitespace only immediately adjacent to the removed marker.
        left, right = text[:match.start()].rstrip(), text[match.end():].lstrip()
        space = " " if left and right else ""
        text = left + space + right
    return text, len(matching)
