"""Audit and repair date-only calendar lives in a date range, without reimporting."""
import re
from datetime import date, timedelta
from pathlib import Path
import requests
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from api.azbyka_calendar_feasts import fetch_day_saint_links, fetch_saint_content, AzbykaFeastError
from api.calendar_models import CalendarDay, CalendarFeast
from api.management.commands.import_azbyka_calendar_feasts import deterministic_azbyka_day_feast_uid
from api.sqlite_backup import create_sqlite_backup

DATE_ONLY = re.compile(r"(?is)^\s*\d{1,2}\s+[а-яё]+(?:\s*\([^)]*\))?(?:\s*\n+\s*\d{1,2}\s+[а-яё]+(?:\s*\([^)]*\))?)*\s*$")

class Command(BaseCommand):
    help = "Исправить жития, ошибочно содержащие только даты памяти."
    def add_arguments(self, parser):
        parser.add_argument("--range", nargs=2, required=True, metavar=("START", "END"))
        mode = parser.add_mutually_exclusive_group(required=True)
        mode.add_argument("--dry-run", action="store_true")
        mode.add_argument("--apply", action="store_true")

    def handle(self, *args, **options):
        if settings.DATABASES["default"]["ENGINE"] != "django.db.backends.sqlite3":
            raise CommandError("Только локальная SQLite.")
        try:
            start, end = [date.fromisoformat(v) for v in options["range"]]
        except ValueError as exc:
            raise CommandError("Неверная дата, ожидается YYYY-MM-DD.") from exc
        if end < start or (end - start).days > 366:
            raise CommandError("Некорректный диапазон.")
        session = requests.Session()
        changes = []
        unresolved = []
        current = start
        try:
            while current <= end:
                day = CalendarDay.objects.prefetch_related("feasts").filter(date_gregorian=current).first()
                if day is None:
                    current += timedelta(days=1)
                    continue
                candidates = {f.sync_uid: f for f in day.feasts.all() if DATE_ONLY.fullmatch(f.life_content or "")}
                if not candidates:
                    current += timedelta(days=1)
                    continue
                try:
                    sources = fetch_day_saint_links(current, session=session)
                except AzbykaFeastError as exc:
                    raise CommandError(f"{current}: {exc}") from exc
                for source in sources:
                    feast = candidates.pop(deterministic_azbyka_day_feast_uid(current, source.url), None)
                    if feast is None:
                        continue
                    try:
                        parsed = fetch_saint_content(source.url, session=session)
                    except AzbykaFeastError as exc:
                        unresolved.append((current, feast.pk, str(exc)))
                        continue
                    new_content = (parsed.life_content or "").strip()
                    if len(new_content) >= 100 and not DATE_ONLY.fullmatch(new_content):
                        new_title = parsed.life_title or feast.life_title
                        changes.append((feast.pk, feast.life_content, feast.life_title, new_content, new_title))
                        self.stdout.write(f"RESTORE {current} [{feast.pk}] {source.title}: {len(feast.life_content)} -> {len(new_content)}")
                    else:
                        # Never pretend the date is a life. Empty content will hide
                        # the life accordion, but only if the source was checked.
                        changes.append((feast.pk, feast.life_content, feast.life_title, "", ""))
                        self.stdout.write(f"CLEAR {current} [{feast.pk}] {source.title}: на Azbyka нет полного жития")
                for feast in candidates.values():
                    unresolved.append((current, feast.pk, "Не удалось сопоставить карточку с источником"))
                current += timedelta(days=1)
        finally:
            session.close()

        for day, pk, reason in unresolved:
            self.stdout.write(self.style.WARNING(f"UNRESOLVED {day} [{pk}]: {reason}"))
        self.stdout.write(f"Кандидатов на исправление: {len(changes)}; требуют проверки: {len(unresolved)}.")
        if not options["apply"]:
            self.stdout.write("DRY-RUN: база не изменена.")
            return
        if unresolved:
            raise CommandError("Есть нерешённые карточки. Изменения не применены.")
        if not changes:
            return
        backup, digest = create_sqlite_backup(Path(settings.DATABASES["default"]["NAME"]), Path(settings.BASE_DIR)/"backups"/"sqlite")
        self.stdout.write(f"BACKUP: {backup} SHA256: {digest}")
        with transaction.atomic():
            for pk, old, old_title, new, new_title in changes:
                updated = CalendarFeast.objects.filter(pk=pk, life_content=old, life_title=old_title).update(life_content=new, life_title=new_title)
                if updated != 1:
                    raise CommandError(f"Карточка {pk} была изменена. Транзакция отменена.")
        self.stdout.write(self.style.SUCCESS(f"Исправлено: {len(changes)}"))
