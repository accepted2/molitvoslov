"""Fill missing Cloudinary icon URLs without touching calendar texts or links."""
from datetime import date, timedelta
from pathlib import Path
import time

import requests
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connections

from api.azbyka_calendar_feasts import AzbykaFeastError, fetch_day_saint_links, fetch_saint_content
from api.calendar_icon_storage import CalendarIconStorageError, cloudinary_configured, upload_azbyka_icon
from api.calendar_models import CalendarDay
from api.management.commands.import_azbyka_calendar_feasts import deterministic_azbyka_day_feast_uid
from api.sqlite_backup import create_sqlite_backup


class Command(BaseCommand):
    help = "Загрузить отсутствующие иконы Azbyka в Cloudinary, не изменяя другие поля."

    def add_arguments(self, parser):
        parser.add_argument("--range", nargs=2, required=True, metavar=("START", "END"))
        mode = parser.add_mutually_exclusive_group(required=True)
        mode.add_argument("--dry-run", action="store_true")
        mode.add_argument("--apply", action="store_true")
        parser.add_argument("--timeout", type=float, default=20)
        parser.add_argument("--delay", type=float, default=0.35)

    def handle(self, *args, **options):
        db = settings.DATABASES["default"]
        if db["ENGINE"] != "django.db.backends.sqlite3":
            raise CommandError("Команда разрешена только для локальной SQLite.")

        try:
            start, end = [date.fromisoformat(s) for s in options["range"]]
        except ValueError as exc:
            raise CommandError("Используйте даты YYYY-MM-DD.") from exc
        if end < start:
            raise CommandError("Дата END должна быть не раньше START.")
        if (end - start).days > 366:
            raise CommandError("За один запуск можно обработать максимум 367 дней.")
        if options["apply"] and not cloudinary_configured():
            raise CommandError("Cloudinary не настроен. Проверьте переменные окружения.")

        # Source URLs are not stored on CalendarFeast. Recover them from the
        # day listing and verify the deterministic import UID before updating.
        current = start
        uploaded = missing = skipped = errors = 0
        backup_created = False
        session = requests.Session()
        try:
            while current <= end:
                day = CalendarDay.objects.prefetch_related("feasts").filter(date_gregorian=current).first()
                if day is None:
                    self.stdout.write(self.style.WARNING(f"{current}: CalendarDay отсутствует"))
                    current += timedelta(days=1)
                    continue
                pending = {f.sync_uid: f for f in day.feasts.all() if not f.icon_url and f.sync_uid}
                if not pending:
                    self.stdout.write(f"{current}: нет пустых icon_url у импортированных карточек")
                    current += timedelta(days=1)
                    continue
                try:
                    sources = fetch_day_saint_links(
                        current, session=session, timeout=max(1.0, options["timeout"])
                    )
                except AzbykaFeastError as exc:
                    errors += 1
                    self.stdout.write(self.style.ERROR(f"{current}: {exc}"))
                    current += timedelta(days=1)
                    continue

                for source in sources:
                    feast = pending.pop(deterministic_azbyka_day_feast_uid(current, source.url), None)
                    if feast is None:
                        continue
                    try:
                        parsed = fetch_saint_content(
                            source.url, session=session, timeout=max(1.0, options["timeout"])
                        )
                    except AzbykaFeastError as exc:
                        errors += 1
                        self.stdout.write(self.style.ERROR(f"{current}: {source.title}: {exc}"))
                        continue
                    if not parsed.icon_source_url:
                        missing += 1
                        self.stdout.write(f"{current}: нет иконы на Azbyka: {source.title}")
                        continue
                    if not options["apply"]:
                        skipped += 1
                        self.stdout.write(f"DRY-RUN {current}: {source.title} -> {parsed.icon_source_url}")
                        continue
                    if not backup_created:
                        db_path = Path(db["NAME"])
                        backup_dir = Path(settings.BASE_DIR) / "backups" / "sqlite"
                        backup, digest = create_sqlite_backup(db_path, backup_dir)
                        self.stdout.write(f"BACKUP: {backup} SHA256: {digest}")
                        backup_created = True
                    try:
                        url = upload_azbyka_icon(parsed.icon_source_url, source.url)
                    except CalendarIconStorageError as exc:
                        errors += 1
                        self.stdout.write(self.style.ERROR(f"{current}: {source.title}: {exc}"))
                        continue
                    # Update only an empty icon_url; no texts or feast relations change.
                    from api.calendar_models import CalendarFeast
                    changed = CalendarFeast.objects.filter(pk=feast.pk, icon_url="").update(icon_url=url)
                    uploaded += changed
                    self.stdout.write(self.style.SUCCESS(f"OK {current}: {source.title}" if changed else f"SKIP {current}: уже заполнено"))
                    time.sleep(max(0.0, options["delay"]))
                if pending:
                    skipped += len(pending)
                    self.stdout.write(self.style.WARNING(f"{current}: {len(pending)} карточек не совпали с источником по UID"))
                current += timedelta(days=1)
        finally:
            session.close()
        self.stdout.write(f"ИТОГ: загружено={uploaded}, на Azbyka без иконы={missing}, dry-run/пропущено={skipped}, ошибок={errors}.")
        if errors:
            raise CommandError("Есть ошибки загрузки; проверьте вывод и повторите для незаполненных икон.")
