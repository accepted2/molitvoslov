from datetime import date
from django.test import SimpleTestCase
from api.calendar_engine_v2 import Memorial
from api.calendar_engine_v4 import (
    CONFIRMED_CORRECTIONS,
    classify_v4,
    target_v4,
    main_priority_v4,
    choose_main_v4,
)


class CalendarEngineV4Tests(SimpleTestCase):
    def test_confirmed_rules_reproduce_reference_year(self):
        for c in CONFIRMED_CORRECTIONS:
            with self.subTest(c.feast_id):
                m = Memorial(c.feast_id, c.title, date.fromisoformat(c.source_date))
                self.assertEqual(target_v4(classify_v4(m), 2026), m.source_date)

    def test_known_movables_2027(self):
        expected = {
            4627: date(2027, 6, 27),
            4631: date(2027, 6, 6),
            4634: date(2027, 6, 27),
            4635: date(2027, 6, 27),
            4688: date(2027, 7, 4),
            4818: date(2027, 7, 18),
            4992: date(2027, 7, 18),
            4993: date(2027, 7, 18),
        }
        for c in CONFIRMED_CORRECTIONS:
            with self.subTest(c.feast_id):
                m = Memorial(c.feast_id, c.title, date.fromisoformat(c.source_date))
                self.assertEqual(target_v4(classify_v4(m), 2027), expected[c.feast_id])

    def test_wrong_feast_identity_is_blocked(self):
        with self.assertRaises(ValueError):
            classify_v4(Memorial(4627, "Другое празднование", date(2026, 6, 7)))

    def test_main_new_martyrs_over_gregory(self):
        one = Memorial(3693, "Святитель Григорий Богослов", date(2026, 2, 7), True)
        two = Memorial(
            3704, "Собор новомучеников и исповедников Церкви Русской", date(2026, 2, 8), True
        )
        chosen, tie = choose_main_v4([classify_v4(one), classify_v4(two)])
        self.assertEqual((chosen, tie), (3704, []))

    def test_dimitrievskaya_saturday_over_icon(self):
        one = Memorial(
            5711, "Иконы Божией Матери «Всех скорбящих Радость» (1688)", date(2026, 11, 6), True
        )
        two = Memorial(5723, "Димитриевская родительская суббота", date(2026, 11, 7), True)
        chosen, tie = choose_main_v4([classify_v4(one), classify_v4(two)])
        self.assertEqual((chosen, tie), (5723, []))

    def test_no_unverified_tie_break_by_id(self):
        one = Memorial(51, "Первый святой", date(2026, 10, 2), True)
        two = Memorial(5, "Второй святой", date(2026, 10, 2), True)
        chosen, tie = choose_main_v4([classify_v4(one), classify_v4(two)])
        self.assertIsNone(chosen)
        self.assertEqual(tie, [5, 51])
