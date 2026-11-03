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
        # Existing local v9 may already have renamed the original comment,
        # therefore modify ANY standalone comments, not one hard-coded line.
        import re
        alternate = re.sub(r"(?m)^([ \t]*)#[^\n]*$",
                           r"\1# comment changed locally", self.source)
        content, original = corpus_documents(self.source)
        content2, modified = corpus_documents(alternate)
        self.assertEqual(content, content2)
        self.assertEqual(original, modified)

    def test_modified_metadata_spacing_preserves_corpus(self):
        # Same traversal despite local formatting changes in metadata.
        import re
        alternate = re.sub(r"(?m)\b(public_ver|bible_ver)\s*=",
                           r"\1  =", self.source)
        _, baseline = corpus_documents(self.source)
        _, modified = corpus_documents(alternate)
        self.assertEqual(baseline, modified)

    def test_direct_db_write_before_metadata_is_rejected(self):
        import ast
        tree = ast.parse(self.source)
        main = next(n for n in tree.body
                    if isinstance(n, ast.FunctionDef) and n.name == "main")
        idx = next(i for i, node in enumerate(main.body)
                   if isinstance(node, ast.FunctionDef) and node.name == "add")
        at = main.body[idx + 1].lineno - 1
        lines = self.source.splitlines(keepends=True)
        lines.insert(at, "    db.execute('DELETE FROM users')\n")
        with self.assertRaisesRegex(RuntimeError, "direct database operations"):
            compile_corpus("".join(lines))

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
