"""Export only Akathists created by the approved Azbyka import, for an additive offline merge.

Never exports or overwrites the other Django content collections.
"""
import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from api.management.commands.audit_azbyka_akathist_catalog import CATALOG_URL, save_json
from api.models import Akathist
from api.serializers import AkathistSerializer, AkathistSummarySerializer


class Command(BaseCommand):
    help = "Экспортирует только импортированные акафисты в промежуточный JSON."

    def add_arguments(self, parser):
        parser.add_argument("--report", default="files/akathists/azbyka_import_report.json")
        parser.add_argument("--output", default="files/akathists/azbyka_export_staged.json")

    def handle(self, *args, **options):
        report_path = Path(options["report"])
        try:
            report = json.loads(report_path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise CommandError("Не удалось прочитать отчёт импорта: " + str(exc)) from exc
        if report.get("source") != CATALOG_URL or not isinstance(report.get("pages"), dict):
            raise CommandError("Неизвестный источник отчёта импорта.")
        slugs = {
            value.get("slug") for value in report["pages"].values()
            if isinstance(value, dict) and value.get("status") == "imported" and value.get("slug")
        }
        if not slugs:
            raise CommandError("Нет импортированных акафистов; экспорт пустого пакета отменён.")
        qs = Akathist.objects.filter(slug__in=slugs, is_visible=True).order_by("id")
        count = qs.count()
        if count != len(slugs):
            actual = set(qs.values_list("slug", flat=True))
            raise CommandError(
                "В Django нет части импортированных акафистов: "
                + ", ".join(sorted(slugs - actual)[:10])
            )
        details = AkathistSerializer(
            qs.select_related("troparion", "kontakion_before").prefetch_related(
                "sections__text__categories"
            ), many=True
        ).data
        listed = AkathistSummarySerializer(qs, many=True).data
        payload = {
            "schema_version": 1,
            "akathists": {
                "list": list(listed),
                "by_slug": {item["slug"]: item for item in details},
            },
        }
        if len(payload["akathists"]["by_slug"]) != count:
            raise CommandError("Экспорт содержит повторяющиеся slug.")
        save_json(Path(options["output"]), payload)
        self.stdout.write(self.style.SUCCESS(
            f"Экспортировано акафистов: {count}; файл: {options['output']}"
        ))
        self.stdout.write("Другие молитвы и offlineContent.json не изменены.")
