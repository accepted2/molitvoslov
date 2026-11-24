"""Pure-source regression checks for the supplied Russian Penitential Canon."""
from pathlib import Path
from types import SimpleNamespace

from django.conf import settings
from django.core.management.base import CommandError
from django.test import SimpleTestCase

from api.management.commands.import_penitential_canon_ru import (
    check_alignment,
    combine_glory_and_now,
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
        self.source_entries = parse_source(self.source)
        self.entries = combine_glory_and_now(self.source_entries)

    def test_full_source_has_76_entries_and_eight_odes(self):
        self.assertEqual(len(self.source_entries), 76)
        self.assertEqual(len(self.entries), 60)
        odes = list(dict.fromkeys(
            e.ode for e in self.entries if e.ode is not None
        ))
        self.assertEqual(odes, [1, 3, 4, 5, 6, 7, 8, 9])
        self.assertTrue(self.entries[0].text.startswith("Как по суше"))
        self.assertTrue(self.entries[-1].text.endswith("Аминь."))

    def test_exactly_eight_glory_and_eight_now_pairs_are_merged(self):
        self.assertEqual(
            sum(1 for e in self.entries if e.kind == "glory" and e.ode is not None),
            8,
        )
        self.assertEqual(
            sum(1 for e in self.entries if e.kind == "now" and e.ode is not None),
            8,
        )
        glory_ode_one = next(
            e for e in self.entries if e.group == "Песнь 1" and e.kind == "glory"
        )
        self.assertTrue(glory_ode_one.text.startswith("Слава Отцу"))
        self.assertIn("Безумный, окаянный человек", glory_ode_one.text)
        now_ode_one = next(
            e for e in self.entries if e.group == "Песнь 1" and e.kind == "now"
        )
        self.assertTrue(now_ode_one.text.startswith("И ныне"))
        self.assertIn("Матерь Божия Пречистая", now_ode_one.text)
        sedalen_glory = [
            e for e in self.entries if e.group == "Седален, глас 6-й"
        ]
        self.assertEqual(len(sedalen_glory), 3)

    def test_merged_format_rejects_missing_troparion_after_glory(self):
        to_remove = next(
            i for i, e in enumerate(self.source_entries)
            if e.group == "Песнь 1" and e.kind == "glory"
        ) + 1
        bad = list(self.source_entries)
        bad.pop(to_remove)
        with self.assertRaises(CommandError):
            combine_glory_and_now(bad)

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
