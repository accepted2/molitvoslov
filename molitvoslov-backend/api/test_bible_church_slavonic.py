"""Validation tests for the isolated Church Slavonic Bible pilot."""
import json
from pathlib import Path
from tempfile import TemporaryDirectory

from django.core.management.base import CommandError
from django.test import SimpleTestCase

from api.management.commands.import_bible_church_slavonic import read_pilot


def fixture():
    books = []
    for code, count, order, status in (
        ("GEN", 50, 1, "parsed"),
        ("PSA", 150, 22, "needs_review"),
        ("MAT", 28, 51, "parsed"),
    ):
        books.append({
            "code": code,
            "status": status,
            "canonical_source_order": order,
            "chapters": [
                {"number": n, "verses": [{"number": 1, "text": "А҆́зъ вѣ́мъ."}]}
                for n in range(1, count + 1)
            ],
        })
    return {
        "schema_version": 0,
        "translation": {"code": "csl_traditional_CANDIDATE"},
        "books": books,
    }


class ChurchSlavonicPilotValidationTests(SimpleTestCase):
    def run_fixture(self, payload):
        with TemporaryDirectory() as temp:
            path = Path(temp) / "candidate.json"
            path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
            return read_pilot(path)

    def test_three_books_validate(self):
        books, digest = self.run_fixture(fixture())
        self.assertEqual(set(books), {"GEN", "PSA", "MAT"})
        self.assertEqual(len(digest), 64)
        self.assertEqual(len(books["PSA"]["chapters"]), 150)

    def test_does_not_require_151st_psalm_from_incomplete_source(self):
        payload = fixture()
        payload["books"][1]["chapters"].append({"number": 151, "verses": []})
        books, _ = self.run_fixture(payload)
        self.assertNotIn(151, books["PSA"]["chapters"])

    def test_rejects_duplicate_or_missing_verses(self):
        payload = fixture()
        payload["books"][0]["chapters"][0]["verses"] = [
            {"number": 1, "text": "Первый."},
            {"number": 3, "text": "Третий."},
        ]
        with self.assertRaises(CommandError):
            self.run_fixture(payload)

    def test_rejects_placeholder_and_corrupt_unicode(self):
        payload = fixture()
        payload["books"][2]["chapters"][0]["verses"][0]["text"] = "\ufffd"
        with self.assertRaises(CommandError):
            self.run_fixture(payload)

    def test_rejects_unreviewed_gospel(self):
        payload = fixture()
        payload["books"][2]["status"] = "needs_review"
        with self.assertRaises(CommandError):
            self.run_fixture(payload)

    def test_rejects_unexpected_translation(self):
        payload = fixture()
        payload["translation"]["code"] = "rst"
        with self.assertRaises(CommandError):
            self.run_fixture(payload)
