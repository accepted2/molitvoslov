"""Repair obviously broken short life texts without changing any other fields."""
from datetime import date
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from api.azbyka_calendar_feasts import AzbykaFeastError, fetch_saint_content
from api.calendar_models import CalendarDay
from api.sqlite_backup import create_sqlite_backup


class Command(BaseCommand):
    help = "Восстановить житие выбранной карточки по персональной странице Azbyka."

    def add_arguments(self, parser):
        parser.add_argument("--date", required=True)
        parser.add_argument("--title-contains", required=True)
        parser.add_argument("--source-url", required=True)
        mode = parser.add_mutually_exclusive_group(required=True)
        mode.add_argument("--dry-run", action="store_true")
        mode.add_argument("--apply", action="store_true")

    def handle(self, *args, **options):
        db = settings.DATABASES["default"]
        if db["ENGINE"] != "django.db.backends.sqlite3":
            raise CommandError("Команда предназначена только для локальной SQLite.")
        try:
            day_date = date.fromisoformat(options["date"])
        except ValueError as exc:
            raise CommandError("Некорректная дата YYYY-MM-DD.") from exc
        day = CalendarDay.objects.filter(date_gregorian=day_date).first()
        if day is None:
            raise CommandError("CalendarDay не найден.")
        matches = [
            f for f in day.feasts.all()
            if options["title_contains"].casefold() in f.title.casefold()
        ]
        if len(matches) != 1:
            raise CommandError(f"Нужно ровно одно совпадение карточки, найдено: {len(matches)}.")
        feast = matches[0]
        try:
            parsed = fetch_saint_content(options["source_url"])
        except AzbykaFeastError as exc:
            raise CommandError(str(exc)) from exc
        if len(parsed.life_content.strip()) < 100:
            raise CommandError("Полученное житие слишком короткое; сохранение отменено.")
        if options["title_contains"].casefold() not in parsed.title.casefold():
            raise CommandError("Заголовок страницы не соответствует карточке; сохранение отменено.")
        self.stdout.write(f"Карточка: {feast.pk} {feast.title}")
        self.stdout.write(f"Было: {feast.life_title!r}, {len(feast.life_content)} символов")
        self.stdout.write(f"Будет: {parsed.life_title!r}, {len(parsed.life_content)} символов")
        if not options["apply"]:
            self.stdout.write("DRY-RUN: ничего не изменено.")
            return
        backup, digest = create_sqlite_backup(
            Path(db["NAME"]), Path(settings.BASE_DIR) / "backups" / "sqlite"
        )
        self.stdout.write(f"BACKUP: {backup} SHA256: {digest}")
        with transaction.atomic():
            feast.life_title = parsed.life_title
            feast.life_content = parsed.life_content
            feast.save(update_fields=["life_title", "life_content"])
        self.stdout.write(self.style.SUCCESS("Житие восстановлено. Другие поля не изменены."))
