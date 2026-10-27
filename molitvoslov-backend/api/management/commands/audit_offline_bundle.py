"""Compare bundled public content and calendar with current backend without modifying data.

The comparison is intentionally conservative. Missing or unmatched bundled data
blocks baseline publication until the team rebuilds the bundled assets.
"""
import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from api.mobile_content import build_mobile_content_payload
from api.bible_content import build_bible_content_payload
from api.calendar_models import CalendarDay
from api.calendar_serializers import CalendarDaySerializer
from types import SimpleNamespace
from api.management.commands.publish_offline_content_updates import signature

ROOT = Path(__file__).resolve().parents[4]
APP_DATA = ROOT / "molitvoslov-app" / "src" / "data"


class Command(BaseCommand):
    help = "Check the bundled public JSON against the database without writing changes."

    def handle(self, *args, **options):
        bundled_file = APP_DATA / "offlineContent.json"
        if not bundled_file.is_file():
            raise CommandError(f"Bundled public JSON not found: {bundled_file}")
        try:
            with bundled_file.open(encoding="utf-8") as handle:
                bundled = json.load(handle)
        except (ValueError, OSError) as exc:
            raise CommandError(f"Cannot load bundled public content: {exc}") from exc

        server = build_mobile_content_payload()
        groups = ("categories", "category_texts", "texts", "prayer_rules",
                  "psalters", "kathismas", "akathists", "canons", "daily_quotes")
        differences = []
        for group in groups:
            if signature(bundled.get(group)) != signature(server.get(group)):
                differences.append(group)
                self.stdout.write(self.style.WARNING(f"DIFF: {group}"))
            else:
                self.stdout.write(self.style.SUCCESS(f"MATCH: {group}"))
        bundled_bible_file = APP_DATA / "offlineBible.json"
        if not bundled_bible_file.is_file():
            differences.append("bible: missing bundle")
        else:
            with bundled_bible_file.open(encoding="utf-8") as handle:
                bundled_bible = json.load(handle)
            remote_bible = build_bible_content_payload("rst")
            if remote_bible is None or signature(bundled_bible.get("translation")) != signature(remote_bible.get("translation")) or signature(bundled_bible.get("books")) != signature(remote_bible.get("books")):
                differences.append("bible")
                self.stdout.write(self.style.WARNING("DIFF: bible"))
            else:
                self.stdout.write(self.style.SUCCESS("MATCH: bible"))

        calendar_root = APP_DATA / "calendar"
        calendar_mismatches = 0
        calendar_checked = 0
        for month_file in sorted(calendar_root.glob("????-??.json")):
            with month_file.open(encoding="utf-8") as handle:
                payload = json.load(handle)
            dates = payload.get("days", {})
            for date, languages in dates.items():
                day = CalendarDay.objects.filter(date_gregorian=date).first()
                if day is None:
                    calendar_mismatches += 1
                    continue
                for lang in ("ru", "uk"):
                    bundled_day = languages.get(lang)
                    context = {"request": SimpleNamespace(query_params={"lang": lang}, headers={})}
                    remote_day = CalendarDaySerializer(day, context=context).data
                    calendar_checked += 1
                    if signature(bundled_day) != signature(remote_day):
                        calendar_mismatches += 1
                        if calendar_mismatches <= 10:
                            self.stdout.write(self.style.WARNING(f"DIFF: calendar {date}/{lang}"))
        if calendar_checked == 0 or calendar_mismatches:
            differences.append(f"calendar ({calendar_mismatches} mismatches / {calendar_checked} checked)")
        self.stdout.write(f"Calendar: checked={calendar_checked}, mismatches={calendar_mismatches}")

        if differences:
            raise CommandError(
                "Public bundle differs from Supabase in: " + ", ".join(differences) +
                ". Do not create baseline until full public, Bible, and calendar checks pass."
            )
        self.stdout.write(self.style.SUCCESS("Public, Bible and bundled calendar objects match."))
