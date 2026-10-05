from bs4 import BeautifulSoup
from django.test import SimpleTestCase

from api.management.commands.import_ucs_prayer_rules import (
    find_common_preinitial_raw,
    normalize_for_similarity,
    parse_section_paragraphs,
    similarity,
    ucs_to_unicode,
)


class UcsPrayerRuleParserTests(SimpleTestCase):
    def test_converts_legacy_ucs_to_unicode(self):
        converted = ucs_to_unicode("ГDи, поми1луй.")

        self.assertNotIn("D", converted)
        self.assertNotIn("1", converted)
        self.assertIn("Г", converted)
        self.assertIn("поми", converted)
        self.assertIn("й.", converted)
        self.assertIn("ꙋ", converted)

    def test_parses_paragraphs_and_keeps_heading(self):
        soup = BeautifulSoup(
            """
            <html><body>
              <h2><a name="1"></a>Мlтвы ќтрєнніz.</h2>
              <p>Во и4мz nц7A. Ґми1нь.</p>
              <h3>Мlтва мытарS:</h3>
              <p>Б9е, млcтивъ бyди мнЁ грёшному.</p>
              <p>ГDи, поми1луй.</p>
              <h2><a name="2"></a>Следующий раздел</h2>
            </body></html>
            """,
            "html.parser",
        )

        paragraphs = parse_section_paragraphs(soup, "1")

        self.assertEqual(len(paragraphs), 3)
        self.assertEqual(paragraphs[0]["raw_title"], "")
        self.assertTrue(paragraphs[1]["title"])
        self.assertEqual(
            paragraphs[1]["raw_title"],
            "Мlтва мытарS:",
        )

    def test_stops_at_next_h2(self):
        soup = BeautifulSoup(
            """
            <h2><a name="3"></a>Вечерние</h2>
            <p>ГDи, поми1луй.</p>
            <h2><a name="4"></a>Другое</h2>
            <p>Не должно попасть.</p>
            """,
            "html.parser",
        )

        rows = parse_section_paragraphs(soup, "3")

        self.assertEqual(len(rows), 1)

    def test_finds_common_preinitial_from_anchor_four(self):
        soup = BeautifulSoup(
            """
            <h2><a name="4"></a>Три канона</h2>
            <p>
              Мlтвами с™hхъ nтє1цъ нaшихъ, гDи ї}се хrтE б9е нaшъ,
              поми1луй нaсъ. Ґми1нь. Слaва тебЁ б9е нaшъ, слaва тебЁ.
            </p>
            """,
            "html.parser",
        )

        raw = find_common_preinitial_raw(soup)

        self.assertTrue(raw.startswith("Мlтвами с™hхъ nтє1цъ"))
        self.assertNotIn("Слaва тебЁ", raw)
        self.assertIn("Ґми1нь.", raw)

    def test_similarity_normalizes_historic_letters_and_accents(self):
        modern = "Поми́луй нас."
        historic = "Поми́лꙋй насъ."

        self.assertEqual(
            normalize_for_similarity(modern),
            normalize_for_similarity(historic),
        )
        self.assertGreater(similarity(modern, historic), 0.99)
