"""Regression tests: multiple feast hymns are distinct and preserve CSL text."""
import unittest

from api.calendar_hymn_normalization import normalize_hymn_source_fields


class CalendarHymnTests(unittest.TestCase):
    def test_nektarios_both_variants_and_ponomar_unicode(self):
        source = {
            "troparion_title": "Тропaрь, глaсъ №.\n\nПод0бенъ: Пустhнный жи1тель:",
            "troparion_content": (
                "Сили1вріи џтрасль и3 є3гjны храни1телz.\n\n"
                "И$нъ тропaрь, глaсъ д7.\n\n"
                "Под0бенъ: Ск0рw предвари2:\n\n"
                "Прпdбнэ пожи1лъ є3си2 ћкw с™и1тель мyдрый."
            ),
            "kontakion_content": (
                "Правослaвіz ѕвэздY новосвётлую.\n\n"
                "И$нъ кондaкъ, глaсъ в7:\n\n"
                "Бжcтвенный гр0мъ, трубA дух0внаz."
            ),
        }
        original = dict(source)
        result, issues = normalize_hymn_source_fields(source)
        self.assertEqual(issues, [])
        self.assertEqual(source, original)
        self.assertIn("Сили́вр", result["troparion_content"])
        self.assertIn("Прпⷣбнѣ", result["troparion_alternate_content"])
        self.assertIn("Подо́бенъ", result["troparion_alternate_title"])
        self.assertNotIn("Подо́бенъ", result["troparion_alternate_content"])
        self.assertIn("Правосла́вїѧ", result["kontakion_content"])
        self.assertIn("гро́мъ", result["kontakion_alternate_content"])
        for field in (
            "troparion_script", "troparion_alternate_script",
            "kontakion_script", "kontakion_alternate_script",
        ):
            self.assertEqual(result[field], "csl")
        result2, issues2 = normalize_hymn_source_fields(result)
        self.assertEqual(issues2, [])
        self.assertEqual(result, result2)

    def test_readable_russian_hymns_stay_unchanged(self):
        source = {
            "troparion_content": "Преподобнически пожив, яко мудрый иерарх.",
            "kontakion_content": "Божественный гром, труба духовная.",
        }
        self.assertEqual(normalize_hymn_source_fields(source), (source, []))

    def test_localized_alt_is_separate(self):
        source = {
            "troparion_content_uk": (
                "Сили1вріи џтрасль.\n\n"
                "И$нъ тропaрь, глaсъ д7.\n\n"
                "Прпdбнэ пожи1лъ є3си2."
            ),
        }
        result, issues = normalize_hymn_source_fields(source)
        self.assertEqual(issues, [])
        self.assertIn("troparion_alternate_content_uk", result)
        self.assertEqual(result["troparion_script_uk"], "csl")
        self.assertEqual(result["troparion_alternate_script_uk"], "csl")


if __name__ == "__main__":
    unittest.main()
