"""Safely complete local Molitvoslov calendar in November/December 2026.

October 1: attempt to fill the missing life of Evmeniy Gortinskiy.
November: only November 6-30. November 1-5 are intentionally untouched.
December: December 1-31; only days not yet imported from Azbyka.

For every processing run, this script makes one full SQLite snapshot.
Importer temporary per-day backups are removed ONLY following successful day import;
the full snapshot always remains. It never modifies Sep or Nov 1-5.

Run from molitvoslov-backend: python -X utf8 .\\finish_calendar_nov_dec_2026.py
"""
from __future__ import annotations

import hashlib
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import time
import unicodedata
from datetime import date, datetime, timedelta
from pathlib import Path

BASE = Path(__file__).resolve().parent
os.chdir(BASE)
os.environ["PYTHONUTF8"] = "1"
os.environ["PYTHONIOENCODING"] = "utf-8"
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")


def say(*items, **kwargs):
    print(*items, flush=True)


def normalized(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", text or "") if unicodedata.category(c) != "Mn").casefold()


def sqlite_snapshot(source: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(str(source)) as src, sqlite3.connect(str(dest)) as dst:
        src.backup(dst)
    # Confirm actual readable sqlite snapshot before changing user data.
    with sqlite3.connect(str(dest)) as conn:
        check = conn.execute("PRAGMA quick_check").fetchone()[0]
    if check != "ok":
        raise RuntimeError(f"Непригодная резервная копия: {check}")


def load_cloudinary_env() -> None:
    env = BASE / ".env"
    if not env.is_file():
        return
    for raw in env.read_text(encoding="utf-8-sig").splitlines():
        match = re.match(r"^\s*(?:export\s+)?(CLOUD_NAME|CLOUD_API_KEY|CLOUD_API_SECRET|CLOUDINARY_URL)\s*=\s*(.*?)\s*$", raw)
        if match:
            key, value = match.groups()
            value = value.strip().strip('"\'')
            if value and not os.environ.get(key):
                os.environ[key] = value


load_cloudinary_env()

import django  # noqa: E402

django.setup()

from django.conf import settings  # noqa: E402
from django.db import close_old_connections  # noqa: E402
from api.calendar_models import CalendarDay, CalendarFeast  # noqa: E402
from api.azbyka_calendar_feasts import fetch_saint_content  # noqa: E402
from api.calendar_icon_storage import cloudinary_configured  # noqa: E402
from api.management.commands.import_azbyka_calendar_feasts import clean_imported_life  # noqa: E402


def day_is_imported(target: date) -> bool:
    """Resume safety check. Skips only days with readings and an Azbyka main card."""
    d = CalendarDay.objects.select_related("main_feast").filter(date_gregorian=target).first()
    if not d or not d.main_feast or not d.readings.exists():
        return False
    return bool(d.main_feast.sync_uid)


def audit_period(name: str, start: date, end: date) -> None:
    qs = list(CalendarDay.objects.filter(date_gregorian__range=(start, end)).select_related("main_feast").prefetch_related("readings").order_by("date_gregorian"))
    say(f"\n=== {name} ===")
    say("Дней:", len(qs), "| С чтениями:", sum(bool(d.readings.all()) for d in qs), "| С житиями главных памятей:", sum(bool(d.main_feast and d.main_feast.life_content.strip()) for d in qs), "| С иконами главных памятей:", sum(bool(d.main_feast and d.main_feast.icon_url) for d in qs))
    for d in qs:
        missing = []
        if not d.readings.all():
            missing.append("чтения")
        if not d.main_feast:
            missing.append("главная память")
        else:
            if not d.main_feast.life_content.strip():
                missing.append("житие")
            if not d.main_feast.icon_url:
                missing.append("икона")
        if missing:
            say("ПРОВЕРИТЬ:", d.date_gregorian, ", ".join(missing))
    for x in [date(2026, 11, 21), date(2026, 12, 4), date(2026, 12, 13), date(2026, 12, 19)]:
        if start <= x <= end:
            d = next((d for d in qs if d.date_gregorian == x), None)
            if d:
                say("ГЛАВНАЯ:", x, "|", d.main_feast.title if d.main_feast else "НЕТ")


def fix_evmeniy() -> None:
    say("\n=== ЕВМЕНИЙ ГОРТИНСКИЙ, 1 ОКТЯБРЯ ===")
    d = CalendarDay.objects.select_related("main_feast").filter(date_gregorian=date(2026, 10, 1)).first()
    if not d or not d.main_feast:
        say("ПРОПУСК: не найдена главная память 1 октября")
        return
    feast = d.main_feast
    # Remove combining stress marks: Евме́ний -> Евмений.
    saint_title = normalized(feast.title)
    if feast.pk != 2331 or "евмен" not in saint_title or "гортин" not in saint_title:
        say("ПРОПУСК: изменена карточка/главная память:", feast.pk, feast.title)
        return
    if feast.life_content.strip():
        say("Уже заполнено:", len(feast.life_content), "символов")
        return
    source_url = "https://azbyka.ru/days/sv-evmenij-gortinskij"
    try:
        parsed = fetch_saint_content(source_url, timeout=35)
        title = normalized(parsed.title or "")
        life = clean_imported_life(parsed.life_content or "").strip()
        life_normalized = normalized(life[:2500])
        say("Источник:", source_url)
        say("Длина:", len(life))
        say("Начало:", life[:180].replace("\n", " "))
        say("Конец:", life[-140:].replace("\n", " "))
        if not ("евмен" in title and "гортин" in title and 150 <= len(life) <= 20000 and "евмен" in life_normalized):
            say("ПРОПУСК: источник не прошёл проверку названия или текста")
            return
        updated = CalendarFeast.objects.filter(pk=feast.pk, life_content="").update(life_content=life)
        say("Результат:", "ЖИТИЕ СОХРАНЕНО" if updated else "Без изменений")
    except Exception as exc:
        say("ПРОПУСК: ошибка получения жития:", type(exc).__name__, str(exc)[:220])


def run_import_one(day: date, tmp_backups: Path, log_path: Path) -> tuple[bool, str]:
    args = [sys.executable, "-X", "utf8", "manage.py", "import_azbyka_calendar_day", "--date", day.isoformat(), "--apply", "--delay", "0.35", "--timeout", "35", "--backup-dir", str(tmp_backups)]
    with log_path.open("a", encoding="utf-8") as out:
        out.write(f"\n===== START {day} =====\n")
        out.flush()
        result = subprocess.run(args, cwd=BASE, env=os.environ.copy(), stdout=out, stderr=subprocess.STDOUT, check=False)
        out.write(f"===== END {day} CODE {result.returncode} =====\n")
    if result.returncode:
        tail = "\n".join(log_path.read_text(encoding="utf-8", errors="replace").splitlines()[-18:])
        return False, tail
    close_old_connections()
    updated = CalendarDay.objects.select_related("main_feast").filter(date_gregorian=day).first()
    if not updated or not updated.readings.exists() or not updated.main_feast:
        return False, "После импорта отсутствуют чтения или главная память"
    return True, ""


def dates(start: date, end: date):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def main_stats(target: date) -> str:
    d = CalendarDay.objects.select_related("main_feast").filter(date_gregorian=target).first()
    if not d:
        return "нет календарного дня"
    return f"чтения={d.readings.count()}, житие={'да' if d.main_feast and d.main_feast.life_content else 'нет'}, икона={'да' if d.main_feast and d.main_feast.icon_url else 'нет'}"


def main() -> None:
    say("=== ПРОВЕРКА ===")
    cfg = settings.DATABASES["default"]
    if cfg.get("ENGINE") != "django.db.backends.sqlite3":
        sys.exit("СТОП: активная база данных не SQLite")
    db_path = Path(cfg["NAME"]).resolve()
    if not db_path.is_file():
        sys.exit("СТОП: файл SQLite не найден")
    if not cloudinary_configured():
        sys.exit("СТОП: Cloudinary недоступен. Ключи из .env не загрузились")
    try:
        import cloudinary.uploader  # noqa: F401
    except ImportError:
        sys.exit("СТОП: не установлен Python-пакет cloudinary")
    if not (BASE / "manage.py").exists():
        sys.exit("СТОП: запускайте файл в каталоге molitvoslov-backend")
    sep = CalendarDay.objects.filter(date_gregorian__range=(date(2026, 9, 1), date(2026, 9, 30))).count()
    if sep != 30:
        sys.exit("СТОП: сентябрьские дни не найдены, вероятно открыта не та база")
    say("SQLite:", db_path)
    say("Cloudinary: OK; сентябрь: 30/30 дней")
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup = BASE / "backups" / "sqlite" / f"before_nov_dec_2026_{stamp}.sqlite3"
    sqlite_snapshot(db_path, backup)
    say("Полная резервная копия:", backup)
    fix_evmeniy()
    # This isolated path stores only importer's redundant per-day snapshots.
    tmp_backups = BASE / "backups" / "sqlite" / f"temporary_nov_dec_{stamp}"
    tmp_backups.mkdir(parents=True, exist_ok=False)
    log_path = BASE / f"nov_dec_2026_{stamp}.log"
    say("Лог:", log_path)
    say("\n=== НОЯБРЬ (6–30) И ДЕКАБРЬ (1–31) ===")
    ok, skipped, failed = [], [], []
    all_dates = [*dates(date(2026, 11, 6), date(2026, 11, 30)), *dates(date(2026, 12, 1), date(2026, 12, 31))]
    for i, target in enumerate(all_dates, 1):
        # Earlier November 1-5 and all of October are NEVER candidates.
        if day_is_imported(target):
            say(f"[{i}/{len(all_dates)}] {target}: SKIP (Azbyka уже импортирована)")
            skipped.append(str(target))
            continue
        say(f"[{i}/{len(all_dates)}] {target}: импорт...")
        # Preserve old icon only if December 19 remains St. Nicholas after import.
        old_main = CalendarDay.objects.select_related("main_feast").filter(date_gregorian=target).first()
        old_icon = (old_main.main_feast.icon_url if old_main and old_main.main_feast else "") or ""
        old_nicholas = bool(old_main and old_main.main_feast and "никола" in normalized(old_main.main_feast.title))
        success, detail = run_import_one(target, tmp_backups, log_path)
        if not success:
            failed.append(str(target))
            say(f"  ОШИБКА {target}:", detail[-1600:], flush=True)
            say("  Работа продолжится со следующим днём.")
            # Stop if Cloudinary credentials fail in real uploader, not on individual failures.
            continue
        if target == date(2026, 12, 19) and old_icon and old_nicholas:
            fresh = CalendarDay.objects.select_related("main_feast").get(date_gregorian=target)
            if fresh.main_feast and not fresh.main_feast.icon_url and "никола" in normalized(fresh.main_feast.title):
                CalendarFeast.objects.filter(pk=fresh.main_feast_id, icon_url="").update(icon_url=old_icon)
                say("  Восстановлена ранее существовавшая икона святителя Николая")
        ok.append(str(target))
        say(f"  OK: {main_stats(target)}", flush=True)
        # The full SQLite snapshot survives; discard only temp importer snapshots
        # of a successfully committed day to avoid 100+ redundant large files.
        for candidate in tmp_backups.glob("*.sqlite3"):
            try:
                candidate.unlink()
            except OSError:
                pass
    if not failed:
        try:
            tmp_backups.rmdir()
        except OSError:
            pass
    say("\n=== РЕЗУЛЬТАТ ===")
    say("Импортировано в этом запуске:", len(ok), "| Пропущено готовых:", len(skipped), "| Ошибок:", len(failed))
    if failed:
        say("Дни с ошибками:", ", ".join(failed))
        say("Повторный запуск безопасен: уже импортированные дни будут пропущены")
    audit_period("НОЯБРЬ", date(2026, 11, 1), date(2026, 11, 30))
    audit_period("ДЕКАБРЬ", date(2026, 12, 1), date(2026, 12, 31))
    ev = CalendarFeast.objects.filter(pk=2331).first()
    say("Житие Евмения:", len(ev.life_content or "") if ev else "нет карточки", "символов")
    say("Полная резервная копия:", backup)
    say("Лог:", log_path)
    say("=== ГОТОВО ===")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        say("\nПрервано вручную. Повторный запуск пропустит уже импортированные дни.")
        raise SystemExit(130)
