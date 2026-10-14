"""Repair imported holiday titles without re-importing calendar content."""

from datetime import date, timedelta
from pathlib import Path
import requests
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from api.azbyka_calendar_feasts import fetch_day_saint_links, AzbykaFeastError
from api.calendar_models import CalendarDay, CalendarFeast
from api.management.commands.import_azbyka_calendar_feasts import deterministic_azbyka_day_feast_uid
from api.sqlite_backup import create_sqlite_backup


class Command(BaseCommand):
    help = "Исправить названия предпразднств, попразднств и отданий без изменений других полей."

    def add_arguments(self, parser):
        parser.add_argument("--range", nargs=2, required=True, metavar=("START", "END"))
        mode = parser.add_mutually_exclusive_group(required=True)
        mode.add_argument("--dry-run", action="store_true")
        mode.add_argument("--apply", action="store_true")

    def handle(self, *args, **options):
        db = settings.DATABASES["default"]
        if db["ENGINE"] != "django.db.backends.sqlite3":
            raise CommandError("Разрешена только локальная SQLite.")
        try:
            start, end = [date.fromisoformat(v) for v in options["range"]]
        except ValueError as exc:
            raise CommandError("Укажите YYYY-MM-DD.") from exc
        if end < start or (end - start).days > 366:
            raise CommandError("Некорректный диапазон.")
        changes = []
        session = requests.Session()
        try:
            current = start
            while current <= end:
                day = CalendarDay.objects.filter(date_gregorian=current).first()
                if day is None:
                    self.stdout.write(
                        self.style.WARNING(f"SKIP {current}: CalendarDay отсутствует")
                    )
                    current += timedelta(days=1)
                    continue
                try:
                    sources = fetch_day_saint_links(current, session=session)
                except AzbykaFeastError as exc:
                    raise CommandError(f"{current}: {exc}") from exc
                ids = set(day.feasts.values_list("pk", flat=True))
                for source in sources:
                    if "/days/prazdnik-" not in source.url:
                        continue
                    feast = CalendarFeast.objects.filter(
                        sync_uid=deterministic_azbyka_day_feast_uid(current, source.url),
                        pk__in=ids,
                    ).first()
                    if feast is None or feast.title == source.title:
                        continue
                    changes.append((feast.pk, feast.title, source.title, current))
                    self.stdout.write(f"{current} [{feast.pk}]: {feast.title} -> {source.title}")
                current += timedelta(days=1)
        finally:
            session.close()

        self.stdout.write(f"Найдено исправлений: {len(changes)}")
        if not options["apply"] or not changes:
            self.stdout.write(
                "DRY-RUN: база не изменена." if not options["apply"] else "Изменений нет."
            )
            return
        backup, digest = create_sqlite_backup(
            Path(db["NAME"]), Path(settings.BASE_DIR) / "backups" / "sqlite"
        )
        self.stdout.write(f"BACKUP: {backup} SHA256: {digest}")
        with transaction.atomic():
            for pk, old_title, new_title, _ in changes:
                # Guard against concurrent edits; update title only.
                updated = CalendarFeast.objects.filter(pk=pk, title=old_title).update(
                    title=new_title
                )
                if not updated:
                    raise CommandError(
                        f"Карточка {pk} изменилась во время работы; транзакция отменена."
                    )
        self.stdout.write(self.style.SUCCESS(f"Исправлено заголовков: {len(changes)}"))
