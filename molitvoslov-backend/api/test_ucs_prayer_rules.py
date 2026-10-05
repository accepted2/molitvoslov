from bs4 import BeautifulSoup
from django.test import SimpleTestCase

from api.management.commands.import_ucs_prayer_rules import (
    parse_section_blocks,
    parse_section_paragraphs,
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

    def test_parses_heading_blocks_and_paragraphs(self):
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

        blocks = parse_section_blocks(soup, "1")
        paragraphs = parse_section_paragraphs(soup, "1")

        self.assertEqual(len(blocks), 2)
        self.assertEqual(len(paragraphs), 3)
        self.assertTrue(blocks[0]["content"])
        self.assertTrue(blocks[1]["title"])
        self.assertIn("\n\n", blocks[1]["content"])

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
