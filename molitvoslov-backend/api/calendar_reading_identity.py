"""Identity of liturgical readings for merge, display and audit.

An appointment is the same Bible range on the same liturgical service,
regardless of minor punctuation, 'zach.' suffix, generic/saint labels or order.
Distinct services are NEVER combined.
"""
import re
import unicodedata


def reading_service(label):
    value = unicodedata.normalize("NFKC", str(label or "")).casefold().replace("ё", "е")
    value = re.sub(r"\s+", " ", value).strip(" .,:;")
    if re.search(r"\b(?:утр(?:ени|еня)?|утрене|на утрени)\b", value):
        return "matins"
    if re.search(r"\b(?:на\s+веч(?:ерне|ерни)?|веч(?:ерня|ерни)?)\b", value):
        return "vespers"
    if re.search(r"\b(?:6[\s-]*(?:м|ом)\s+часе|шестом\s+часе)\b", value):
        return "sixth_hour"
    if re.search(r"\b(?:1[\s-]*(?:м|ом)\s+часе|первом\s+часе)\b", value):
        return "first_hour"
    if re.search(r"\b(?:3[\s-]*(?:м|ем)\s+часе|третьем\s+часе)\b", value):
        return "third_hour"
    if re.search(r"\b(?:9[\s-]*(?:м|ом)\s+часе|девятом\s+часе)\b", value):
        return "ninth_hour"
    return "liturgy"


def canonical_scripture_title(title):
    source = unicodedata.normalize("NFKC", str(title or "")).casefold()
    source = source.replace("ё", "е").replace("\u0301", "")
    source = re.sub(r"[–—−‐‑‒]", "-", source)
    # Zachalo number is catalog metadata, not part of Scripture address.
    source = re.sub(r"\(\s*зач(?:ало)?\.?[^)]*\)", "", source)
    source = re.sub(r"\bзач(?:ало)?\.?\s*\d+\b", "", source)
    source = re.sub(r"[.\s\u00a0]+", "", source).strip(",;:-")
    # Equivalent book abbreviation in some existing day records.
    source = re.sub(r"^([12])сол(?=\d|:)", r"\1фес", source)
    return source


def normalized_reading_key(reading):
    return (
        str(reading.kind or "").casefold().strip(),
        reading_service(reading.label),
        canonical_scripture_title(reading.title),
    )


def readings_to_add(existing, incoming):
    seen = {normalized_reading_key(reading) for reading in existing}
    result = []
    for reading in incoming:
        key = normalized_reading_key(reading)
        if not key[0] or not key[-1] or key in seen:
            continue
        result.append(reading)
        seen.add(key)
    return result


def find_duplicate_groups(readings):
    groups = {}
    for reading in sorted(readings, key=lambda r: (int(r.order or 0), int(r.pk or 0))):
        key = normalized_reading_key(reading)
        groups.setdefault(key, []).append(reading)
    return [records for records in groups.values() if len(records) > 1]
