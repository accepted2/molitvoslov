"""Structural, non-database tests for the Theotokos Russian/CS import."""
from django.test import SimpleTestCase
from django.core.management.base import CommandError
from types import SimpleNamespace

from api.management.commands.import_theotokos_paraklesis_translations import (
    RU_SOURCE,
    CS_SOURCE,
    alignment_errors,
    section_compatible,
    target_field_values,
    combine_doxologies,
    parse_and_validate,
    parse_source,
)


class TheotokosParaklesisImportTests(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.ru = RU_SOURCE.read_text(encoding="utf-8-sig")
        cls.cs = CS_SOURCE.read_text(encoding="utf-8-sig")

    def test_source_count_and_joined_doxologies(self):
        originals, russian, church = parse_and_validate(self.ru, self.cs)
        self.assertEqual((len(originals), len(russian), len(church)), (93, 77, 77))
        self.assertEqual(russian[0].kind, "prayer")
        self.assertEqual(russian[-1].kind, "prayer")
        self.assertEqual(church[-1].kind, "prayer")

    def test_csl_source_is_complete_and_follows_russian_structure(self):
        parsed = parse_source(self.cs, traditional=True)
        self.assertEqual(len(parsed), 93)
        self.assertEqual(parsed[-1].kind, "prayer")
        self.assertTrue(parsed[-1].text.startswith("КЪ комꙋ̀ возопїю̀"))
        self.assertTrue(parsed[-1].text.endswith("Гдⷭ҇ь съ Тобо́ю."))
        _, russian, church = parse_and_validate(self.ru, self.cs)
        self.assertEqual(len(church), 77)
        self.assertEqual(
            [(x.group, x.kind, x.ode) for x in russian],
            [(x.group, x.kind, x.ode) for x in church],
        )

    def test_earlier_partial_source_is_rejected(self):
        partial = self.cs[:self.cs.index(
            "[Припѣ́въ] Прест҃а́ѧ Бцⷣе, сп҃си́ на́съ.",
            self.cs.index("### Пѣ́снь и҃"),
        )] + "[Припѣ́въ] Прест҃а́ѧ Бцⷣе, сп҃си́"
        with self.assertRaises(CommandError):
            parse_and_validate(self.ru, partial)

    def test_truncated_final_prayer_is_rejected(self):
        prefix, sep, prayer = self.cs.rpartition(
            "[Мл҃тва] КЪ комꙋ̀ возопїю̀"
        )
        self.assertTrue(sep)
        corrupted = prefix + sep + prayer[:130]
        with self.assertRaises(CommandError):
            parse_and_validate(self.ru, corrupted)

    def test_glory_and_now_stay_with_their_troparia(self):
        ru = combine_doxologies(parse_source(self.ru))
        for ode in (1, 3, 4, 5, 6, 7, 8, 9):
            self.assertEqual(
                sum(e.ode == ode and e.kind == "glory" for e in ru), 1
            )
            self.assertEqual(
                sum(e.ode == ode and e.kind == "now" for e in ru), 1
            )

    def test_alignment_requires_exact_row_count(self):
        _, ru, _ = parse_and_validate(self.ru, self.cs)
        self.assertTrue(alignment_errors([], ru))

    def test_incorrect_source_prefix_is_rejected(self):
        wrong = self.cs.replace("[Мл҃тва]", "[Тропа́рь]", 1)
        with self.assertRaises(CommandError):
            parse_and_validate(self.ru, wrong)

    def test_opening_prayer_matches_theotokos_troparion_only(self):
        _, entries, _ = parse_and_validate(self.ru, self.cs)
        entry = entries[0]
        row = SimpleNamespace(
            order=1,
            section_type="troparion",
            ode_number=None,
            heading="Тропaрь Богородице, глас 4-й",
            text=SimpleNamespace(
                content="К Богоро́дице приле́жно ны́не притеце́м, гре́шнии."
            ),
        )
        self.assertTrue(section_compatible(row, entry))
        row.heading = "Тропарь иного праздника, глас 4-й"
        self.assertFalse(section_compatible(row, entry))
        row.heading = "Тропaрь Богородице, глас 4-й"
        row.text.content = "Другое песнопение без нужного начала"
        self.assertFalse(section_compatible(row, entry))

    def test_tone_two_troparion_follows_ode_three_without_ode_number(self):
        _, entries, _ = parse_and_validate(self.ru, self.cs)
        entry = next(
            e for e in entries
            if e.group == 4 and e.kind == "troparion"
            and e.text.startswith("Горячее ходатайство")
        )
        row = SimpleNamespace(
            order=22,
            section_type="troparion",
            ode_number=None,
            heading="Тропа́рь, гла́с 2-й",
            text=SimpleNamespace(
                content="Моле́ние те́плое, и стена́ необори́мая."
            ),
        )
        self.assertTrue(section_compatible(row, entry))
        row.heading = "Тропарь, глас 4-й"
        self.assertFalse(section_compatible(row, entry))
        row.heading = "Тропа́рь, гла́с 2-й"
        row.text.content = "Другая молитва."
        self.assertFalse(section_compatible(row, entry))
        row.text.content = "Моле́ние те́плое, и стена́ необори́мая."
        row.ode_number = 4
        self.assertFalse(section_compatible(row, entry))

    def test_traditional_only_updates_no_other_field(self):
        values = target_field_values(
            "Существующий русский перевод",
            "ЦС традиционный текст",
            traditional_only=True,
        )
        self.assertEqual(values, {"traditional_content": "ЦС традиционный текст"})
        self.assertNotIn("translation", values)

    def test_traditional_only_skips_missing_source(self):
        values = target_field_values(
            "Русский текст, который нельзя изменять",
            None,
            traditional_only=True,
        )
        self.assertEqual(values, {})

    def test_standard_import_retains_existing_behavior(self):
        values = target_field_values(
            "Русский текст", "ЦС текст", traditional_only=False
        )
        self.assertEqual(
            values,
            {"translation": "Русский текст", "traditional_content": "ЦС текст"},
        )
