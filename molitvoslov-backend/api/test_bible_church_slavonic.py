"""Validation tests for the isolated Church Slavonic Bible pilot."""
import json
from pathlib import Path
from tempfile import TemporaryDirectory

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, TestCase
from api.models import BibleBook, BibleChapter, BibleTranslation, BibleVerse

from api.management.commands.import_bible_church_slavonic import read_pilot
from api.bible_ids import bible_client_id


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



    def test_bundled_sample_ids_are_stable(self):
        from django.conf import settings

        path = (
            settings.BASE_DIR.parent
            / "molitvoslov-app" / "src" / "data"
            / "offlineBibleCslTraditional.json"
        )
        payload = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(payload["translation"]["code"], "csl_traditional")
        self.assertEqual(payload["translation"]["id"], 500000)
        self.assertEqual(
            [(b["code"], len(b["chapters"])) for b in payload["books"]],
            [("GEN", 50), ("PSA", 150), ("MAT", 28)],
        )
        total = 0
        ids = set()
        for book in payload["books"]:
            order = book["canonical_order"]
            self.assertEqual(book["id"], bible_client_id(
                "csl_traditional", "book", None, order=order
            ))
            for chapter in book["chapters"]:
                self.assertEqual(chapter["id"], bible_client_id(
                    "csl_traditional", "chapter", None,
                    order=order, chapter=chapter["number"],
                ))
                for verse in chapter["verses"]:
                    self.assertEqual(verse["id"], bible_client_id(
                        "csl_traditional", "verse", None,
                        order=order, chapter=chapter["number"],
                        verse=verse["number"],
                    ))
                    self.assertTrue(verse["text"].strip())
                    self.assertNotIn(verse["id"], ids)
                    ids.add(verse["id"])
                    total += 1
        self.assertEqual(total, 5131)

class ChurchSlavonicPilotDatabaseTests(TestCase):
    def test_import_and_export_do_not_change_synodal_ids(self):
        rst = BibleTranslation.objects.create(
            code="rst", name="Синодальный перевод", language="ru"
        )
        rst_book = BibleBook.objects.create(
            translation=rst, code="GEN", name="Бытие", short_name="Быт.",
            slug="genesis", canonical_order=1, testament="old", section="old"
        )
        rst_chapter = BibleChapter.objects.create(book=rst_book, number=1)
        rst_verse = BibleVerse.objects.create(
            chapter=rst_chapter, number=1, text="В начале сотворил Бог небо и землю."
        )

        with TemporaryDirectory() as temp:
            path = Path(temp) / "candidate.json"
            path.write_text(json.dumps(fixture(), ensure_ascii=False), encoding="utf-8")
            call_command("import_bible_church_slavonic", input=str(path))
            csl = BibleTranslation.objects.get(code="csl_traditional")
            self.assertEqual(csl.language, "cu")
            self.assertEqual(csl.script_variant, "church_traditional")
            self.assertEqual(BibleBook.objects.filter(translation=csl).count(), 3)

            export_path = Path(temp) / "offlineBibleCslTraditional.json"
            call_command(
                "export_bible_content", translation="csl_traditional",
                output=str(export_path),
            )
            payload = json.loads(export_path.read_text(encoding="utf-8"))
            self.assertEqual(payload["translation"]["code"], "csl_traditional")
            self.assertEqual({b["code"] for b in payload["books"]}, {"GEN", "PSA", "MAT"})
            self.assertTrue(all(b["chapters"] for b in payload["books"]))
            self.assertNotIn(rst_book.id, {b["id"] for b in payload["books"]})
            self.assertEqual(payload["translation"]["id"], 500000)
            self.assertEqual(payload["books"][0]["id"], 500001)
            first_chapter = payload["books"][0]["chapters"][0]
            self.assertEqual(first_chapter["id"], 10001001)
            self.assertEqual(first_chapter["verses"][0]["id"], 101001001)

        rst_verse.refresh_from_db()
        self.assertEqual(rst_verse.text, "В начале сотворил Бог небо и землю.")
        self.assertEqual(rst_verse.chapter.book.id, rst_book.id)
