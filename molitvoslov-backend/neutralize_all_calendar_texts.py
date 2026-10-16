#!/usr/bin/env python3
"""Консервативная контекстная нейтрализация национально-государственных обращений.
Запуск из molitvoslov-backend: python -X utf8 neutralize_all_calendar_texts.py
Изменяет ТОЛЬКО точные выражения «земля/страна/народ/отечество/держава ...»
в молитвенных обращениях; НЕ является литературным редактором.
"""
import csv
import os
import re
import sqlite3
import unicodedata
from collections import Counter
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
import django
django.setup()
from django.conf import settings
from django.db import transaction
from api.calendar_models import CalendarFeast

# Поддерживаем русские и распространённые церковнославянские падежи.
# Замена ограничивается целым словосочетанием, а не отдельным словом.
CASES = [
    # noun(normalized), adjective(normalized), replacement
    ("землю", "русскую", "землю нашу"),
    ("землю", "российскую", "землю нашу"),
    ("земля", "русская", "земля наша"),
    ("земля", "российская", "земля наша"),
    ("земле", "русской", "земле нашей"),
    ("земле", "российской", "земле нашей"),
    ("земле", "российстей", "земле нашей"),
    ("земли", "русской", "земли нашей"),
    ("земли", "российской", "земли нашей"),
    ("земли", "российския", "земли нашея"),
    ("земли", "русския", "земли нашея"),
    ("земле", "российския", "земле нашея"),
    ("страну", "русскую", "страну нашу"),
    ("страну", "российскую", "страну нашу"),
    ("стране", "российстей", "стране нашей"),
    ("стране", "российской", "стране нашей"),
    ("стране", "русской", "стране нашей"),
    ("страна", "российская", "страна наша"),
    ("страна", "русская", "страна наша"),
    ("народ", "русский", "народ наш"),
    ("народ", "российский", "народ наш"),
    ("народа", "русского", "народа нашего"),
    ("народа", "российского", "народа нашего"),
    ("народу", "русскому", "народу нашему"),
    ("народу", "российскому", "народу нашему"),
    ("народе", "русском", "народе нашем"),
    ("народе", "российском", "народе нашем"),
    ("народом", "русским", "народом нашим"),
    ("народом", "российским", "народом нашим"),
    ("народы", "русские", "народы наши"),
    ("народов", "русских", "народов наших"),
    ("отечество", "российское", "отечество наше"),
    ("отечество", "русское", "отечество наше"),
    ("отечества", "российского", "отечества нашего"),
    ("отечества", "русского", "отечества нашего"),
    ("отечеству", "российскому", "отечеству нашему"),
    ("отечеству", "русскому", "отечеству нашему"),
    ("отечестве", "российском", "отечестве нашем"),
    ("отечестве", "русском", "отечестве нашем"),
    ("державу", "российскую", "державу нашу"),
    ("державу", "русскую", "державу нашу"),
    ("державе", "российстей", "державе нашей"),
    ("державе", "российской", "державе нашей"),
    ("державе", "русской", "державе нашей"),
    ("державы", "российския", "державы нашея"),
    ("державы", "российской", "державы нашей"),
    ("держава", "российская", "держава наша"),
    ("держава", "русская", "держава наша"),
    # inverted order, common in Church Slavonic hymns
    ("российстей", "земли", "нашей земли"),
    ("российской", "земли", "нашей земли"),
    ("русской", "земли", "нашей земли"),
    ("российския", "земли", "нашея земли"),
    ("русския", "земли", "нашея земли"),
    ("российстей", "державе", "нашей державе"),
    ("российстей", "стране", "нашей стране"),
]
# More complex forms (родные святые, Церковь, Русь, Россия) are intentionally
# excluded. They require human-level interpretation; no destructive edits.
RULES = list({(a,b): c for a,b,c in CASES}.items())
# Compile using normalized (lowercase, unaccented) text.
PATTERNS = [
    (re.compile(r"(?<![а-яa-zё])" + re.escape(a) + r"\s+" + re.escape(b) + r"(?![а-яa-zё])", re.I), repl)
    for ((a,b), repl) in RULES
]

FIELDS = [
    "life_content", "troparion_content", "kontakion_content",
    "title", "short_title", "life_title", "troparion_title", "kontakion_title"
]

