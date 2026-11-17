"""Regression tests for the CS-graphic Penitential Canon importer."""
from pathlib import Path

from django.conf import settings
from django.test import SimpleTestCase

from api.management.commands.import_penitential_canon_cs_trad import (
    complete_final_prayer,
    imported_entries,
)

SOURCE = (
    Path(settings.BASE_DIR)
    / "api"
    / "data"
    / "canon_pokayan_ko_gospodu_cs_trad_20261117.txt"
)


class PenitentialCanonTraditionalTests(SimpleTestCase):
    def setUp(self):
        self.source = SOURCE.read_text(encoding="utf-8-sig")

    def test_source_has_76_entries_and_60_combined_sections(self):
        original, combined, ready, complete = imported_entries(self.source)
        self.assertEqual(len(original), 76)
        self.assertEqual(len(combined), 60)
        self.assertEqual(len(ready), 60)
        self.assertTrue(complete)

    def test_glory_and_now_cues_are_kept_with_troparia(self):
        _, sections, _, _ = imported_entries(self.source)
        for kind in ("glory", "now"):
            items = [
                e for e in sections
                if e.kind == kind and e.ode in (1, 3, 4, 5, 6, 7, 8, 9)
            ]
            self.assertEqual(len(items), 8)
            self.assertTrue(all(len(e.text) > 50 for e in items))
        self.assertIn("Сла́ва", sections[5].text)
        self.assertIn("Безꙋ́мный", sections[5].text)

    def test_completed_final_prayer_is_importable(self):
        _, sections, ready, complete = imported_entries(self.source)
        self.assertTrue(complete)
        self.assertEqual(len(ready), 60)
        self.assertEqual(ready[-1].kind, "prayer")
        self.assertTrue(complete_final_prayer(sections[-1].text))
        self.assertTrue(sections[-1].text.startswith("Влⷣко Хрⷭ҇тѐ"))
        self.assertTrue(sections[-1].text.endswith("А҆ми́нь."))

    def test_truncation_still_blocks_incomplete_final_prayer(self):
        prefix, sep, last = self.source.rpartition("[Молитва] ")
        self.assertTrue(sep)
        corrupted = prefix + sep + last[:110].rstrip() + "сокр"
        originals, combined, ready, complete = imported_entries(corrupted)
        self.assertFalse(complete)
        self.assertEqual((len(originals), len(combined), len(ready)), (76, 60, 59))
