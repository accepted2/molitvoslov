import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand

from api.mobile_content import build_mobile_content_payload


class Command(BaseCommand):
    help = "Экспортирует весь публичный контент для офлайн-версии приложения."

    def add_arguments(self, parser):
        default_output = (
            settings.BASE_DIR.parent / "molitvoslov-app" / "src" / "data" / "offlineContent.json"
        )

        parser.add_argument(
            "--output",
            default=str(default_output),
            help="Куда сохранить offlineContent.json",
        )

    def handle(self, *args, **options):
        output_path = Path(options["output"]).resolve()
        output_path.parent.mkdir(parents=True, exist_ok=True)

        payload = build_mobile_content_payload()

        with output_path.open("w", encoding="utf-8") as file:
            json.dump(
                payload,
                file,
                ensure_ascii=False,
                indent=2,
            )
            file.write("\n")

        self.stdout.write(self.style.SUCCESS(f"Офлайн-контент сохранён: {output_path}"))
        self.stdout.write(
            "Категории: {categories}; правила: {rules}; "
            "акафисты: {akathists}; каноны: {canons}; "
            "кафизмы: {kathismas}; цитаты: {quotes}".format(
                categories=len(payload["categories"]),
                rules=len(payload["prayer_rules"]["list"]),
                akathists=len(payload["akathists"]["list"]),
                canons=len(payload["canons"]["list"]),
                kathismas=len(payload["kathismas"]["by_number"]),
                quotes=len(payload["daily_quotes"]),
            )
        )
