"""The source-only cleaner must not alter hagiographic meaning or liturgical glyphs."""
from __future__ import annotations

import unittest

from api.calendar_text_cleanup import clean_source_field


class CalendarSourceCleanupTests(unittest.TestCase):
    def test_uk_navigation_dates_and_related_saints_footer(self):
        raw = (
            "29 листопада 16 листопада за ст. ст.\n\n"
            "13 липня — Собор дванадцяти апостолів 30 червня за ст. ст.\n\n"
            "Тропар · Служба в Мінеї\n\n"
            "Святий апостол Матфей був апостолом із дванадцяти.\n\n"
            "Тут закінчується його житіє.\n\n"
            "Інші святі 29 листопада\n\n"
            "Апостол Іоанн\n\nМученик Петро"
        )
        self.assertEqual(
            clean_source_field("life_content_uk", raw),
            "Святий апостол Матфей був апостолом із дванадцяти.\n\n"
            "Тут закінчується його житіє.",
        )

    def test_russian_website_navigation_and_synaxarion_date(self):
        raw = ("Месяца июля в 4-й день.\n\n"
               "Акафист · Тропарь · Служба в Минее\n\n"
               "Святитель Андрей происходил из Дамаска. Его жизнь была посвящена Богу.")
        self.assertEqual(
            clean_source_field("life_content", raw),
            "Святитель Андрей происходил из Дамаска. Его жизнь была посвящена Богу.",
        )

    def test_zero_width_and_soft_hyphen(self):
        value = "Святой\u200b\u200b жил с ве\u00adрою."
        self.assertEqual(clean_source_field("life_content", value), "Святой жил с верою.")

    def test_church_slavonic_legacy_glyphs_are_not_trademarks(self):
        text = "Тропaрь с™ы6хъ, глaсъ в7: п®тeча и с™ыи."
        self.assertEqual(clean_source_field("troparion_content", text), text)

    def test_legitimate_date_and_scripture_reference_remain(self):
        text = ("Святой почил 19 декабря 342 года.\n\n"
                "В Евангелии сказано (Лк. 6:27–28): любите врагов ваших.")
        self.assertEqual(clean_source_field("life_content", text), text)

    def test_non_navigation_others_inside_story_remain(self):
        text = ("Святой беседовал с братьями.\n\n"
                "Інші святі також почитали його за чесноти і молитви.")
        self.assertEqual(clean_source_field("life_content_uk", text), text)

    def test_idempotence(self):
        value = ("25 листопада 12 листопада за ст. ст.\n\n"
                 "Тропар · Служба в Мінеї\n\n"
                 "Святитель служив у церкві багато років.\n\n"
                 "Інші святі 25 листопада")
        once = clean_source_field("life_content_uk", value)
        self.assertEqual(once, clean_source_field("life_content_uk", once))

    def test_empty_and_non_text_unchanged(self):
        self.assertEqual(clean_source_field("life_content", ""), "")
        self.assertIsNone(clean_source_field("life_content", None))


if __name__ == "__main__":
    unittest.main()
