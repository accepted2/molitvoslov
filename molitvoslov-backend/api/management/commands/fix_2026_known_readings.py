"""Apply only confirmed fixes of incomplete/formatting reading entries in 2026.

No web fetch, no parser changes, no broad calendar rebuild.
"""
from datetime import date
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction, connections
from api.calendar_models import CalendarDay, CalendarReading
from api.sqlite_backup import create_sqlite_backup
from django.conf import settings
from pathlib import Path

# Delete truncated rows only where a full replacement ALREADY exists on same day.
TRUNCATED = {
    "2026-01-09": [("apostle", "Деян.6:8–15,7", "Деян.6:8–15,7:1–5,47–60 (зач. 17)")],
    "2026-01-16": [("apostle", "Тит.2:11–14,3", "Тит.2:11–14,3:4–7 (302 зач. )")],
    "2026-01-19": [("apostle", "Тит.2:11–14,3", "Тит.2:11–14,3:4–7 (зач. 302)")],
    "2026-01-23": [("apostle", "1Пет.1:1–2,10–12,2", "1Пет.1:1–2,10–12,2:6–10 (зач. 58)")],
}
# Change only when the source value is present and new value absent.
FORMATTING = {
    "2026-10-01": [
        ("apostle", "Еф.5:33–6:9", "Еф.5:33–6:9 (зач. 232)"),
        ("gospel", "Мф.24:13–28", "Мф.24:13–28 (зач. 99)"),
    ],
    "2026-10-03": [("apostle", "1Кор.1:26-29 (зач. 125 от полу́)", "1Кор.1:26–29 (зач. 125 от полу́)")],
    "2026-10-04": [("apostle", "2Кор.9:6-11 (зач. 188)", "2Кор.9:6–11 (зач. 188)")],
}
# Drop demonstrably incomplete rows only if their full form is present.
TRUNCATED.update({
    "2026-10-09": [("gospel", "Ин.19:25–27,21", "Ин.19:25–27,21:24–25")],
    "2026-10-14": [("gospel", "Лк.10:38–42,11", "Лк.10:38–42,11:27–28")],
    "2026-10-26": [("gospel", "Лк.10:38–42,11", "Лк.10:38–42,11:27–28")],
    "2026-11-04": [("gospel", "Лк.10:38–42,11", "Лк.10:38–42,11:27–28")],
})

class Command(BaseCommand):
    help = "Only known 2026 reading corrections; dry run by default, guarded, SQLite backup."

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true")

    def handle(self, *args, **opts):
        if connections["default"].vendor != "sqlite":
            raise CommandError("Local SQLite only")
        ops = []
        for day_str, items in sorted(TRUNCATED.items()):
            for kind, incomplete, full in items:
                qs = CalendarReading.objects.filter(day__date_gregorian=date.fromisoformat(day_str), kind=kind, title=incomplete)
                if not qs.exists():
                    self.stdout.write(f"SKIP {day_str}: missing old {incomplete}")
                    continue
                replacement = CalendarReading.objects.filter(
                    day__date_gregorian=date.fromisoformat(day_str),kind=kind,title__startswith=full)
                if not replacement.exists():
                    # Some existing titles format the zachalo differently;
                    # require matching book+full verse span without numbering.
                    verse = full.split(" (")[0]
                    replacement = CalendarReading.objects.filter(
                        day__date_gregorian=date.fromisoformat(day_str), kind=kind, title__startswith=verse)
                if not replacement.exists():
                    self.stdout.write(f"BLOCK {day_str}: full target not found for {incomplete}; preserved")
                    continue
                ops.extend([("delete", r.pk, day_str, incomplete, full) for r in qs])
        for day_str, items in sorted(FORMATTING.items()):
            for kind, old, new in items:
                qs = CalendarReading.objects.filter(day__date_gregorian=date.fromisoformat(day_str),kind=kind,title=old)
                if qs.count()!=1:
                    self.stdout.write(f"SKIP {day_str}: old value missing/ambiguous {old}")
                    continue
                if CalendarReading.objects.filter(day__date_gregorian=date.fromisoformat(day_str),kind=kind,title=new).exists():
                    self.stdout.write(f"BLOCK {day_str}: corrected version already exists; preserved")
                    continue
                ops.append(("replace", qs.first().pk, day_str, old, new))
        for action, pk, ds, old, new in ops:
            self.stdout.write(f"{action.upper()} {ds} row={pk}: {old} -> {new}")
        self.stdout.write(f"TOTAL: {len(ops)} proposed row operations")
        if not opts["apply"]:
            self.stdout.write("DRY RUN. Pass --apply to execute guarded operations.")
            return
        if not ops:
            self.stdout.write("No changes.")
            return
        source = Path(settings.DATABASES["default"]["NAME"])
        backup, checksum = create_sqlite_backup(source, Path(settings.BASE_DIR)/"backups"/"sqlite")
        self.stdout.write(f"BACKUP: {backup} SHA256: {checksum}")
        with transaction.atomic():
            for action, pk, ds, old, new in ops:
                locked = CalendarReading.objects.select_for_update().get(pk=pk)
                if locked.title != old or locked.day.date_gregorian != date.fromisoformat(ds):
                    raise CommandError("Data changed, rollback")
                if action == "delete":
                    locked.delete()
                else:
                    locked.title = new
                    locked.save(update_fields=["title", "updated_at"])
        self.stdout.write(f"APPLIED: {len(ops)} changes. 2025/2027 and Supabase untouched.")
