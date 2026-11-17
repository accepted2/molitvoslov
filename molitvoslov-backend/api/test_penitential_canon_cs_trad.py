"""Regression tests for guarded import of the attached CS-graphic canon."""
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
        self.assertEqual(len(ready), 59)
        self.assertFalse(complete)

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

    def test_truncated_final_prayer_is_not_marked_complete(self):
        _, sections, ready, complete = imported_entries(self.source)
        self.assertFalse(complete_final_prayer(sections[-1].text))
        self.assertTrue(sections[-1].text.endswith("сокр"))
        self.assertEqual(ready[-1].kind, "now")

    def test_completed_long_prayer_can_be_imported_in_full(self):
        full = self.source.rstrip() + (
            "ꙋшє́нїѧ, и҆ о҆чи́сти ме́нѧ ѿ грѣхо́въ моихъ. " * 24
        ) + "А҆ми́нь."
        originals, combined, ready, complete = imported_entries(full)
        self.assertTrue(complete)
        self.assertEqual((len(originals), len(combined), len(ready)), (76, 60, 60))
