"""Regression tests for split alternate hymns, preserving Church Slavonic."""
import unittest

from api.calendar_hymn_variants import (
    decode_ucs8, prepare_imported_hymn_fields, split_alternative,
)


class CalendarAlternativeHymnTests(unittest.TestCase):
    def setUp(self):
        self.source = {
            "troparion_title": "Тропaрь, глaсъ №.\n\nПод0бенъ: Пустhнный жи1тель:",
            "troparion_content": (
                "Сили1вріи џтрасль и3 є3гjны храни1телz.\n\n"
                "И$нъ тропaрь, глaсъ д7.\n\n"
                "Под0бенъ: Ск0рw предвари2:\n\n"
                "Прпdбнэ пожи1лъ є3си2 ћкw с™и1тель мyдрый."
            ),
            "kontakion_title": "Кондaкъ, глaсъ }.",
            "kontakion_content": (
                "Правослaвіz ѕвэздY новосвётлую.\n\n"
                "И$нъ кондaкъ, глaсъ в7:\n\n"
                "Бжcтвенный гр0мъ, трубA дух0внаz."
            ),
            "life_content": "Родился Анастасиос Кефалас.",
        }

    def test_retain_all_hymns_and_life(self):
        result = prepare_imported_hymn_fields(self.source)
        self.assertIn("Сили́врі", result["troparion_content"])
        self.assertIn("Прпⷣбнѣ", result["troparion_alt_content"])
        self.assertIn("Подо́бенъ", result["troparion_alt_content"])
        self.assertIn("Правосла́ві", result["kontakion_content"])
        self.assertIn("Бжⷭ҇твенный", result["kontakion_alt_content"])
        self.assertIn("И҆́нъ", result["troparion_alt_title"])
        self.assertEqual(result["life_content"], self.source["life_content"])
        self.assertNotIn("И$нъ", result["troparion_content"])
        self.assertNotIn("И$нъ", result["kontakion_content"])
        self.assertEqual(self.source["troparion_content"].count("И$нъ"), 1)

    def test_original_civil_hymn_untouched(self):
        source = {"troparion_content": "Преподо́бнически пожи́в, я́ко му́дрый иера́рх"}
        self.assertEqual(prepare_imported_hymn_fields(source), source)

    def test_source_alternative_is_not_overwritten(self):
        source = {
            "kontakion_content": "Один кондак.\n\nИной кондак, глас 2\n\nДругой кондак.",
            "kontakion_alt_content": "Авторская редакция второго кондака.",
        }
        result = prepare_imported_hymn_fields(source)
        self.assertEqual(result["kontakion_alt_content"], source["kontakion_alt_content"])
        self.assertEqual(result["kontakion_content"], source["kontakion_content"])

    def test_unicode_decoding_idempotence(self):
        decoded = decode_ucs8("Бжcтвенный гр0мъ, трубA дух0внаz")
        self.assertEqual(decode_ucs8(decoded), decoded)
        self.assertNotIn("гр0мъ", decoded)

    def test_alternative_splitting_requires_both_stanzas(self):
        self.assertIsNone(split_alternative("И$нъ тропaрь, глaсъ д7.", "troparion"))


if __name__ == "__main__":
    unittest.main()
