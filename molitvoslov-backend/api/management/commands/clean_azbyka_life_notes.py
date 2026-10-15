"""Remove standalone end-of-life editorial footnotes for a calendar date range."""
import re
from datetime import date
from pathlib import Path
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from api.calendar_models import CalendarDay, CalendarFeast
from api.sqlite_backup import create_sqlite_backup

NOTE_HEADING = re.compile(r"(?m)^Примечания?\s*$")

class Command(BaseCommand):
    help = "Очистить отдельные блоки Примечания в житиях (только life_content)."
    def add_arguments(self, parser):
        parser.add_argument("--range", nargs=2, required=True, metavar=("START", "END"))
        group = parser.add_mutually_exclusive_group(required=True)
        group.add_argument("--dry-run", action="store_true")
        group.add_argument("--apply", action="store_true")

    def handle(self, *args, **options):
        if settings.DATABASES["default"]["ENGINE"] != "django.db.backends.sqlite3":
            raise CommandError("Только для локальной SQLite.")
        try:
            start, end = [date.fromisoformat(v) for v in options["range"]]
        except ValueError as exc:
            raise CommandError("Формат даты YYYY-MM-DD.") from exc
        if end < start or (end - start).days > 366:
            raise CommandError("Некорректный диапазон.")
        ids = set(CalendarDay.objects.filter(date_gregorian__range=(start, end)).values_list("feasts__id", flat=True))
        changes = []
        for f in CalendarFeast.objects.filter(pk__in=ids).order_by("pk"):
            old = f.life_content or ""
            match = NOTE_HEADING.search(old)
            if not match:
                continue
            cleaned = old[:match.start()].rstrip()
            if len(cleaned) < 100 or len(cleaned) < len(old) * 0.5:
                self.stdout.write(self.style.WARNING(f"SKIP {f.pk}: слишком большой срез, нужна ручная проверка"))
                continue
            changes.append((f.pk, old, cleaned))
            self.stdout.write(f"[{f.pk}] {f.title}: {len(old)} -> {len(cleaned)} (-{len(old)-len(cleaned)})")
        self.stdout.write(f"Кандидатов: {len(changes)}")
        if not options["apply"] or not changes:
            self.stdout.write("DRY-RUN: база не изменена." if not options["apply"] else "Нечего изменять.")
            return
        db_path = Path(settings.DATABASES["default"]["NAME"])
        backup, digest = create_sqlite_backup(db_path, Path(settings.BASE_DIR) / "backups" / "sqlite")
        self.stdout.write(f"BACKUP: {backup} SHA256: {digest}")
        with transaction.atomic():
            for pk, old, cleaned in changes:
                updated = CalendarFeast.objects.filter(pk=pk, life_content=old).update(life_content=cleaned)
                if updated != 1:
                    raise CommandError(f"Карточка {pk} изменилась; транзакция отменена.")
        self.stdout.write(self.style.SUCCESS(f"Очищено: {len(changes)}"))
