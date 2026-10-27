"""Compare bundled public content and calendar with current backend without modifying data.

The comparison is intentionally conservative. Missing or unmatched bundled data
blocks baseline publication until the team rebuilds the bundled assets.
"""
import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from api.mobile_content import build_mobile_content_payload
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
        if differences:
            raise CommandError(
                "Public bundle differs from Supabase in: " + ", ".join(differences) +
                ". Do not create baseline until full public, Bible, and calendar checks pass."
            )
        self.stdout.write(self.style.SUCCESS(
            "Public bundle matches. Bible and calendar require separate checks before baseline."
        ))
