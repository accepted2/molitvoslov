"""Export baseline offline data from the configured Django database.

Writes app bundled public content and existing calendar month assets.
Does NOT change database content or publish deltas.
"""
import json
import shutil
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction

from api.calendar_models import CalendarDay
from api.calendar_serializers import CalendarDaySerializer
from api.mobile_content import build_mobile_content_payload
from api.bible_content import build_bible_content_payload


class Command(BaseCommand):
    help = "Safely rebuild bundled public, Bible and 2025-2027 calendar from current database."

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true", help="Write files; otherwise validate and report only")

    def handle(self, *args, **options):
        data_dir = settings.BASE_DIR.parent / "molitvoslov-app" / "src" / "data"
        calendar_dir = data_dir / "calendar"
        if not data_dir.is_dir() or not calendar_dir.is_dir():
            raise CommandError(f"Offline asset directories are missing: {data_dir}")

        targets = {}
        with transaction.atomic():
            public = build_mobile_content_payload()
            targets[data_dir / "offlineContent.json"] = public
            bible = build_bible_content_payload("rst")
            if not bible:
                raise CommandError("Visible rst Bible translation not found")
            targets[data_dir / "offlineBible.json"] = bible

            days = CalendarDay.objects.select_related("main_feast", "fast_type").prefetch_related(
                "feasts", "readings"
            ).order_by("date_gregorian")
            months = defaultdict(lambda: {"days": {}})
            languages = {
                lang: {"request": SimpleNamespace(query_params={"lang": lang}, headers={})}
                for lang in ("ru", "uk")
            }
            day_count = 0
            for day in days.iterator(chunk_size=64):
                date = day.date_gregorian.isoformat()
                month = date[:7]
                if not (2025 <= day.date_gregorian.year <= 2027):
                    continue
                months[month]["days"][date] = {
                    lang: CalendarDaySerializer(day, context=languages[lang]).data
                    for lang in ("ru", "uk")
                }
                day_count += 1

            if day_count != 1095 or len(months) != 36:
                raise CommandError(
                    f"Expected 1095 days and 36 months for 2025-2027; got {day_count} days, {len(months)} months"
                )
            for month, payload in months.items():
                path = calendar_dir / f"{month}.json"
                if not path.is_file():
                    raise CommandError(f"Existing bundled month file absent: {path}")
                with path.open(encoding="utf-8") as existing_file:
                    existing = json.load(existing_file)
                if not isinstance(existing, dict) or not isinstance(existing.get("days"), dict):
                    raise CommandError(f"Unexpected month asset structure: {path}")
                existing["days"] = payload["days"]
                targets[path] = existing

        self.stdout.write(f"Prepared {len(targets)} files (public, Bible, {len(months)} calendar months); days={day_count}")
        if not options["apply"]:
            self.stdout.write("DRY RUN: no files or database records changed. Use --apply to replace bundled assets.")
            return

        backup = settings.BASE_DIR.parent / (
            "offline_bundle_backup_" + datetime.now().strftime("%Y%m%d_%H%M%S")
        )
        backup.mkdir(parents=True, exist_ok=False)
        try:
            for path in targets:
                destination = backup / path.relative_to(data_dir)
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(path, destination)
            # Prepare every JSON before modifying the first asset.
            serialized = {
                path: json.dumps(value, ensure_ascii=False, cls=DjangoJSONEncoder, separators=(",", ":")) + "\n"
                for path, value in targets.items()
            }
            for path, content in serialized.items():
                temporary = path.with_suffix(path.suffix + ".tmp")
                temporary.write_text(content, encoding="utf-8")
                temporary.replace(path)
        except Exception as exc:
            raise CommandError(f"Export failed. Backups are preserved at {backup}: {exc}") from exc
        self.stdout.write(self.style.SUCCESS(
            f"Updated {len(targets)} bundled files from database; previous copies in {backup}"
        ))
