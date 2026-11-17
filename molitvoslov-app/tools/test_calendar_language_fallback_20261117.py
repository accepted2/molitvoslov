#!/usr/bin/env python3
"""Protect legacy calendar fallback without changing the underlying texts."""
import unittest

from search_seed_lib import merge_languages


def doc(ext, group="calendar", title="Святитель Николай",
        body="Святителю отче Николае, моли Бога о нас"):
    return {
        "ext": ext,
        "grp": group,
        "kind": "calendar-life" if group == "calendar" else "prayer",
        "title": title,
        "source": "Календарь",
        "route": {"name": "SaintDetail", "params": {"focusSection": "life"}},
        "variants": [("c", body)],
        "boost": 1.0,
    }


def visible(rows, language):
    return [r for r in rows if r["lang"] in ("", language)]


class CalendarLanguageFallbackTests(unittest.TestCase):
    def test_ru_only_calendar_available_from_both_locales(self):
        item = doc("calendar:saint-1")
        merged = merge_languages({"ru": [item], "uk": []})
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]["lang"], "")
        self.assertEqual(len(visible(merged, "ru")), 1)
        self.assertEqual(len(visible(merged, "uk")), 1)
        self.assertEqual(merged[0]["route"], item["route"])
        self.assertEqual(merged[0]["variants"], item["variants"])

    def test_identical_calendar_entries_still_merge(self):
        a = doc("calendar:saint-2")
        b = doc("calendar:saint-2", title="Святитель Миколай")
        result = merge_languages({"ru": [a], "uk": [b]})
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["lang"], "")
        self.assertEqual(result[0]["title"], a["title"])
        self.assertEqual(result[0]["title_uk"], b["title"])

    def test_distinct_translations_with_same_key_stay_separate(self):
        a = doc("calendar:saint-3", body="Житие на русском")
        b = doc("calendar:saint-3", title="Святитель Миколай",
                body="Житіє українською")
        result = merge_languages({"ru": [a], "uk": [b]})
        self.assertEqual(len(result), 2)
        self.assertEqual([r["lang"] for r in result], ["ru", "uk"])
        self.assertEqual(len(visible(result, "ru")), 1)
        self.assertEqual(len(visible(result, "uk")), 1)

    def test_uk_only_calendar_stays_uk(self):
        result = merge_languages({
            "ru": [], "uk": [doc("calendar:saint-4", title="Житіє")],
        })
        self.assertEqual(len(visible(result, "ru")), 0)
        self.assertEqual(len(visible(result, "uk")), 1)

    def test_ru_only_noncalendar_remains_ru_only(self):
        item = doc("prayer:5", group="prayers")
        merged = merge_languages({"ru": [item], "uk": []})
        self.assertEqual(merged[0]["lang"], "ru")
        self.assertEqual(len(visible(merged, "uk")), 0)

    def test_new_calendar_text_is_preserved(self):
        ru = doc("calendar:saint-5", body="Новый полный текст жития")
        result = merge_languages({"ru": [ru], "uk": []})
        self.assertEqual(result[0]["variants"][0][1], "Новый полный текст жития")


if __name__ == "__main__":
    unittest.main(verbosity=2)
