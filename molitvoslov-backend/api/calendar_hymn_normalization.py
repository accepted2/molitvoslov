"""Lossless source-hymn normalization for calendar feast records.

Convert legacy UCS-8 into real Church Slavonic Unicode (for Ponomar).
Split "Инъ тропарь" / "Инъ кондак" into separate editable fields.
Preserve liturgical wording; do not transliterate or translate to Russian.
Only source import and explicitly approved offline cleanup use these helpers.

UCS and titlo mappings: cslavonic, MIT, https://github.com/pgmmpk/cslavonic
"""
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

_MAPPING = json.loads(
    (Path(__file__).with_name("calendar_ucs_mapping.json")).read_text(encoding="utf-8")
)
_UCS = _MAPPING["ucs_table"]
assert len(_UCS) == 256

_MIXED = re.compile(
    r"[а-яёіїєѣѡѳѵꙋ]\d[A-Za-zа-яёіїєѣѡѳѵꙋ]"
    r"|[A-Za-zа-яёіїєѣѡѳѵꙋ]\d[а-яёіїєѣѡѳѵꙋ]"
    r"|[џћњѓѕґ][A-Za-zа-яёіїє\d]{2,}"
    r"|тропaрь|кондaкъ|глaсъ|бжcтвен|прпdб|іи3|є3г|с™и",
    re.IGNORECASE,
)
_LETTERS = re.compile(
    r"(?=[a-zA-Zа-яёіїєѣѡѳѵꙋ]*[a-zA-Z])"
    r"(?=[a-zA-Zа-яёіїєѣѡѳѵꙋ]*[а-яёіїєѣѡѳѵꙋ])"
    r"[a-zA-Zа-яёіїєѣѡѳѵꙋ]{4,}",
    re.IGNORECASE,
)
_CHURCH_UNICODE = re.compile(
    r"[\u0300-\u036f\u0483\u0486\u0487\u2de0-\u2dffѣѡѻѿꙋꙗѧѵѳѯѱ]",
    re.IGNORECASE,
)


def is_legacy_ucs(text):
    return isinstance(text, str) and bool(_MIXED.search(text) or _LETTERS.search(text))


def ucs_to_unicode(text):
    """Use the cp1251 glyph's byte offset in the historical UCS font."""
    if not isinstance(text, str):
        return text
    result = []
    for char in text:
        try:
            encoded = char.encode("cp1251")
        except UnicodeEncodeError:
            result.append(char)
            continue
        result.append(_UCS[encoded[0]] if len(encoded) == 1 else char)
    return "".join(result)


def _fold(text):
    chars = unicodedata.normalize("NFD", text)
    chars = "".join(
        char for char in chars
        if not unicodedata.combining(char)
        and not ("\u2de0" <= char <= "\u2dff")
    )
    return chars.lower().replace("ѣ", "е").replace("ѡ", "о").replace("ꙋ", "у")


def _is_alternate_header(block, hymn):
    folded = _fold(block.strip())
    target = "тропар" if hymn == "troparion" else "кондак"
    return bool(
        re.match(r"^(?:инъ?|иной|иныи|інший|іншій)\s+" + target, folded)
    )


def _is_podoben(block):
    return bool(re.match(r"^(?:подобенъ?|подобный)(?:\s|:|$)", _fold(block.strip())))


def _uses_ponomar(text):
    return bool(_CHURCH_UNICODE.search(text or ""))


def normalize_hymn_source_fields(source):
    """Return (updated_fields, issues); preserve source/variants on uncertainty.

    Input is a dictionary with _title/_content pairs for troparion, kontakion.
    Names are identical to CalendarFeast model field names, with optional _uk.
    """
    values = dict(source)
    issues = []
    for hymn in ("troparion", "kontakion"):
        for suffix in ("", "_uk"):
            content_key = f"{hymn}_content{suffix}"
            title_key = f"{hymn}_title{suffix}"
            other_content_key = f"{hymn}_alternate_content{suffix}"
            other_title_key = f"{hymn}_alternate_title{suffix}"
            script_key = f"{hymn}_script{suffix}"
            other_script_key = f"{hymn}_alternate_script{suffix}"
            original = values.get(content_key) or ""
            if not original:
                continue
            title = values.get(title_key) or ""
            legacy_content = is_legacy_ucs(original)
            legacy_title = is_legacy_ucs(title)
            decoded = ucs_to_unicode(original) if legacy_content else original
            decoded_title = ucs_to_unicode(title) if legacy_title else title
            blocks = [
                block.strip() for block in re.split(r"\n\s*\n+", decoded.replace("\r\n", "\n").strip())
                if block.strip()
            ]
            other_index = next(
                (i for i, block in enumerate(blocks)
                 if i > 0 and _is_alternate_header(block, hymn)),
                None,
            )
            if other_index is not None:
                if values.get(other_content_key):
                    issues.append(f"{content_key}: existing alternate field; review before splitting")
                else:
                    after_heading = other_index + 1
                    title_blocks = [blocks[other_index]]
                    if after_heading < len(blocks) and _is_podoben(blocks[after_heading]):
                        title_blocks.append(blocks[after_heading])
                        after_heading += 1
                    first = "\n\n".join(blocks[:other_index]).strip()
                    second = "\n\n".join(blocks[after_heading:]).strip()
                    if first and second:
                        values[content_key] = first
                        values[other_content_key] = second
                        values[other_title_key] = "\n\n".join(title_blocks)
                        values[other_script_key] = (
                            "csl" if legacy_content or _uses_ponomar(second) else "civil"
                        )
                    else:
                        issues.append(f"{content_key}: unsafe empty split; source preserved")
            else:
                # Do not guess where a second hymn begins in a merged paragraph.
                if re.search(r"(?:инъ?|иной|інший)\s+"
                             + ("тропар" if hymn == "troparion" else "кондак"),
                             _fold(decoded)):
                    issues.append(f"{content_key}: alternate marker without safe paragraph break")
            if content_key not in values or values[content_key] == original:
                values[content_key] = decoded
            values[title_key] = decoded_title
            if legacy_content or legacy_title or _uses_ponomar(values[content_key]):
                values[script_key] = "csl"
    return values, issues
