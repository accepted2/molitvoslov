# -*- coding: utf-8 -*-
"""Audit four remaining calendar gaps without changing the DB or Cloudinary."""
import os
import re
import sys
from pathlib import Path
from datetime import date
from difflib import SequenceMatcher

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
os.environ["PYTHONIOENCODING"] = "utf-8"
import django

django.setup()

import requests
from api.calendar_models import CalendarDay, CalendarFeast
from api.azbyka_calendar_feasts import fetch_day_saint_links, fetch_saint_content

TARGETS = [date(2026, 3, 7), date(2026, 4, 12), date(2026, 5, 22), date(2026, 11, 7)]
REPORT = Path("calendar_four_gaps_report_2026.txt")
lines = []


def out(message=""):
    message = str(message)
    print(message, flush=True)
    lines.append(message)


def normalized(text):
    text = re.sub(r"[\u0300-\u036f]", "", (text or "").casefold().replace("ё", "е"))
    return re.sub(r"\s+", " ", text).strip()


session = requests.Session()
session.headers["User-Agent"] = "Mozilla/5.0 (calendar data audit)"

out("=== АУДИТ ЧЕТЫРЁХ ДАТ (ТОЛЬКО ЧТЕНИЕ) ===")
try:
    for target in TARGETS:
        day = CalendarDay.objects.select_related("main_feast").get(date_gregorian=target)
        f = day.main_feast
        out(f"\n=== {target} ===")
        out(f"ID {f.pk} | {f.title}")
        out(
            f'Икона: {bool(f.icon_url)} | праздничный текст: {len(f.life_content or "")} | чтений: {day.readings.count()}'
        )
        out("Ссылки календарного дня Azbyka:")
        try:
            sources = fetch_day_saint_links(target, session=session, timeout=30)
            matches = []
            for source in sources:
                ratio = SequenceMatcher(None, normalized(f.title), normalized(source.title)).ratio()
                if ratio > 0.45 or any(
                    x in normalized(source.title)
                    for x in {
                        date(2026, 3, 7): ("евгени",),
                        date(2026, 4, 12): ("пасх", "воскресен"),
                        date(2026, 5, 22): ("никола", "мощ"),
                        date(2026, 11, 7): ("родительск", "усопш"),
                    }[target]
                ):
                    matches.append((ratio, source))
            matches.sort(key=lambda t: t[0], reverse=True)
            out(f"Всего ссылок: {len(sources)}; кандидатов: {len(matches)}")
            for ratio, source in matches[:6]:
                out(f"  {ratio:.2f} | {source.title} | {source.url}")
                try:
                    parsed = fetch_saint_content(source.url, session=session, timeout=30)
                    text = (parsed.life_content or "").strip()
                    out(f"    Заголовок: {parsed.title!r}")
                    out(f'    Икона источника: {parsed.icon_source_url or "НЕТ"}')
                    out(f"    Текст: {len(text)} символов")
                    out(f'    Начало: {text[:320].replace(chr(10), " ")}')
                    out(f'    Конец: {text[-180:].replace(chr(10), " ")}')
                except Exception as exc:
                    out(f"    Ошибка чтения: {type(exc).__name__}: {str(exc)[:180]}")
        except Exception as exc:
            out(f"Ошибка списка Azbyka: {type(exc).__name__}: {str(exc)[:240]}")
        if target == date(2026, 4, 12):
            out("Локальные карточки о Пасхе (не используются автоматически):")
            for x in (
                CalendarFeast.objects.filter(title__icontains="Воскресение")
                .exclude(pk=f.pk)
                .exclude(life_content="")[:8]
            ):
                out(
                    f"  ID {x.pk} | {x.title[:90]} | текст {len(x.life_content)} | икона {bool(x.icon_url)}"
                )
finally:
    session.close()
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"\nОтчёт сохранён: {REPORT.resolve()}", flush=True)
    print("База данных и Cloudinary не изменялись.", flush=True)