# In жития, only explicit prayers to God or the saint qualify; narrative
# descriptions of a country's history must be left unchanged.
PRAYER_CUES = (
    "моли", "молим", "молит", "помол", "сохрани", "сохран", "спаси", "спас",
    "избав", "защит", "укреп", "благослов", "призри", "помилуй", "даруй",
    "услыши", "покрый", "покров", "утверди", "соблюди", "исцели", "прослав",
)
HISTORY_CUES = (
    "импер", "государств", "век", "столет", "войн", "битв", "нашеств",
    "плен", "княз", "царств", "правлен", "монарх", "арм", "завоева",
    "пересел", "жил", "родил", "родился", "происхожд", "основал",
    "истор", "летопис", "г.", "году", "в 1", "в 2",
    "прибы", "посел", "перенес", "переехал", "переход",
)

def plain(s):
    # Remove stress marks, but KEEP й: NFD decomposition of й would
    # otherwise turn «Российскую» into «Россиискую».
    s = unicodedata.normalize("NFC", s.casefold().replace("ё", "е"))
    return "".join(c for c in s if c not in ("\u0301", "\u0341", "\u0300"))

def normalized_with_map(s):
    out, offsets = [], []
    for i, ch in enumerate(s):
        for c in plain(ch):
            out.append(c)
            offsets.append(i)
    return "".join(out), offsets

def allowed(field, original, pos, end):
    if field.endswith("title") or field in ("title", "short_title"):
        # Only an explicit prayer heading can be safely localized.
        # Official feast names and geographic titles remain unchanged.
        head = plain(original[:min(len(original), 120)])
        if re.search(r"\\bмолитв[аыеоу]\\b", head) and not any(x in head for x in HISTORY_CUES):
            return True, "Название молитвенного обращения"
        return False, "Историческое/официальное название: пропуск"
    if field in ("troparion_content", "kontakion_content"):
        # Historical narrative can also appear inside hymns.
        left = max(0, original.rfind(".", 0, pos), original.rfind(";", 0, pos), original.rfind("\n", 0, pos), original.rfind("/", 0, pos))
        right_candidates = [p for p in (original.find(".", end), original.find(";", end), original.find("\n", end)) if p >= 0]
        right = min(right_candidates) if right_candidates else min(len(original), end+140)
        clause = plain(original[left:right])
        if any(x in clause for x in HISTORY_CUES) and not any(x in clause for x in PRAYER_CUES):
            return False, "Исторический контекст песнопения"
        if any(x in clause for x in PRAYER_CUES):
            return True, "Молитвенное обращение"
        return False, "Нет явного молитвенного обращения"
    # Biographies: require local prayer imperative, not merely saint's life
    start = max(0, original.rfind("\n", 0, pos), original.rfind(".", 0, pos), original.rfind("!", 0, pos), original.rfind("?", 0, pos))
    endloc = min(len(original), end + 90)
    clause = plain(original[start:endloc])
    if any(x in clause for x in HISTORY_CUES):
        return False, "Исторический контекст жития"
    if any(x in clause for x in PRAYER_CUES):
        return True, "Молитвенное обращение внутри жития"
    return False, "Повествовательный текст жития"

def original_case(repl, fragment):
    # Case of entire phrase follows first letter; never invent new stress marks.
    return repl[0].upper() + repl[1:] if fragment[:1].isupper() else repl

def preserve_noun_stress(old, replacement):
    """Keep original church-Slavonic accentuation on unchanged noun."""
    original_words = old.split()
    new_words = replacement.split()
    if len(original_words) != 2 or len(new_words) != 2:
        return original_case(replacement, old)
    # Either the first or second token of the replacement is the original noun.
    original_plain = [plain(x) for x in original_words]
    newer_plain = [plain(x) for x in new_words]
    for oi, source_word in enumerate(original_plain):
        for ni, target_word in enumerate(newer_plain):
            if source_word == target_word:
                new_words[ni] = original_words[oi]
                # Preserve sentence capitalization on newly introduced adjective.
                other = 1 - ni
                if oi == 0 and original_words[oi][:1].isupper() and ni != 0:
                    new_words[0] = new_words[0][:1].upper() + new_words[0][1:]
                elif oi == 1 and original_words[0][:1].isupper():
                    new_words[0] = new_words[0][:1].upper() + new_words[0][1:]
                return " ".join(new_words)
    return original_case(replacement, old)

