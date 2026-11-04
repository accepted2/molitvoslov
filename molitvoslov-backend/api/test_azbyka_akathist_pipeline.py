"""Offline guard tests for the Azbyka audit and create-only import pipeline."""

import json
from pathlib import Path
from tempfile import TemporaryDirectory

from django.core.management.base import CommandError
from django.test import SimpleTestCase

from api.management.commands.audit_azbyka_akathist_catalog import (
    CATALOG_URL,
    canonical_url,
    discover_catalog,
    parsed_content_sha256,
)
from api.management.commands.import_azbyka_akathists_safe import (
    load_approved,
    load_audit,
    validate_candidate,
)


class AzbykaPipelineTests(SimpleTestCase):
    def sample_item(self):
        return {
            "url": "https://azbyka.ru/molitvoslov/akafist-test.html",
            "slug": "akafist-test",
            "title": "Акафист тестовый",
            "status": "checked",
            "checks": {"kontakia": 13, "ikoses": 12},
            "content_sha256": "f" * 64,
        }

    def test_canonical_urls_only_from_azbyka(self):
        self.assertEqual(
            canonical_url("https://azbyka.ru/molitvoslov/akafist-test.html?source=menu"),
            "https://azbyka.ru/molitvoslov/akafist-test.html",
        )
        self.assertIsNone(canonical_url("https://example.org/molitvoslov/akafist-test.html"))
        self.assertIsNone(canonical_url("http://azbyka.ru/molitvoslov/akafist-test.html"))

    def test_catalog_deduplicates_and_ignores_non_akathists(self):
        html = (
            '<ol><li><a href="/molitvoslov/akafist-test.html">Тестовый</a></li>'
            '<li><a href="/molitvoslov/akafist-test.html?ref=repeat">Повтор</a></li>'
            '<li><a href="/other/article.html">Статья</a></li></ol>'
        )
        entries = discover_catalog(html)
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["title"], "Акафист Тестовый")

    def test_digest_is_stable_for_equivalent_parsed_content(self):
        sections = [{"type": "kontakion", "number": 1, "content": "Текст", "translation": "", "note": ""}]
        first = parsed_content_sha256(sections, {"content": "Тропарь", "translation": ""})
        second = parsed_content_sha256([dict(reversed(list(sections[0].items())))],
                                       {"translation": "", "content": "Тропарь"})
        self.assertEqual(first, second)

    def test_digest_changes_when_prayer_changes(self):
        before = [{"type": "ikos", "number": 1, "content": "Исходный текст"}]
        after = [{"type": "ikos", "number": 1, "content": "Исправленный текст"}]
        self.assertNotEqual(parsed_content_sha256(before), parsed_content_sha256(after))

    def test_only_checked_and_complete_audit_is_candidate(self):
        item = self.sample_item()
        self.assertTrue(validate_candidate(item))
        item["checks"]["ikoses"] = 11
        self.assertFalse(validate_candidate(item))
        item["checks"]["ikoses"] = 12
        item["status"] = "error"
        self.assertFalse(validate_candidate(item))

    def test_no_audit_without_100_catalog_links(self):
        with TemporaryDirectory() as folder:
            path = Path(folder) / "audit.json"
            path.write_text(
                json.dumps({"source": CATALOG_URL, "pages": {"one": self.sample_item()}}),
                encoding="utf-8",
            )
            with self.assertRaises(CommandError):
                load_audit(path)

    def test_approval_must_be_explicit_and_unique(self):
        with TemporaryDirectory() as folder:
            path = Path(folder) / "approved.json"
            path.write_text('["akafist-test", "akafist-test"]', encoding="utf-8")
            with self.assertRaises(CommandError):
                load_approved(path)
            path.write_text('["akafist-test"]', encoding="utf-8")
            self.assertEqual(load_approved(path), {"akafist-test"})

    def test_unknown_or_empty_approval_is_rejected(self):
        with TemporaryDirectory() as folder:
            path = Path(folder) / "approved.json"
            path.write_text("[]", encoding="utf-8")
            with self.assertRaises(CommandError):
                load_approved(path)
        self.assertEqual(load_approved(None), set())
