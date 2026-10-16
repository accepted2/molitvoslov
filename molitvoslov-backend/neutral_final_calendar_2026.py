#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Финальный безопасный проход по календарю. Только SQLite, --apply явно.
Не переписывает исторические события, цитаты и официальные названия.
"""
import argparse
import csv
import os
import re
import sqlite3
import unicodedata
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

FIELDS = (
    "title",
    "short_title",
    "life_title",
    "life_content",
    "troparion_title",
    "troparion_content",
    "kontakion_title",
    "kontakion_content",
    "description",
    "title_uk",
    "short_title_uk",
    "life_title_uk",
    "life_content_uk",
    "troparion_title_uk",
    "troparion_content_uk",
    "kontakion_title_uk",
    "kontakion_content_uk",
    "description_uk",
)
# Только русские и церковнославянские формулы. Украинский не редактируем
# русскими правилами, чтобы не ломать грамматику.
RU_FIELDS = tuple(f for f in FIELDS if not f.endswith("_uk"))
BASE = [
    ("землю российскую", "землю нашу"),
    ("землю русскую", "землю нашу"),
    ("земли российской", "земли нашей"),
    ("земли русской", "земли нашей"),
    ("земли российския", "земли нашея"),
    ("земли русския", "земли нашея"),
    ("земле российской", "земле нашей"),
    ("земле русской", "земле нашей"),
    ("земле российстей", "земле нашей"),
    ("земля российская", "земля наша"),
    ("земля русская", "земля наша"),
    ("российская земля", "наша земля"),
    ("русская земля", "наша земля"),
    ("российстей земли", "нашей земли"),
    ("российской земли", "нашей земли"),
    ("русской земли", "нашей земли"),
    ("российския земли", "нашея земли"),
    ("русския земли", "нашея земли"),
    ("страну российскую", "страну нашу"),
    ("страну русскую", "страну нашу"),
    ("стране российской", "стране нашей"),
    ("стране русской", "стране нашей"),
    ("стране российстей", "стране нашей"),
    ("стране российския", "стране нашея"),
    ("страна российская", "страна наша"),
    ("страна русская", "страна наша"),
    ("народ российский", "народ наш"),
    ("народ русский", "народ наш"),
    ("народа российского", "народа нашего"),
    ("народа русского", "народа нашего"),
    ("народу российскому", "народу нашему"),
    ("народу русскому", "народу нашему"),
    ("народе российском", "народе нашем"),
    ("народе русском", "народе нашем"),
    ("народом российским", "народом нашим"),
    ("народом русским", "народом нашим"),
    ("отечество российское", "отечество наше"),
    ("отечество русское", "отечество наше"),
    ("отечества российского", "отечества нашего"),
    ("отечества русского", "отечества нашего"),
    ("отечеству российскому", "отечеству нашему"),
    ("отечеству русскому", "отечеству нашему"),
    ("державу российскую", "державу нашу"),
    ("державу русскую", "державу нашу"),
    ("державе российской", "державе нашей"),
    ("державе русской", "державе нашей"),
    ("державе российстей", "державе нашей"),
    ("державы российския", "державы нашея"),
    ("держава российская", "держава наша"),
    ("держава русская", "держава наша"),
    ("сыновом российским", "сыновом нашим"),
    ("людем российским", "людем нашим"),
]
# Обращения, при которых местоимение «наш» имеет понятного адресата.
VERBS = re.compile(
    r"\b(?:спаси|сохрани|сохраняй|защити|огради|помилуй|укрепи|"
    r"благослови|соблюди|избави|избавь|утверди|призри|покрый|"
    r"моли|молите|молимся|молим|помолись|даруй|пошли|"
    r"помози|спастися|избавляй|храни|сохраниши)\b",
    re.I,
)
# Исторические повествования и названия не должны становиться «нашими».
HISTORY = re.compile(
    r"\b(?:империи|империя|государства|князя|князь|князем|"
    r"века|веке|столетия|войны|войне|битвы|битве|нашествия|"
    r"крещения|крещением|татар|орды|полков|летописи|"
    r"царь|царя|царей|самодержец|открытия|основал|"
    r"истории|в\s+\d{3,4}\s*году)\b",
    re.I,
)
# Не трогаем цитаты, в т.ч. молитвы исторических лиц в житиях.
QUOTES = '«»„“”"'


def normalized_map(s):
    chunks = []
    for m in re.finditer(r"[^\u0300-\u036f][\u0300-\u036f]*|[\u0300-\u036f]+", s):
        frag = m.group()
        clean = "".join(
            x for x in unicodedata.normalize("NFD", frag) if x not in ("\u0301", "\u0341", "\u0300")
        )
        clean = unicodedata.normalize("NFC", clean).casefold().replace("ё", "е")
        for c in clean:
            chunks.append((c, m.start(), m.end()))
    return "".join(x[0] for x in chunks), chunks


PATTERNS = [
    (
        re.compile(
            r"(?<![а-яёa-z])" + r"\s+".join(map(re.escape, a.split())) + r"(?![а-яёa-z])", re.I
        ),
        b,
    )
    for a, b in BASE
]


def sentence(s, a, b):
    l = max(s.rfind(c, 0, a) for c in ".!?\n;/")
    ends = [s.find(c, b) for c in ".!?\n;/" if s.find(c, b) >= 0]
    r = min(ends) if ends else min(len(s), b + 140)
    return s[l + 1 : r].strip()


def is_quoted(s, a):
    # Exact quoted passages are source material even when prayer-like.
    for op, cl in (("«", "»"), ("“", "”"), ('"', '"')):
        if op == cl:
            if s[:a].count(op) % 2:
                return True
        else:
            if s[:a].rfind(op) > s[:a].rfind(cl):
                return True
    return False


def decision(s, a, b, field):
    part = sentence(s, a, b)
    # Never change official/historical feast names and headings:
    # these are proper identities, not a prayer for the current reader.
    if field not in ("life_content", "troparion_content", "kontakion_content"):
        return False, "Название/описание: нет явного молитвенного обращения"
    if is_quoted(s, a):
        return False, "Прямая цитата"
    normalized, _ = normalized_map(part)
    if HISTORY.search(normalized):
        return False, "Исторические сведения"
    # hymns are more frequently narrative and therefore still require a prayer
    if not VERBS.search(normalized):
        return False, "Нет явной молитвенной просьбы"
    # A prayer verb within 90 characters preceding phrase is stronger
    # than a remote unrelated verb in the same paragraph.
    rel = a - max(0, s.find(part, max(0, a - 300))) if part else 999
    close, _ = normalized_map(s[max(0, a - 120) : b])
    if not VERBS.search(close):
        return False, "Обращение слишком далеко от формулы"
    return True, "Явная молитвенная формула"


def process(value, field):
    norm, mapping = normalized_map(value)
    candidates = []
    for regex, dst in PATTERNS:
        for m in regex.finditer(norm):
            start = mapping[m.start()][1]
            end = mapping[m.end() - 1][2]
            candidates.append((start, end, dst))
    candidates.sort(key=lambda x: (x[0], -(x[1] - x[0])))
    selected = []
    last = -1
    for a, b, dst in candidates:
        if a < last:
            continue
        last = b
        yes, reason = decision(value, a, b, field)
        old = value[a:b]
        # Preserve initial uppercase when an original formula starts uppercase.
        new = dst[:1].upper() + dst[1:] if old[0].isupper() else dst
        selected.append(
            (a, b, new, yes, reason, old, value[max(0, a - 100) : min(len(value), b + 100)])
        )
    result = value
    for a, b, new, yes, *rest in reversed(selected):
        if yes:
            result = result[:a] + new + result[b:]
    rows = [
        dict(old=old, new=new, reason=reason, context=ctx)
        for a, b, new, yes, reason, old, ctx in selected
        if yes
    ]
    skipped = [
        dict(old=old, new=new, reason=reason, context=ctx)
        for a, b, new, yes, reason, old, ctx in selected
        if not yes
    ]
    return result, rows, skipped


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="Записать изменения после резервной копии")
    args = ap.parse_args()
    engine = settings.DATABASES["default"]["ENGINE"]
    db = Path(settings.DATABASES["default"]["NAME"]).resolve()
    if engine != "django.db.backends.sqlite3" or not db.is_file():
        raise SystemExit("СТОП: требуется локальная SQLite (не Supabase)")
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = ROOT / "reports" / ("neutral_final_2026_" + ts)
    dest.mkdir(parents=True, exist_ok=True)
    applied = []
    skipped = []
    patches = []
    for feast in CalendarFeast.objects.all().iterator(chunk_size=300):
        changes = {}
        for field in RU_FIELDS:
            before = getattr(feast, field, "") or ""
            if not isinstance(before, str) or not before:
                continue
            after, yes, no = process(before, field)
            for item in yes:
                applied.append({"id": feast.pk, "title": feast.title, "field": field, **item})
            for item in no:
                skipped.append({"id": feast.pk, "title": feast.title, "field": field, **item})
            if after != before:
                changes[field] = (before, after)
        if changes:
            patches.append((feast.pk, changes))
    cols = ("id", "title", "field", "old", "new", "reason", "context")
    for name, data in (("applied.csv", applied), ("skipped.csv", skipped)):
        with (dest / name).open("w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=cols, delimiter=";")
            w.writeheader()
            w.writerows(data)
    print(f"Проверено карточек: {CalendarFeast.objects.count()}")
    print(
        f"Новых безопасных замен: {len(applied)}; полей: {sum(len(fields) for _,fields in patches)}"
    )
    print(f"Сомнительных / не подходящих: {len(skipped)}")
    print(f"Отчёты: {dest}")
    if not args.apply:
        print("DRY-RUN: база НЕ изменена. Для применения запустите с --apply.")
        return
    if not patches:
        print("Изменений нет. Готово.")
        return
    backup_dir = ROOT / "backups" / "sqlite"
    backup_dir.mkdir(parents=True, exist_ok=True)
    backup = backup_dir / ("before_neutral_final_" + ts + ".sqlite3")
    with sqlite3.connect(str(db)) as original, sqlite3.connect(str(backup)) as copy:
        original.backup(copy)
    print("Резервная копия:", backup)
    with transaction.atomic():
        for pk, patch in patches:
            obj = CalendarFeast.objects.select_for_update().get(pk=pk)
            # Prevent applying stale replacements over concurrent admin edits.
            for field, (old, new) in patch.items():
                if getattr(obj, field) != old:
                    raise RuntimeError(f"СТОП: поле {pk}.{field} изменилось во время анализа")
            CalendarFeast.objects.filter(pk=pk).update(**{f: new for f, (_, new) in patch.items()})
    print(f"ГОТОВО: {len(applied)} замен. Перезапуск безопасен.")
    print("Уже внесённые ранее изменения не менялись.")


if __name__ == "__main__":
    main()
