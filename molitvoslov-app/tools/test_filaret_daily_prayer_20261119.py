#!/usr/bin/env python3
"""Regression tests for the photographed St Philaret daily prayer import."""
import copy
import unittest

from import_filaret_daily_prayer_20261119 import (
    add_to_payload, canonical_version, load_prayer, normalized,
)


def fixture():
    root = {
        "id": 12, "slug": "raznye-molitvy", "name": "Разные молитвы",
        "parent": None, "order": 10,
    }
    other = {
        "id": 27, "slug": "molitva-znakomaya", "title": "Молитва знакомая",
        "content": "Господи помилуй", "translation": "",
        "traditional_content": "", "categories": [root.copy()],
    }
    return {
        "schema_version": 1, "content_version": "a" * 64,
        "generated_at": "2026-11-19",
        "categories": [root],
        "texts": {other["slug"]: other},
        "category_texts": {
            root["slug"]: [
                {"id": 90, "category": root, "text": copy.deepcopy(other), "order": 10}
            ]
        },
        "akathists": {"list": []}, "prayer_rules": {"list": []},
    }


class FilaretDailyPrayerTests(unittest.TestCase):
    def setUp(self):
        self.prayer = load_prayer()
        self.fixture = fixture()

    def test_transcription_preserves_words_and_has_no_page_hyphens(self):
        text = self.prayer["text"]
        self.assertTrue(text.startswith("Господи, не знаю чего мне просить у Тебя."))
        self.assertIn("Отче, даждь рабу Твоему, чего сам я просить не умею.", text)
        self.assertIn("Порази и исцели, низложи и подыми меня.", text)
        self.assertIn("Приношу себя в жертву Тебе.", text)
        self.assertTrue(text.endswith("Сам во мне молись! Аминь."))
        self.assertNotIn("\u00ad", text)
        self.assertNotIn("\n", text)
        self.assertEqual(self.prayer["language"], "ru")

    def test_one_russian_prayer_created_with_stable_id(self):
        old = copy.deepcopy(self.fixture)
        result = add_to_payload(self.fixture, self.prayer)
        self.assertEqual(result["status"], "NEW_TEXT_LINKED")
        self.assertEqual(result["id"], 28)
        self.assertEqual(self.fixture["texts"]["molitva-znakomaya"],
                         old["texts"]["molitva-znakomaya"])
        self.assertEqual(len(self.fixture["category_texts"]["raznye-molitvy"]), 2)
        added = self.fixture["texts"][self.prayer["slug"]]
        self.assertEqual(added["title"], self.prayer["title"])
        self.assertEqual(added["translation"], self.prayer["text"])
        self.assertEqual(added["language"], "ru")
        self.assertEqual(added["content"], "")
        self.assertEqual(added["traditional_content"], "")
        self.assertEqual(added["categories"][0]["slug"], "raznye-molitvy")
        self.assertEqual(self.fixture["category_texts"]["raznye-molitvy"][-1]["id"], 91)

    def test_repeated_import_does_not_duplicate(self):
        add_to_payload(self.fixture, self.prayer)
        previous = copy.deepcopy(self.fixture)
        result = add_to_payload(self.fixture, self.prayer)
        self.assertEqual(result["status"], "EXISTING_SLUG_ALREADY_LINKED")
        self.assertFalse(result["new_content"])
        self.assertEqual(self.fixture, previous)

    def test_identical_text_reused_from_other_category(self):
        alternate = {
            "id": 102,
            "slug": "older-filaret-prayer",
            "title": "Молитва святителя Филарета",
            "content": "",
            "translation": self.prayer["text"],
            "traditional_content": "",
            "categories": [{"id": 99, "slug": "other", "name": "Other"}],
        }
        self.fixture["texts"][alternate["slug"]] = alternate
        before = len(self.fixture["texts"])
        result = add_to_payload(self.fixture, self.prayer)
        self.assertEqual(result["status"], "EXACT_TEXT_REUSED_LINKED")
        self.assertEqual(len(self.fixture["texts"]), before)
        self.assertEqual(result["slug"], alternate["slug"])
        self.assertIn("raznye-molitvy", [
            cat["slug"] for cat in self.fixture["texts"][alternate["slug"]]["categories"]
        ])

    def test_same_slug_different_body_is_blocked(self):
        self.fixture["texts"][self.prayer["slug"]] = {
            "id": 101, "slug": self.prayer["slug"],
            "translation": "Другая молитва", "content": "", "traditional_content": "",
        }
        with self.assertRaisesRegex(ValueError, "different text"):
            add_to_payload(self.fixture, self.prayer)

    def test_existing_categories_and_prayers_preserved(self):
        untouched = copy.deepcopy(self.fixture["texts"]["molitva-znakomaya"])
        categories = copy.deepcopy(self.fixture["categories"])
        add_to_payload(self.fixture, self.prayer)
        self.assertEqual(self.fixture["texts"]["molitva-znakomaya"], untouched)
        self.assertEqual(self.fixture["categories"], categories)
        self.assertEqual(
            self.fixture["category_texts"]["raznye-molitvy"][0]["text"], untouched
        )
        self.assertEqual(canonical_version(self.fixture),
                         canonical_version(copy.deepcopy(self.fixture)))

    def test_exact_full_prayer_is_required_for_deduplication(self):
        self.fixture["texts"]["short-excerpt"] = {
            "id": 88, "slug": "short-excerpt", "title": self.prayer["title"],
            "content": "", "translation": self.prayer["text"][:320],
            "traditional_content": "", "categories": [],
        }
        result = add_to_payload(self.fixture, self.prayer)
        self.assertEqual(result["status"], "NEW_TEXT_LINKED")
        self.assertEqual(len(self.fixture["texts"]), 3)


if __name__ == "__main__":
    unittest.main(verbosity=2)
