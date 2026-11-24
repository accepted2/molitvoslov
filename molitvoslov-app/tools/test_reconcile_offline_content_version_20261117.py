#!/usr/bin/env python3
"""Offline, dependency-free tests for the version-only repair helper."""
import json
import unittest

from reconcile_offline_content_version_20261117 import (
    change_version_only, fingerprint,
)

class VersionRepairTests(unittest.TestCase):
    def setUp(self):
        self.old = "a" * 64
        self.data = {
            "schema_version": 1,
            "generated_at": "2026-11-17",
            "content_version": self.old,
            "texts": {"1": {"title": "Молитва", "content": "А҆́гг҃ле Хрⷭ҇то́въ"}},
            "canons": {"list": [{"slug": "guardian"}], "by_slug": {
                "guardian": {"slug": "guardian", "sections": [
                    {"id": 3, "text": {"translation": "Молитва", "traditional_content": "А҆́гг҃ле"}}]
                }}
            },
        }

    def test_exact_one_metadata_change(self):
        raw = json.dumps(self.data, ensure_ascii=False, indent=2) + "\n"
        new = fingerprint(self.data)
        patched = change_version_only(raw, self.old, new)
        updated = json.loads(patched)
        self.assertEqual(updated["content_version"], new)
        updated["content_version"] = self.old
        self.assertEqual(updated, self.data)
        self.assertIn("А҆́гг҃ле", patched)
        self.assertEqual(raw.count("Молитва"), patched.count("Молитва"))

    def test_hash_excludes_only_expected_metadata(self):
        first = fingerprint(self.data)
        updated = dict(self.data, generated_at="tomorrow", content_version="b" * 64)
        self.assertEqual(first, fingerprint(updated))
        modified = json.loads(json.dumps(updated, ensure_ascii=False))
        modified["texts"]["1"]["title"] = "Другая молитва"
        self.assertNotEqual(first, fingerprint(modified))

    def test_duplicate_version_rejected(self):
        raw = json.dumps(self.data, ensure_ascii=False) + '\n{"content_version":"duplicate"}'
        with self.assertRaises((ValueError, json.JSONDecodeError)):
            change_version_only(raw, self.old, fingerprint(self.data))

    def test_wrong_original_version_rejected(self):
        raw = json.dumps(self.data, ensure_ascii=False)
        with self.assertRaises(ValueError):
            change_version_only(raw, "b" * 64, fingerprint(self.data))

if __name__ == "__main__":
    unittest.main(verbosity=2)
