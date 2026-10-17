from datetime import date
from django.test import SimpleTestCase
from api.calendar_engine_v2 import Memorial
from api.calendar_engine_v4 import (
    CONFIRMED_CORRECTIONS,
    orthodox_pascha,
    julian_month_day,
    year_days,
    classify_v4,
    target_v4,
    main_priority_v4,
    choose_main_v4,
)


class CalendarEngineV4Tests(SimpleTestCase):
    def test_2028_leap_year_date_engine(self):
        self.assertEqual(orthodox_pascha(2028), date(2028, 4, 16))
        self.assertEqual(len(list(year_days(2028))), 366)
        # February 29 Julian exists in 2028 and needs its own source
        # commemoration; it is absent from the non-leap 2026 reference.
        self.assertEqual(julian_month_day(date(2028, 3, 13)), (2, 29))

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

    def test_pascha_always_overrides_reference_main_saint(self):
        pascha = Memorial(
            701, "Светлое Христово Воскресение", date(2026, 4, 12), False
        )
        saint = Memorial(702, "Преподобный старец", date(2026, 4, 12), True)
        chosen, conflicts = choose_main_v4([
            classify_v4(saint), classify_v4(pascha)
        ])
        self.assertEqual((chosen, conflicts), (701, []))

    def test_twelve_feast_overrides_reference_main_saint(self):
        feast = Memorial(
            703, "Преображение Господне", date(2026, 8, 19), False
        )
        saint = Memorial(
            704, "Святитель значимый", date(2026, 8, 19), True
        )
        chosen, conflicts = choose_main_v4([
            classify_v4(saint), classify_v4(feast)
        ])
        self.assertEqual((chosen, conflicts), (703, []))

    def test_pokrov_great_feast_overrides_ordinary_main(self):
        pokrov = Memorial(
            705, "Покров Пресвятой Богородицы", date(2026, 10, 14), False
        )
        saint = Memorial(
            706, "Преподобный старец", date(2026, 10, 14), True
        )
        chosen, conflicts = choose_main_v4([
            classify_v4(saint), classify_v4(pokrov)
        ])
        self.assertEqual((chosen, conflicts), (705, []))

    def test_inherited_main_preserved_for_ordinary_saints(self):
        reference = Memorial(
            707, "Преподобный", date(2026, 10, 15), True
        )
        ordinary = Memorial(
            708, "Другой святой", date(2026, 10, 15), False
        )
        chosen, conflicts = choose_main_v4([
            classify_v4(reference), classify_v4(ordinary)
        ])
        self.assertEqual((chosen, conflicts), (707, []))

    def test_no_unjustified_tie_between_two_great_feasts(self):
        feast1 = Memorial(
            709, "Благовещение Пресвятой Богородицы",
            date(2026, 4, 7), True,
        )
        feast2 = Memorial(
            710, "Вход Господень в Иерусалим",
            date(2026, 4, 5), False,
        )
        chosen, conflicts = choose_main_v4([
            classify_v4(feast1), classify_v4(feast2)
        ])
        self.assertIsNone(chosen)
        self.assertEqual(conflicts, [709, 710])

    def test_no_unverified_tie_break_by_id(self):
        one = Memorial(51, "Первый святой", date(2026, 10, 2), True)
        two = Memorial(5, "Второй святой", date(2026, 10, 2), True)
        chosen, tie = choose_main_v4([classify_v4(one), classify_v4(two)])
        self.assertIsNone(chosen)
        self.assertEqual(tie, [5, 51])