def examine(field, text):
    norm, offsets = normalized_with_map(text)
    candidates = []
    for regex, repl in PATTERNS:
        for m in regex.finditer(norm):
            a = offsets[m.start()]
            b = offsets[m.end()-1] + 1
            # absorb trailing combining stress mark if any
            while b < len(text) and unicodedata.category(text[b]) == "Mn":
                b += 1
            ok, why = allowed(field, text, a, b)
            candidates.append((a, b, repl, ok, why))
    candidates.sort(key=lambda v: (v[0], -(v[1]-v[0])))
    changes, skipped, previous_end = [], [], -1
    for a,b,repl,ok,why in candidates:
        if a < previous_end:
            continue
        previous_end = b
        old = text[a:b]
        new = preserve_noun_stress(old, repl)
        row = {"before": old, "after": new, "context": re.sub(r"\s+", " ", text[max(0,a-100): min(len(text),b+100)]), "reason": why}
        if ok and plain(old) != plain(new):
            changes.append((a,b,new,row))
        else:
            skipped.append(row)
    result = text
    for a,b,new,row in reversed(changes):
        result = result[:a] + new + result[b:]
    return result, [r for a,b,new,r in changes], skipped

def main():
    db = Path(settings.DATABASES["default"]["NAME"]).resolve()
    if not db.exists() or db.suffix.lower() != ".sqlite3":
        raise SystemExit(f"СТОП: ожидалась SQLite, получено {db}")
    report_dir = ROOT/"reports"
    report_dir.mkdir(exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    applied_file = report_dir/f"neutral_all_applied_{ts}.csv"
    skipped_file = report_dir/f"neutral_all_skipped_{ts}.csv"
    applied_rows, skipped_rows = [], []
    edits = []
    cards = 0

    for feast in CalendarFeast.objects.all().iterator(chunk_size=200):
        cards += 1
        changeset = {}
        for field in FIELDS:
            before = getattr(feast, field, "") or ""
            if not before:
                continue
            after, applied, skipped = examine(field, before)
            for row in applied:
                applied_rows.append({"id":feast.pk,"title":feast.title,"field":field,**row})
            for row in skipped:
                skipped_rows.append({"id":feast.pk,"title":feast.title,"field":field,**row})
            if before != after:
                changeset[field] = after
        if changeset:
            edits.append((feast.pk, changeset))
    print(f"Карточек проверено: {cards}")
    print(f"Новых однозначных замен: {len(applied_rows)}")
    print(f"Пропущено сомнительных: {len(skipped_rows)}")
    print(f"Изменяемых карточек: {len(edits)}")

    headers = ["id","title","field","before","after","reason","context"]
    for path, rows in ((applied_file,applied_rows),(skipped_file,skipped_rows)):
        with path.open("w",encoding="utf-8-sig",newline="") as f:
            w=csv.DictWriter(f,fieldnames=headers,delimiter=";")
            w.writeheader();w.writerows(rows)
    print("Журнал замен:", applied_file)
    print("Пропущенные случаи:", skipped_file)
    if not edits:
        print("Изменений нет. Готово.")
        return

    backup_dir = ROOT/"backups"/"sqlite"
    backup_dir.mkdir(parents=True,exist_ok=True)
    backup = backup_dir/f"before_neutral_all_{ts}.sqlite3"
    with sqlite3.connect(str(db)) as s, sqlite3.connect(str(backup)) as d:
        s.backup(d)
    print("Резервная копия:", backup)

    with transaction.atomic():
        for pk, updates in edits:
            # Concurrency protection: one local user typically, but safety matters.
            obj = CalendarFeast.objects.select_for_update().get(pk=pk)
            for fld,val in updates.items():
                setattr(obj,fld,val)
            obj.save(update_fields=list(updates))
    print(f"ГОТОВО: {len(applied_rows)} новых замен; {len(edits)} карточек.")
    print("Ранее выполненные 78 замен не отменялись и не пересчитывались.")

if __name__=="__main__":
    main()
