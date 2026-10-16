"""Pure date-engine tests; runnable without a database.
python -m unittest api.test_calendar_engine_v2 -v
"""

import unittest
from datetime import date, timedelta
from api.calendar_engine_v2 import (
    orthodox_pascha,
    julian_month_day,
    calculate_fasting,
    Memorial,
    classify,
    rule_target,
    build_schedule,
    pick_main,
    resolve_readings,
)


class CalendarEngineV2Tests(unittest.TestCase):
    def test_pascha_dates(self):
        self.assertEqual(orthodox_pascha(2026), date(2026, 4, 12))
        self.assertEqual(orthodox_pascha(2027), date(2027, 5, 2))
        self.assertEqual(orthodox_pascha(2028), date(2028, 4, 16))
        self.assertEqual(orthodox_pascha(2029), date(2029, 4, 8))

    def test_pascha_exception_julian_shift(self):
        self.assertEqual(julian_month_day(date(2027, 1, 7)), (12, 25))
        self.assertEqual(julian_month_day(date(2028, 3, 13)), (2, 29))

    def test_fixed_feast(self):
        src = Memorial(12, "Рождество Христово", date(2026, 1, 7), True)
        rule = classify(src)
        self.assertEqual(rule.kind, "fixed")
        self.assertEqual(rule_target(rule, 2027), date(2027, 1, 7))

    def test_pascha_movables(self):
        src = Memorial(15, "Светлое Христово Воскресение", date(2026, 4, 12), True)
        self.assertEqual(rule_target(classify(src), 2027), date(2027, 5, 2))
        self.assertEqual(
            rule_target(classify(Memorial(16, "Вознесение Господне", date(2026, 5, 21))), 2027),
            date(2027, 6, 10),
        )
        self.assertEqual(
            rule_target(
                classify(Memorial(17, "День Святой Троицы. Пятидесятница", date(2026, 5, 31))), 2027
            ),
            date(2027, 6, 20),
        )

    def test_weekday_specials(self):
        variants = [
            (5723, "Димитриевская родительская суббота", date(2026, 11, 7), date(2027, 11, 6)),
            (
                3704,
                "Собор новомучеников и исповедников Церкви Русской",
                date(2026, 2, 8),
                date(2027, 2, 7),
            ),
            (
                4991,
                "прпп. Тихона, Василия и Никона Соколовских (переходящее празднование в 1-е воскресенье после 12 июля)",
                date(2026, 7, 19),
                date(2027, 7, 18),
            ),
        ]
        for fid, name, origin, target in variants:
            self.assertEqual(rule_target(classify(Memorial(fid, name, origin)), 2027), target)

    def test_do_not_move_saint_with_troitsky_surname(self):
        m = Memorial(18, "Исповедник Георгий Троицкий, пресвитер", date(2026, 10, 29))
        self.assertEqual(classify(m).kind, "fixed")
        self.assertEqual(rule_target(classify(m), 2027), date(2027, 10, 29))

    def test_fasts(self):
        self.assertEqual(calculate_fasting(date(2027, 3, 15)).period, "Великий пост")
        self.assertEqual(calculate_fasting(date(2027, 6, 28)).period, "Петров пост")
        self.assertEqual(calculate_fasting(date(2027, 7, 12)).period, "")
        self.assertEqual(calculate_fasting(date(2027, 8, 17)).period, "Успенский пост")
        self.assertEqual(calculate_fasting(date(2027, 12, 2)).period, "Рождественский пост")
        self.assertEqual(calculate_fasting(date(2027, 5, 3)).status, "fast_free")
        self.assertEqual(calculate_fasting(date(2027, 3, 10)).status, "cheese")

    def test_readings_fail_closed(self):
        self.assertFalse(resolve_readings(date(2027, 1, 3)).complete)
        given = {
            "2027-01-03": {"verified": True, "readings": [{"kind": "gospel", "title": "Лк. 1:1-2"}]}
        }
        self.assertTrue(resolve_readings(date(2027, 1, 3), given).complete)

    def test_build_schedule_doesnt_duplicate_text(self):
        src = [
            Memorial(1, "Святитель Николай Чудотворец", date(2026, 12, 19), True),
            Memorial(2, "Светлое Христово Воскресение", date(2026, 4, 12), True),
        ]
        schedule, special = build_schedule(src, 2027)
        self.assertIn(1, [r.feast_id for r in schedule[date(2027, 12, 19)]])
        self.assertEqual(pick_main(schedule[date(2027, 5, 2)]), 2)

    def test_leap_julian_feb29_requires_source(self):
        # A 2026 (non-leap Julian year) template has no Feb 29 entry.
        self.assertEqual(julian_month_day(date(2028, 3, 13)), (2, 29))


if __name__ == "__main__":
    unittest.main()
