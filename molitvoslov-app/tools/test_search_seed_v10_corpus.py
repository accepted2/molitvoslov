#!/usr/bin/env python3
"""Read-only regression tests for the v10 search corpus generator."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

from build_search_seed_v10 import compile_corpus, verify_source_coverage, ORIGINAL


def corpus_documents(source):
    spec = importlib.util.spec_from_file_location("original_search_for_test", ORIGINAL)
    old = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(old)
    content = {
        "categories": [],
        "texts": {},
        "canons": {"by_slug": {}},
        "akathists": {"by_slug": {
            "sample": {
                "id": 9130001, "slug": "sample", "title": "Тестовый акафист",
                "is_visible": True,
                "sections": [
                    {"id": 9130002, "text": {"title": "Кондак 1",
                                           "content": "Господи, помилуй нас."}}
                ],
            }
        }},
        "prayer_rules": {"list": []},
        "psalters": {"list": []},
        "kathismas": {"by_number": {}},
    }
    collected = {"ru": [], "uk": []}

    def add(lang, group, identifier, title, source_text, texts, route,
            kind="text", preview="", text_language=None):
        if title or any(texts):
            collected[lang].append({
                "ext": str(identifier), "grp": str(group),
                "kind": str(kind), "title": title, "route": route,
            })
    with tempfile.TemporaryDirectory() as folder:
        root = Path(folder)
        (root / "src/data/calendar").mkdir(parents=True)
        scope = dict(vars(old))
        scope.update({
            "ROOT": root, "content": content,
            "bible": {"books": []}, "add": add
        })
        exec(compile_corpus(source), scope, scope)
    return content, collected


class OriginalSearchTraversalTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = ORIGINAL.read_text(encoding="utf-8-sig")

    def test_original_search_corpus_contains_the_akathist_and_section(self):
        content, collected = corpus_documents(self.source)
        verify_source_coverage(content, collected)
        for lang in ("ru", "uk"):
            ext = {d["ext"] for d in collected[lang]}
            self.assertIn("akathists:9130001", ext)
            self.assertIn("akathists:section:9130002:church", ext)

    def test_modified_comment_does_not_omit_any_documents(self):
        # This source change broke the previous brittle string-slice v10 generator.
        original_tag = "    # Feast-level calendar texts:"
        self.assertIn(original_tag, self.source)
        alternate = self.source.replace(original_tag, "    # Local search corpus:")
        content, original = corpus_documents(self.source)
        content2, modified = corpus_documents(alternate)
        self.assertEqual(content, content2)
        self.assertEqual(original, modified)

    def test_modified_metadata_spacing_preserves_corpus(self):
        original = "        public_ver = content.get("
        self.assertIn(original, self.source)
        alternate = self.source.replace(original, "        public_ver  =  content.get(")
        _, baseline = corpus_documents(self.source)
        _, modified = corpus_documents(alternate)
        self.assertEqual(baseline, modified)

    def test_direct_db_write_before_metadata_is_rejected(self):
        needle = "    # Feast-level calendar texts:"
        self.assertIn(needle, self.source)
        modified = self.source.replace(needle,
                                       "    db.execute('DELETE FROM users')\n" + needle)
        with self.assertRaisesRegex(RuntimeError, "direct database operations"):
            compile_corpus(modified)

    def test_missing_published_akathist_stops_build(self):
        content, collected = corpus_documents(self.source)
        for lang in ("ru", "uk"):
            collected[lang] = [
                d for d in collected[lang] if d["ext"] != "akathists:9130001"
            ]
        with self.assertRaisesRegex(RuntimeError, "Published akathists missing"):
            verify_source_coverage(content, collected)

    def test_missing_published_akathist_section_stops_build(self):
        content, collected = corpus_documents(self.source)
        for lang in ("ru", "uk"):
            collected[lang] = [
                d for d in collected[lang]
                if d["ext"] != "akathists:section:9130002:church"
            ]
        with self.assertRaisesRegex(RuntimeError, "Published akathists missing"):
            verify_source_coverage(content, collected)


if __name__ == "__main__":
    unittest.main(verbosity=2)
