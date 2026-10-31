"""Safety checks for the scoped, SQLite -> offline prayer-rule exporter."""

import copy
import hashlib
import json

from django.core.management.base import CommandError
from django.test import SimpleTestCase

from api.management.commands.export_prayer_rule_to_offline import (
    update_rule_snapshot,
)


def fake_rule(ids):
    return {
        "slug": "molitvy-utrennie",
        "name": "Утренние молитвы",
        "items": [
            {"id": item_id, "order": index, "item_type": "text",
             "text": {"id": item_id, "title": f"Молитва {item_id}", "content": "Текст"}}
            for index, item_id in enumerate(ids, 1)
        ],
    }


def fake_bundle():
    rule = fake_rule([1, 2])
    other = {"slug": "other-rule", "items": [{"id": 50}]}
    return {
        "schema_version": 1,
        "generated_at": "2026-01-01",
        "content_version": "old",
        "categories": [{"id": 123}],
        "texts": {"unrelated": {"content": "Do not touch"}},
        "prayer_rules": {
            "list": [copy.deepcopy(rule), copy.deepcopy(other)],
            "by_slug": {
                "molitvy-utrennie": copy.deepcopy(rule),
                "other-rule": copy.deepcopy(other),
            },
        },
        "psalters": {"by_slug": {"psalm": "untouched"}},
    }


class ScopedPrayerRuleExportTests(SimpleTestCase):
    def test_appends_items_without_changing_other_sections(self):
        original = fake_bundle()
        saved_original = copy.deepcopy(original)
        replacement = fake_rule([1, 2, 3])

        updated, added, changed = update_rule_snapshot(
            original, "molitvy-utrennie", replacement
        )

        self.assertTrue(changed)
        self.assertEqual(added, ["3"])
        self.assertEqual(len(updated["prayer_rules"]["list"][0]["items"]), 3)
        self.assertEqual(len(updated["prayer_rules"]["by_slug"]["molitvy-utrennie"]["items"]), 3)
        self.assertEqual(updated["prayer_rules"]["list"][1], original["prayer_rules"]["list"][1])
        self.assertEqual(updated["prayer_rules"]["by_slug"]["other-rule"], original["prayer_rules"]["by_slug"]["other-rule"])
        self.assertEqual(updated["psalters"], original["psalters"])
        self.assertEqual(updated["texts"], original["texts"])
        self.assertEqual(updated["categories"], original["categories"])
        self.assertEqual(original, saved_original)

        content = {
            key: value for key, value in updated.items()
            if key not in {"schema_version", "content_version", "generated_at"}
        }
        expected = hashlib.sha256(json.dumps(
            content, ensure_ascii=False, sort_keys=True, separators=(",", ":")
        ).encode("utf-8")).hexdigest()
        self.assertEqual(updated["content_version"], expected)

    def test_refuses_to_drop_existing_prayer_items(self):
        with self.assertRaisesRegex(CommandError, "Refusing to remove"):
            update_rule_snapshot(fake_bundle(), "molitvy-utrennie", fake_rule([2]))

    def test_idempotent_when_rule_unchanged(self):
        original = fake_bundle()
        updated, added, changed = update_rule_snapshot(
            original, "molitvy-utrennie", fake_rule([1, 2])
        )
        self.assertFalse(changed)
        self.assertEqual(added, [])
        self.assertIs(updated, original)

    def test_rejects_missing_rule_or_corrupt_index(self):
        with self.assertRaises(CommandError):
            update_rule_snapshot(fake_bundle(), "unknown-rule", fake_rule([1, 2]))

        invalid = fake_bundle()
        invalid["prayer_rules"]["list"] = []
        with self.assertRaises(CommandError):
            update_rule_snapshot(invalid, "molitvy-utrennie", fake_rule([1, 2]))
