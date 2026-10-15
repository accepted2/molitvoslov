"""Repair April 2026 main commemorations after experimental weekday feast cards."""
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from api.calendar_models import CalendarDay
from api.sqlite_backup import create_sqlite_backup


# Exact imported memorials verified in the April 2026 audit.
MAIN_IDS = {
    "2026-04-06": 4126,
    "2026-04-07": 4135,
    "2026-04-08": 4140,
    "2026-04-09": 4146,
    "2026-04-10": 4149,
    "2026-04-11": 4158,
    "2026-04-12": 236,
    "2026-04-15": 4193,
    "2026-04-16": 4198,
    "2026-04-19": 4224,
}
# Our temporary records, not genuine imported saints or great feasts.
TEMP_IDS = set(range(4305, 4316))
TEMP_TITLES = {
    "Понедельник Светлой седмицы",
    "Радоница",
}


class Command(BaseCommand):
    help = "Safely restore main saints and remove weekday-label cards for April 2026."

    def add_arguments(self, parser):
        group = parser.add_mutually_exclusive_group(required=True)
        group.add_argument("--dry-run", action="store_true")
        group.add_argument("--apply", action="store_true")

    def handle(self, *args, **options):
        if settings.DATABASES["default"]["ENGINE"] != "django.db.backends.sqlite3":
            raise CommandError("Только локальная SQLite.")
        days = {
            str(d.date_gregorian): d
            for d in CalendarDay.objects.filter(
                date_gregorian__range=("2026-04-01", "2026-04-30")
            ).prefetch_related("feasts").select_related("main_feast")
        }
        assert len(days) == 30, "Не все дни апреля присутствуют"
        target_dates = set(MAIN_IDS) | {
            "2026-04-13", "2026-04-14", "2026-04-18", "2026-04-21"
        }
        plans = []
        for date in sorted(target_dates):
            day = days[date]
            attached = list(day.feasts.all())
            legitimate = [
                f for f in attached
                if f.pk not in TEMP_IDS and f.title not in TEMP_TITLES
            ]
            if date in MAIN_IDS:
                new_main = next((f for f in legitimate if f.pk == MAIN_IDS[date]), None)
            elif date == "2026-04-14":
                new_main = next((f for f in legitimate if "Иверской иконы" in f.title), None)
            elif date == "2026-04-18":
                new_main = next((f for f in legitimate if "Святитель Иов" in f.title), None)
            else:
                new_main = next(
                    (f for f in sorted(
                        legitimate,
                        key=lambda f: (bool(f.icon_url), bool(f.life_content), -f.pk),
                        reverse=True,
                    ) if f.life_content), None
                )
            if new_main is None:
                raise CommandError(f"{date}: не найдена безопасная главная память")
            remove = [f for f in attached if f.pk in TEMP_IDS or f.title in TEMP_TITLES]
            plans.append((day, new_main, remove))
            self.stdout.write(
                f"{date}: MAIN -> [{new_main.pk}] {new_main.title}; "
                f"отвязать служебных карточек: {[f.pk for f in remove]}"
            )

        if not options["apply"]:
            self.stdout.write("DRY-RUN: изменений нет.")
            return
        backup, digest = create_sqlite_backup(
            Path(settings.DATABASES["default"]["NAME"]),
            Path(settings.BASE_DIR) / "backups" / "sqlite",
        )
        self.stdout.write(f"BACKUP: {backup}\nSHA256: {digest}")
        with transaction.atomic():
            for day, main, remove in plans:
                if remove:
                    day.feasts.remove(*remove)
                day.main_feast = main
                day.save(update_fields=["main_feast"])
                assert day.feasts.filter(pk=main.pk).exists()
        self.stdout.write(self.style.SUCCESS("Готово: основные памяти восстановлены."))
