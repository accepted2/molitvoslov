"""Pure-function tests: no Django DB writes."""
from django.test import SimpleTestCase

from api.lectionary_preview_engine import (
    build_preview, dates_of, orthodox_pascha,
)


class LectionaryPreviewEngineTests(SimpleTestCase):
    def test_pascha(self):
        self.assertEqual(str(orthodox_pascha(2026)), "2026-04-12")
        self.assertEqual(str(orthodox_pascha(2027)), "2027-05-02")
        self.assertEqual(str(orthodox_pascha(2028)), "2028-04-16")

    def test_calendar_leap_year(self):
        self.assertEqual(len(list(dates_of(2027))), 365)
        self.assertEqual(len(list(dates_of(2028))), 366)

    def test_preview_never_approved_for_import(self):
        result = build_preview(2027, [
            {"date": "2026-04-12", "kind": "gospel",
             "label": "", "title": "Ин.1:1–17 (зач. 1)", "order": 10},
        ])
        self.assertEqual(len(result["days"]), 365)
        self.assertFalse(result["approved_for_database_import"])
        self.assertEqual(
            [r["confidence"] for r in result["days"]["2027-05-02"]["readings"]],
            ["verified_rule", "verified_rule", "verified_rule"],
        )

    def test_reference_is_observation_not_annual_rule(self):
        source = [{"date": "2026-04-12", "kind": "gospel",
                   "label": "", "title": "Ин.1:1–17", "order": 10}]
        result = build_preview(2026, source)
        self.assertEqual(
            result["days"]["2026-04-12"]["readings"][0]["confidence"],
            "observed_reference",
        )
