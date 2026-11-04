"""Offline guard tests for the Azbyka audit and create-only import pipeline."""

import json
from pathlib import Path
from tempfile import TemporaryDirectory

from django.core.management.base import CommandError
from django.test import SimpleTestCase
from bs4 import BeautifulSoup

from api.management.commands.import_akathist import Command as AkathistParser
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

    def test_dotted_and_accented_section_headings(self):
        parser = AkathistParser()
        self.assertEqual(parser.parse_section_heading("Конда́к. 8."), {"type": "kontakion", "number": 8})
        self.assertEqual(parser.parse_section_heading("И́кос 3."), {"type": "ikos", "number": 3})
        self.assertEqual(parser.parse_section_heading("Кондак № 13"), {"type": "kontakion", "number": 13})
        self.assertIsNone(parser.parse_section_heading("Кондак без номера"))

    def test_non_paragraph_leaf_blocks_are_parsed_only_as_fallback(self):
        parser = AkathistParser()
        markup = '<article>'
        for number in range(1, 14):
            markup += (
                f'<h4>Кондак {number}</h4><div class="church">Кондак текст {number} аллилуиа</div>'
            )
            if number <= 12:
                markup += (
                    f'<h4>Икос {number}</h4><div class="church">Икос текст {number} радуйся</div>'
                )
        markup += '</article>'
        parsed = parser.normalize_sections(parser.parse_sections(parser.find_best_root(BeautifulSoup(markup, "html.parser"))))
        parser.validate_sections(parsed)
        self.assertEqual(len([x for x in parsed if x["type"] == "kontakion"]), 13)
        self.assertEqual(len([x for x in parsed if x["type"] == "ikos"]), 12)

    def test_paragraph_source_still_takes_priority_over_div_fallback(self):
        parser = AkathistParser()
        markup = (
            '<article><h4>Кондак 1</h4>'
            '<div><p class="church">Оригинальный церковнославянский текст</p></div>'
            '<h4>Икос 1</h4><p>Текст икоса</p></article>'
        )
        root = BeautifulSoup(markup, "html.parser")
        sections = parser.parse_heading_format(root)
        self.assertEqual(sections[0]["content"], "Оригинальный церковнославянский текст")
        self.assertEqual(sections[1]["content"], "Текст икоса")

    def test_two_untagged_paragraphs_are_one_church_slavonic_hymn(self):
        parser = AkathistParser()
        opening = (
            "Возбранный Воеводо и Господи, радосте и веселие рабом Твоим, "
            "идеже Ты, тамо потребляется всякая печаль, зовуща:"
        )
        refrain = (
            "Господи мой, Господи, Радосте моя, даруй ми, "
            "да возрадуюся о милости Твоей."
        )
        content, translation = parser.parse_element_group(
            [
                {"text": opening, "classes": set()},
                {"text": refrain, "classes": set()},
            ], section_type="kontakion",
        )
        self.assertEqual(content, opening + "\\n\\n" + refrain)
        self.assertEqual(translation, "")

    def test_glory_to_thee_refrain_is_not_a_translation(self):
        parser = AkathistParser()
        first = "Избранному прежде век соделать спасение мира, воспеваем Тебе, взывающе:"
        refrain = "Слава Тебе, Господи, слава Тебе."
        content, translation = parser.parse_element_group(
            [
                {"text": first, "classes": set()},
                {"text": refrain, "classes": set()},
            ], section_type="kontakion",
        )
        self.assertTrue(content.endswith(refrain))
        self.assertEqual(translation, "")

    def test_multiple_untagged_ikos_paragraphs_remain_in_order(self):
        parser = AkathistParser()
        lines = [
            "Глас вознесем:",
            "Радуйся, Чистая.",
            "Радуйся, Владычице.",
            "Радуйся, Мати Божия.",
        ]
        content, translation = parser.parse_element_group(
            [{"text": line, "classes": set()} for line in lines],
            section_type="ikos",
        )
        self.assertEqual(content, "\\n\\n".join(lines))
        self.assertEqual(translation, "")

    def test_explicit_russian_translation_is_kept_separately(self):
        parser = AkathistParser()
        content, translation = parser.parse_element_group(
            [
                {"text": "Слава Тебе, Господи.", "classes": {"paint"}},
                {"text": "Слава Тебе, Господи.", "classes": {"translate"}},
            ], section_type="kontakion",
        )
        self.assertEqual(content, "Слава Тебе, Господи.")
        self.assertEqual(translation, "Слава Тебе, Господи.")

    def test_unknown_paragraph_not_discarded_between_tagged_paragraphs(self):
        parser = AkathistParser()
        content, translation = parser.parse_element_group(
            [
                {"text": "Первый абзац", "classes": {"church"}},
                {"text": "Важная строка", "classes": set()},
                {"text": "Русский перевод", "classes": {"translate"}},
            ], section_type="ikos",
        )
        self.assertEqual(content, "Первый абзац\\n\\nВажная строка")
        self.assertEqual(translation, "Русский перевод")

    def test_language_class_is_inherited_from_nearest_parent(self):
        parser = AkathistParser()
        soup = BeautifulSoup(
            '<div class="paint"><p>Церковнославянский</p></div>'
            '<div class="translate"><p>Русский</p></div>', "html.parser",
        )
        nodes = soup.find_all("p")
        self.assertEqual(parser.inherited_language_classes(nodes[0]), {"paint"})
        self.assertEqual(parser.inherited_language_classes(nodes[1]), {"translate"})
