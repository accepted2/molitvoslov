#!/usr/bin/env python3
"""Read-only tests of the ACTUAL local search extractor (native v10 or legacy v9)."""
import ast
import importlib.util
from pathlib import Path
import re
import tempfile
import unittest
from unittest import mock

import build_search_seed_v10 as generator


def sample():
    return {
        "categories": [], "texts": {},
        "canons": {"by_slug": {}},
        "akathists": {"by_slug": {
            "sample": {
                "id": 9130001, "slug": "sample",
                "title": "Акафист для проверки", "is_visible": True,
                "sections": [{
                    "id": 9130002,
                    "text": {"title": "Кондак 1",
                             "content": "Господи, помилуй нас.",
                             "traditional_content": "Господи, помилуй насъ.",
                             "translation": "Господи, помилуй нас.",
                             "translation_uk": "Господи, помилуй нас."}
                }],
            }
        }},
        "prayer_rules": {"list": []},
        "psalters": {"list": []},
        "kathismas": {"by_number": {}},
    }


def corpus(source_text=None):
    with tempfile.TemporaryDirectory() as folder:
        root = Path(folder)
        cal = root / "src/data/calendar"
        cal.mkdir(parents=True)
        if source_text is not None:
            variant = root / "tools" / "build_search_seed.py"
            variant.parent.mkdir(parents=True)
            variant.write_text(source_text, encoding="utf-8")
            with mock.patch.object(generator, "ORIGINAL", variant):
                docs, kind = generator.extract_source_documents(
                    sample(), {"books": []}, cal
                )
        else:
            docs, kind = generator.extract_source_documents(
                sample(), {"books": []}, cal
            )
    return docs, kind


class SearchCorpusCompatibilityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = generator.ORIGINAL.read_text(encoding="utf-8-sig")
        cls.original_mode = ("modern" if
                             any(isinstance(n, ast.FunctionDef) and
                                 n.name == "extract_documents"
                                 for n in ast.parse(cls.source).body)
                             else "legacy")

    def test_current_local_source_is_supported(self):
        docs, kind = corpus()
        self.assertGreaterEqual(len(docs), 2)
        self.assertEqual(kind, "native-v10" if self.original_mode == "modern"
                         else "legacy-v9")
        generator.verify_source_coverage(sample(), docs)

    def test_legacy_language_tuple_ast_compiles(self):
        if self.original_mode != "legacy":
            self.skipTest("Current source uses native v10 extraction")
        code = generator.compile_corpus(self.source)
        self.assertIsInstance(code, type(compile("pass", "<test>", "exec")))

    def test_legacy_language_list_ast_compiles(self):
        if self.original_mode != "legacy":
            self.skipTest("Current source uses native v10 extraction")
        old = 'for lang in ("ru", "uk"):'
        self.assertEqual(self.source.count(old), 1)
        variant = self.source.replace(old, 'for lang in ["ru", "uk"]:')
        code = generator.compile_corpus(variant)
        self.assertIsInstance(code, type(compile("pass", "<test>", "exec")))

    def test_nonconstant_legacy_languages_are_rejected(self):
        if self.original_mode != "legacy":
            self.skipTest("Current source uses native v10 extraction")
        old = 'for lang in ("ru", "uk"):'
        self.assertEqual(self.source.count(old), 1)
        variant = self.source.replace(old, 'for lang in (unknown_language, "uk"):')
        with self.assertRaisesRegex(RuntimeError, "must be string literals"):
            generator.compile_corpus(variant)

    def test_akathist_title_and_sections_are_included(self):
        docs, _ = corpus()
        ext = {doc["ext"] for doc in docs}
        self.assertIn("akathists:9130001", ext)
        self.assertTrue(
            "akathists:section:9130002" in ext
            or "akathists:section:9130002:church" in ext
        )

    def test_changing_comments_does_not_change_search_content(self):
        altered = re.sub(r"(?m)^([ \t]*)#[^\n]*$",
                         r"\1# locally modified comment", self.source)
        original, _ = corpus()
        modified, _ = corpus(altered)
        self.assertEqual(original, modified)

    def test_native_v10_indexes_traditional_and_translations(self):
        if self.original_mode != "modern":
            self.skipTest("Older source has no combined language variants")
        docs, _ = corpus()
        section = next(d for d in docs if
                       d["ext"] == "akathists:section:9130002")
        codes = {c for c, value in section["variants"] if value}
        self.assertTrue({"c", "t", "r", "u"}.issubset(codes))

    def test_missing_published_akathist_is_rejected(self):
        docs, _ = corpus()
        altered = [d for d in docs if d["ext"] != "akathists:9130001"]
        with self.assertRaisesRegex(RuntimeError, "Published akathists missing"):
            generator.verify_source_coverage(sample(), altered)

    def test_missing_section_is_rejected(self):
        docs, _ = corpus()
        altered = [d for d in docs if not
                   d["ext"].startswith("akathists:section:9130002")]
        with self.assertRaisesRegex(RuntimeError, "Published akathists missing"):
            generator.verify_source_coverage(sample(), altered)

    def test_legacy_direct_sql_in_corpus_is_rejected(self):
        if self.original_mode != "legacy":
            self.skipTest("Native v10 extraction performs no legacy SQL slicing")
        tree = ast.parse(self.source)
        main = next(n for n in tree.body
                    if isinstance(n, ast.FunctionDef) and n.name == "main")
        idx = next(i for i, n in enumerate(main.body)
                   if isinstance(n, ast.FunctionDef) and n.name == "add")
        lines = self.source.splitlines(keepends=True)
        lines.insert(main.body[idx + 1].lineno - 1,
                     "    db.execute('DELETE FROM some_table')\n")
        with self.assertRaisesRegex(RuntimeError, "direct database operations"):
            generator.compile_corpus("".join(lines))


if __name__ == "__main__":
    unittest.main(verbosity=2)
