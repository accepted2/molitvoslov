"""Structural tests for guarded imports of the Guardian Angel canon."""
from pathlib import Path
from types import SimpleNamespace

from django.core.management.base import CommandError
from django.test import SimpleTestCase

from api.management.commands.import_guardian_angel_canon_translations import (
    RU_PATH, TRAD_PATH, parse_and_validate, parse_source,
    merge_doxologies, compatible, alignment_errors, empty_heading_only,
)


class GuardianAngelCanonImportTests(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.ru = Path(RU_PATH).read_text(encoding="utf-8-sig")
        cls.trad = Path(TRAD_PATH).read_text(encoding="utf-8-sig")

    def test_81_sections_in_both_files_and_65_65_after_merging(self):
        originals, russian, traditional = parse_and_validate(
            self.ru, self.trad
        )
        self.assertEqual(len(originals), 81)
        self.assertEqual(len(parse_source(self.trad, traditional=True)), 81)
        self.assertEqual(len(russian), 65)
        self.assertEqual(len(traditional), 65)
        self.assertEqual(russian[-1].kind, "prayer")
        self.assertEqual(traditional[-1].kind, "prayer")

    def test_all_eight_glory_and_now_cues_have_their_own_troparia(self):
        _, russian, traditional = parse_and_validate(self.ru, self.trad)
        for ode in (1, 3, 4, 5, 6, 7, 8, 9):
            for corpus in (russian, traditional):
                self.assertEqual(sum(
                    1 for item in corpus
                    if item.ode == ode and item.kind == "glory"
                ), 1)
                self.assertEqual(sum(
                    1 for item in corpus
                    if item.ode == ode and item.kind == "now"
                ), 1)

    def test_complete_traditional_final_prayer_matches_user_source(self):
        originals = parse_source(self.trad, traditional=True)
        self.assertEqual(originals[-1].kind, "prayer")
        self.assertTrue(originals[-1].text.startswith("А҆́гг҃ле Хрⷭ҇то́въ"))
        self.assertTrue(originals[-1].text.endswith("А҆ми́нь."))
        self.assertIn("Кото́рыма ѻ҆чи́ма, а҆́гг҃ле", originals[-1].text)
        _, ru, trad = parse_and_validate(self.ru, self.trad)
        self.assertEqual((len(ru), len(trad)), (65, 65))
        self.assertEqual((ru[-1].kind, trad[-1].kind), ("prayer", "prayer"))

    def test_previous_incomplete_traditional_source_is_rejected(self):
        partial = self.trad[:self.trad.index(
            "Кото́рыма ѻ҆чи́ма, а҆́гг҃ле"
        )] + "Кото́рыма ѻ҆чи́ма, а"
        with self.assertRaises(CommandError):
            parse_and_validate(self.ru, partial)

    def test_incomplete_prayer_with_forged_amen_is_rejected(self):
        beginning = self.trad[:self.trad.index("Кото́рыма ѻ҆чи́ма, а҆́гг҃ле")]
        shortened = beginning + "Кото́рыма ѻ҆чи́ма, а҆́гг҃ле. А҆ми́нь."
        with self.assertRaises(CommandError):
            parse_and_validate(self.ru, shortened)

    def test_source_shift_is_rejected_without_database_write(self):
        broken = self.trad.replace(
            "[Припѣ́въ] Ст҃ы́й А҆́гг҃ле",
            "[Тропа́рь] Ст҃ы́й А҆́гг҃ле", 1,
        )
        with self.assertRaises(CommandError):
            parse_and_validate(self.ru, broken)

    def test_truncated_russian_prayer_rejected(self):
        broken = self.ru[:-8].rstrip()
        with self.assertRaises(CommandError):
            parse_and_validate(broken, self.trad)

    def test_two_special_invocations_are_aligned_without_losing_them(self):
        _, russian, _ = parse_and_validate(self.ru, self.trad)
        special = [e for e in russian if e.kind == "jesus"]
        self.assertEqual([e.ode for e in special], [1, 9])
        row = SimpleNamespace(
            section_type="refrain", ode_number=1,
            heading="Иисусу",
            text=SimpleNamespace(
                content="Гдⷭ҇и І҆и҃се Хрⷭ҇тѐ Бж҃е мо́й, поми́лꙋй мѧ̀."
            ),
        )
        self.assertTrue(compatible(row, special[0]))
        row.text.content = "Иной текст"
        row.heading = "Другой припев"
        self.assertFalse(compatible(row, special[0]))

    def test_strict_section_count_and_preserve_empty_heading(self):
        _, russian, _ = parse_and_validate(self.ru, self.trad)
        self.assertTrue(alignment_errors([], russian))
        row = SimpleNamespace(
            section_type="other",
            heading="Канон, глас 8-й",
            text=SimpleNamespace(content=""),
        )
        self.assertTrue(empty_heading_only(row))
        row.text.content = "Реальный текст"
        self.assertFalse(empty_heading_only(row))
