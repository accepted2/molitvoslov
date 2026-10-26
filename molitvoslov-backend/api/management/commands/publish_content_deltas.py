from django.core.management.base import BaseCommand

from api.content_delta import (
    publish_records, records_for_public, records_for_bible, records_for_calendar,
)
from api.mobile_content import build_mobile_content_payload
from api.bible_content import build_bible_content_payload


class Command(BaseCommand):
    help = "Publish only changed public records to mobile delta feed. Use --initialize once with bundled APK baseline."

    def add_arguments(self, parser):
        parser.add_argument("--initialize", action="store_true", help="Create baseline snapshots without sending the full library to existing APKs")
        parser.add_argument("--public", action="store_true")
        parser.add_argument("--bible", action="store_true")
        parser.add_argument("--calendar", action="store_true")
        parser.add_argument("--years", default="2025,2026,2027")

    def handle(self, *args, **options):
        selected = [options["public"], options["bible"], options["calendar"]]
        all_scopes = not any(selected)
        if all_scopes or options["public"]:
            records = records_for_public(build_mobile_content_payload())
            count = publish_records(records, initialize=options["initialize"])
            self.stdout.write(f"Public records: {len(records)}; changed: {count}")
        if all_scopes or options["bible"]:
            data = build_bible_content_payload("rst")
            if data is None:
                raise RuntimeError("Bible translation rst not found")
            records = records_for_bible(data)
            count = publish_records(records, initialize=options["initialize"])
            self.stdout.write(f"Bible records: {len(records)}; changed: {count}")
        if all_scopes or options["calendar"]:
            years = [int(n.strip()) for n in options["years"].split(",") if n.strip()]
            if not years or any(y < 1900 or y > 2200 for y in years):
                raise RuntimeError("Invalid years")
            records = records_for_calendar(years)
            count = publish_records(records, initialize=options["initialize"])
            self.stdout.write(f"Calendar records: {len(records)}; changed: {count}")
