"""Regression tests for independently confirmed movable-date rules."""

from datetime import date
from django.test import SimpleTestCase

from api.calendar_engine_v3 import Memorial, build_schedule_v3, classify_v3, orthodox_pascha
from api.management.commands.generate_calendar_years_v3 import selected_years, _validated_overrides


class CalendarEngineV3Tests(SimpleTestCase):
    def test_zhivonosny_icon_moves_to_bright_friday(self):
        rule = classify_v3(
            Memorial(4203, "Икона Богородицы Живоносный Источник", date(2026, 4, 17))
        )
        self.assertEqual((rule.kind, rule.anchor), ("pascha", 5))
        schedule, special = build_schedule_v3(
            [Memorial(4203, "Икона Богородицы Живоносный Источник", date(2026, 4, 17))], 2027
        )
        self.assertFalse(special)
        self.assertEqual([x.feast_id for x in schedule[date(2027, 5, 7)]], [4203])
        self.assertFalse(schedule[date(2027, 4, 17)])

    def test_third_sunday_after_pentecost_synaxises(self):
        titles = (
            "Собор Вологодских святых",
            "Собор Белорусских святых",
            "Собор Псковских святых",
            "Собор Новгородских святых",
        )
        for i, title in enumerate(titles):
            with self.subTest(title=title):
                rule = classify_v3(Memorial(100 + i, title, date(2026, 6, 21)))
                self.assertEqual((rule.kind, rule.anchor), ("pascha", 70))

    def test_nonmatching_same_title_does_not_shift(self):
        rule = classify_v3(Memorial(100, "Собор Вологодских святых", date(2026, 10, 1)))
        self.assertNotEqual(rule.kind, "pascha")

    def test_no_accidental_title_overlap(self):
        rule = classify_v3(
            Memorial(100, "Собор Новгородских святых и иной праздник", date(2026, 6, 21))
        )
        self.assertNotEqual(rule.kind, "pascha")

    def test_paschalia_for_range(self):
        self.assertEqual(orthodox_pascha(2027), date(2027, 5, 2))
        self.assertEqual(orthodox_pascha(2028), date(2028, 4, 16))


class CalendarYearsV3Tests(SimpleTestCase):
    def test_single_full_year(self):
        self.assertEqual(selected_years(year=2027), [2027])

    def test_range(self):
        self.assertEqual(selected_years(start=2027, end=2029), [2027, 2028, 2029])

    def test_2026_protected(self):
        with self.assertRaises(ValueError):
            selected_years(year=2026)

    def test_wrong_order(self):
        with self.assertRaises(ValueError):
            selected_years(start=2029, end=2027)

    def test_missing_end_year(self):
        with self.assertRaises(ValueError):
            selected_years(start=2027)

    def test_mixed_options(self):
        with self.assertRaises(ValueError):
            selected_years(year=2027, start=2027, end=2029)

    def test_override_default(self):
        self.assertEqual(_validated_overrides(""), {})
