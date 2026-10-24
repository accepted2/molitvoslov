"""Audit lectionary evidence across locally populated years; READ-ONLY.

python manage.py audit_lectionary_years --years 2025 2026 2027
"""
import json
from pathlib import Path
from django.core.management.base import BaseCommand, CommandError
from api.calendar_models import CalendarDay
from api.lectionary_rule_audit import audit_observations


class Command(BaseCommand):
    help = "Compare actual year readings and flag ambiguous Paschal/fixed slots; never write to DB"

    def add_arguments(self, parser):
        parser.add_argument("--years", nargs="+", type=int, default=[2025, 2026, 2027])
        parser.add_argument("--output", type=str, default=None)

    def handle(self, *args, **options):
        years = sorted(set(options["years"]))
        if any(year < 1900 or year > 2099 for year in years):
            raise CommandError("Supported reference years: 1900..2099")
        reference = {}
        for year in years:
            days = list(CalendarDay.objects.filter(date_gregorian__year=year)
                        .prefetch_related("readings").order_by("date_gregorian"))
            expected = 366 if __import__("calendar").isleap(year) else 365
            if len(days) != expected:
                raise CommandError(f"{year}: missing dates ({len(days)}/{expected}); audit stopped")
            reference[year] = {
                day.date_gregorian.isoformat(): list(
                    day.readings.values("kind", "label", "title", "order")
                ) for day in days
            }
        result = audit_observations(reference)
        output = Path(options["output"] or "lectionary_rule_audit.json").resolve()
        output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        self.stdout.write(f"Read-only report: {output}")
        for year, counts in result["years"].items():
            self.stdout.write(f"{year}: {counts}")
        self.stdout.write(
            f"Matching slots: {len(result['repeated_matching_rule_slots'])}; "
            f"conflicts: {len(result['conflicting_rule_slots'])}"
        )
        self.stdout.write(self.style.WARNING(
            "Diagnostic only. No generated readings approved or imported; databases unchanged."
        ))
