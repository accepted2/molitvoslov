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
from collections import Counter
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
        def describe(label, left, right):
            if isinstance(left, dict) and isinstance(right, dict):
                only_server = sorted(set(right) - set(left))
                only_bundle = sorted(set(left) - set(right))
                changed = sorted(k for k in set(left) & set(right)
                                 if signature(left[k]) != signature(right[k]))
                self.stdout.write(f"  {label}: only_server={only_server[:5]}, only_bundle={only_bundle[:5]}, changed={changed[:5]}")
            elif isinstance(left, list) and isinstance(right, list):
                self.stdout.write(f"  {label}: bundled_items={len(left)}, server_items={len(right)}")

        for group in groups:
            if signature(bundled.get(group)) != signature(server.get(group)):
                differences.append(group)
                self.stdout.write(self.style.WARNING(f"DIFF: {group}"))
                describe(group, bundled.get(group), server.get(group))
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
        field_diff_counts = Counter()
        days_by_date = {
            day.date_gregorian.isoformat(): day
            for day in CalendarDay.objects.select_related(
                "main_feast", "fast_type"
            ).prefetch_related("feasts", "readings")
        }
        for month_file in sorted(calendar_root.glob("????-??.json")):
            with month_file.open(encoding="utf-8") as handle:
                payload = json.load(handle)
            dates = payload.get("days", {})
            for date, languages in dates.items():
                day = days_by_date.get(date)
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
                        if isinstance(bundled_day, dict) and isinstance(remote_day, dict):
                            for field in set(bundled_day) | set(remote_day):
                                if signature(bundled_day.get(field)) != signature(remote_day.get(field)):
                                    field_diff_counts[field] += 1
                        if calendar_mismatches <= 3:
                            describe(f"calendar {date}/{lang}", bundled_day, remote_day)
                        if calendar_mismatches <= 10:
                            self.stdout.write(self.style.WARNING(f"DIFF: calendar {date}/{lang}"))
        if len(days_by_date) * 2 != calendar_checked:
            differences.append(f"calendar coverage (database days={len(days_by_date)}, bundled translations={calendar_checked})")
        if calendar_checked == 0 or calendar_mismatches:
            differences.append(f"calendar ({calendar_mismatches} mismatches / {calendar_checked} checked)")
        self.stdout.write(f"Calendar: checked={calendar_checked}, mismatches={calendar_mismatches}")
        self.stdout.write(f"Calendar differing fields: {field_diff_counts.most_common(20)}")

        if differences:
            raise CommandError(
                "Public bundle differs from Supabase in: " + ", ".join(differences) +
                ". Do not create baseline until full public, Bible, and calendar checks pass."
            )
        self.stdout.write(self.style.SUCCESS("Public, Bible and bundled calendar objects match."))
