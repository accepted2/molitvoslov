"""Safely store Blagovest primary/alternative hymns as separate editable fields.

Legacy UCS-8 font encoding is decoded to Unicode Church Slavonic (for Ponomar),
never paraphrased into Russian. Actual source text is preserved; no hymn is
deleted, including 'Иной тропарь' and 'Иной кондак'.

UCS-8 decoding data: pgmmpk/cslavonic (MIT), originally based on
typiconman/Perl-Lingua-CU. Local table in calendar_ucs8_table.json.
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

HYMNS = ("troparion", "kontakion")
LEGACY_RE = re.compile(
    r"(?:[а-яёіїєѣѡѳѵꙋ][0-9][a-zа-яёіїєѣѡѳѵꙋ]|"
    r"[a-zа-яёіїєѣѡѳѵꙋ][0-9][а-яёіїєѣѡѳѵꙋ]|"
    r"(?:тропaрь|кондaкъ|глaсъ|прпdб|с™и|бжcтвен|є3г))",
    re.IGNORECASE,
)
MIXED_LETTERS_RE = re.compile(
    r"(?=[a-zа-яёіїєѣѡѳѵꙋ]*[a-z])"
    r"(?=[a-zа-яёіїєѣѡѳѵꙋ]*[а-яёіїєѣѡѳѵꙋ])"
    r"[a-zа-яёіїєѣѡѳѵꙋ]{4,}", re.IGNORECASE,
)
ALT_RE = {
    "troparion": re.compile(
        r"^\s*(?:И\$нъ|Инъ|Иной|Інший|И[\u0486\u0300\u0301]*нъ)"
        r"\s+(?:троп[aа]рь|тропар)[^\n]*$", re.I | re.M
    ),
    "kontakion": re.compile(
        r"^\s*(?:И\$нъ|Инъ|Иной|Інший|И[\u0486\u0300\u0301]*нъ)"
        r"\s+(?:конд[aа]къ|кондак)[^\n]*$", re.I | re.M
    ),
}


@lru_cache(maxsize=1)
def _ucs_table():
    table_path = Path(__file__).with_name("calendar_ucs8_table.json")
    result = json.loads(table_path.read_text(encoding="utf-8"))["codepoints"]
    if len(result) != 256:
        raise ValueError("Invalid UCS-8 table: expected 256 entries")
    return result


def decode_ucs8(text: str) -> str:
    """Decode font-encoded text, but leave already readable Unicode alone."""
    if not isinstance(text, str) or not text:
        return text
    if not (LEGACY_RE.search(text) or MIXED_LETTERS_RE.search(text)):
        return text
    table = _ucs_table()
    chars = []
    for character in text:
        try:
            encoded = character.encode("cp1251")
        except UnicodeEncodeError:
            chars.append(character)
            continue
        chars.append(table[encoded[0]])
    return "".join(chars)


def split_alternative(text: str, kind: str) -> tuple[str, str, str] | None:
    """Return (primary, additional title, additional text) without data loss."""
    if not isinstance(text, str) or not text.strip():
        return None
    if kind not in ALT_RE:
        raise ValueError(f"Unsupported hymn kind: {kind}")
    match = ALT_RE[kind].search(text)
    if match is None:
        return None
    primary = text[:match.start()].strip()
    title = match.group().strip()
    alternative = text[match.end():].strip()
    if not primary or not title or not alternative:
        return None
    return primary, title, alternative


def prepare_imported_hymn_fields(assignments: dict[str, str]) -> dict[str, str]:
    """Expand source content into primary/alternative fields, keep RU/UK separate.

    The caller's existing manually_edited_fields safeguards still apply
    individually to every field before saving Django records.
    """
    updated = dict(assignments)
    for kind in HYMNS:
        for suffix in ("", "_uk"):
            key = kind + "_content" + suffix
            title_key = kind + "_title" + suffix
            alt_key = kind + "_alt_content" + suffix
            alt_title_key = kind + "_alt_title" + suffix
            source = updated.get(key) or ""
            extracted = split_alternative(source, kind)
            # Never overwrite a source-supplied alternative with an
            # automatically extracted one, or discard a conflicting stanza.
            if extracted and not updated.get(alt_key):
                primary, title, alternative = extracted
                updated[key] = primary
                updated[alt_key] = alternative
                updated[alt_title_key] = title
            for field in (key, title_key, alt_key, alt_title_key):
                value = updated.get(field)
                if isinstance(value, str) and value:
                    updated[field] = decode_ucs8(value)
    return updated
