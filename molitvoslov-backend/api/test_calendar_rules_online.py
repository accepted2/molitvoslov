"""Pure, network-free regression tests for the online calendar rule audit."""
from datetime import date

from django.test import SimpleTestCase

from api.management.commands.audit_calendar_rules_online import inferred_rule


class CalendarOnlineRuleAuditTests(SimpleTestCase):
    def test_confirms_fixed_julian_christmas(self):
        result = inferred_rule([
            date(2026, 1, 7), date(2027, 1, 7), date(2028, 1, 7),
        ])
        self.assertEqual(result, {"type": "julian_fixed", "month": 12, "day": 25})

    def test_confirms_movable_all_saints_offset(self):
        result = inferred_rule([
            date(2026, 6, 7), date(2027, 6, 27), date(2028, 6, 11),
        ])
        self.assertEqual(result, {"type": "easter_offset", "days": 56})

    def test_confirms_pascha_offset_zero(self):
        result = inferred_rule([
            date(2026, 4, 12), date(2027, 5, 2), date(2028, 4, 16),
        ])
        self.assertEqual(result, {"type": "easter_offset", "days": 0})

    def test_does_not_guess_weekday_rule(self):
        self.assertIsNone(inferred_rule([
            date(2026, 6, 7), date(2027, 6, 6), date(2028, 6, 4),
        ]))

    def test_must_provide_one_date_per_expected_year(self):
        self.assertIsNone(inferred_rule([
            date(2026, 6, 7), date(2027, 6, 27), date(2027, 6, 29),
        ]))

    def test_does_not_derive_julian_leap_only_feast_from_2026(self):
        self.assertIsNone(inferred_rule([
            date(2026, 3, 13), date(2027, 3, 13), date(2028, 3, 13),
        ]))
