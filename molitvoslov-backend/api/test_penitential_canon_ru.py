"""Pure-source regression checks for the supplied Russian Penitential Canon."""
from pathlib import Path
from types import SimpleNamespace

from django.conf import settings
from django.core.management.base import CommandError
from django.test import SimpleTestCase

from api.management.commands.import_penitential_canon_ru import (
    check_alignment,
    parse_source,
)


SOURCE = (
    Path(settings.BASE_DIR)
    / "api"
    / "data"
    / "canon_pokayan_ko_gospodu_ru_20261117.txt"
)


class PenitentialCanonRussianTests(SimpleTestCase):
    def setUp(self):
        self.source = SOURCE.read_text(encoding="utf-8")
        self.entries = parse_source(self.source)

    def test_full_source_has_76_entries_and_eight_odes(self):
        self.assertEqual(len(self.entries), 76)
        odes = list(dict.fromkeys(
            e.ode for e in self.entries if e.ode is not None
        ))
        self.assertEqual(odes, [1, 3, 4, 5, 6, 7, 8, 9])
        self.assertTrue(self.entries[0].text.startswith("Как по суше"))
        self.assertTrue(self.entries[-1].text.endswith("Аминь."))

    def test_alignment_preserves_order_and_ode(self):
        rows = [
            SimpleNamespace(
                section_type="glory" if e.kind == "glory_now" else e.kind,
                ode_number=e.ode,
                order=i,
                heading="",
                text=SimpleNamespace(content="ЦС текст"),
            )
            for i, e in enumerate(self.entries, 1)
        ]
        self.assertEqual(check_alignment(rows, self.entries), [])
        rows[4].section_type = "irmos"
        self.assertTrue(check_alignment(rows, self.entries))

    def test_missing_section_fails_and_cannot_silently_shift(self):
        rows = [
            SimpleNamespace(
                section_type=e.kind,
                ode_number=e.ode,
                order=i,
                heading="",
                text=SimpleNamespace(content="ЦС текст"),
            )
            for i, e in enumerate(self.entries[:-1], 1)
        ]
        self.assertTrue(check_alignment(rows, self.entries))

    def test_duplicate_ode_header_is_rejected(self):
        corrupted = self.source.replace("## Песнь 3", "## Песнь 1", 1)
        with self.assertRaises(CommandError):
            parse_source(corrupted)
