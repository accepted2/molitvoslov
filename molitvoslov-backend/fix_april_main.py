from pathlib import Path

from django.conf import settings
from django.db import transaction

from api.sqlite_backup import create_sqlite_backup
from api.calendar_models import CalendarDay, CalendarFeast

changes = {
    "2026-04-07": 4135,
    "2026-04-12": 236,
}

days = {
    date: CalendarDay.objects.get(date_gregorian=date)
    for date in changes
}
feasts = {
    pk: CalendarFeast.objects.get(pk=pk)
    for pk in changes.values()
}

assert days["2026-04-07"].feasts.filter(pk=4135).exists()
assert feasts[236].title == "Светлое Христово Воскресение"

backup, digest = create_sqlite_backup(
    Path(settings.DATABASES["default"]["NAME"]),
    Path(settings.BASE_DIR) / "backups" / "sqlite",
)

print("BACKUP:", backup)
print("SHA256:", digest)

with transaction.atomic():
    for date, pk in changes.items():
        day = days[date]
        feast = feasts[pk]

        day.feasts.add(feast)
        day.main_feast = feast
        day.save(update_fields=["main_feast"])

        print(date, "MAIN:", feast.title)
