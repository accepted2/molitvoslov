#!/usr/bin/env python3
"""Test exact-byte version repair and protected prayer re-categorization."""
import copy
import hashlib
import json
import unittest

from refresh_offline_content_version_20261118 import (
    canonical_version, patch_version_only,
)
from restore_misc_prayers import load_snapshot
from verify_relocated_misc_prayers import (
    MAIN, ROOT, THANKS, VOLUMES, RELOCATABLE,
    validate_restored_prayers,
)


def reference_bundle():
    root = {"id": 1, "slug": ROOT, "parent": None, "name": "Разные молитвы"}
    main = {"id": 2, "slug": MAIN, "parent": 1, "name": "Молитвы Иоанна"}
    gratitude = {"id": 3, "slug": THANKS, "parent": 2, "name": "Благодарственные"}
    volumes = {"id": 4, "slug": VOLUMES, "parent": 2, "name": "Моя жизнь"}
    prayers = load_snapshot()
    content = {
        "schema_version": 1, "content_version": "0" * 64,
        "generated_at": "2026-11-18T01:00:00Z",
        "categories": [root, main, gratitude, volumes],
        "texts": {},
        "category_texts": {k: [] for k in (ROOT, MAIN, THANKS, VOLUMES)},
    }
    for i, item in enumerate(prayers, start=1):
        slug = item["slug"]
        content["texts"][slug] = copy.deepcopy(item)
        content["category_texts"][ROOT].append({
            "id": i, "text": {"id": i, "slug": slug}, "category": root,
            "order": i * 10
        })
    return content, prayers


def move_row(bundle, slug, destination=MAIN):
    source = bundle["category_texts"][ROOT]
    matching = [item for item in source if item["text"]["slug"] == slug]
    assert len(matching) == 1
    row = matching[0]
    source.remove(row)
    bundle["category_texts"][destination].append(row)


class VersionAndPrayersTests(unittest.TestCase):
    def test_canonical_python_hash_and_no_other_bytes_modified(self):
        data, _ = reference_bundle()
        text = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
        before = text.encode("utf-8")
        after, old, new, previous, expected = patch_version_only(before)
        reference = hashlib.sha256(json.dumps(
            {key: val for key, val in data.items()
             if key not in ("schema_version", "content_version", "generated_at")},
            sort_keys=True, ensure_ascii=False, separators=(",", ":")
        ).encode("utf-8")).hexdigest()
        self.assertEqual(expected, reference)
        self.assertEqual(expected, canonical_version(new))
        self.assertEqual(previous, "0" * 64)
        self.assertEqual(
            after, before.replace(("0" * 64).encode(), expected.encode(), 1)
        )
        self.assertEqual(old["texts"], new["texts"])
        self.assertEqual(old["category_texts"], new["category_texts"])
        second, *_ = patch_version_only(after)
        self.assertEqual(second, after)

    def test_five_original_prayers_at_root(self):
        bundle, prayers = reference_bundle()
        validate_restored_prayers(bundle, prayers)

    def test_st_john_prayers_moved_to_author_subcategory(self):
        bundle, prayers = reference_bundle()
        for slug in RELOCATABLE:
            move_row(bundle, slug)
        validate_restored_prayers(bundle, prayers)

    def test_authorized_exact_text_duplicate(self):
        bundle, prayers = reference_bundle()
        original = sorted(RELOCATABLE)[0]
        move_row(bundle, original)
        migrated = bundle["category_texts"][MAIN].pop()
        equivalent = copy.deepcopy(bundle["texts"][original])
        equivalent["slug"] = "new-nested-verified-prayer"
        bundle["texts"][equivalent["slug"]] = equivalent
        migrated["text"] = {"id": 99, "slug": equivalent["slug"]}
        bundle["category_texts"][MAIN].append(migrated)
        validate_restored_prayers(bundle, prayers)

    def test_unlinked_original_with_nonidentical_text_is_rejected(self):
        bundle, prayers = reference_bundle()
        original = sorted(RELOCATABLE)[0]
        move_row(bundle, original)
        bundle["category_texts"][MAIN].clear()
        with self.assertRaisesRegex(RuntimeError, "missing original"):
            validate_restored_prayers(bundle, prayers)

    def test_removed_optina_root_link_is_rejected(self):
        bundle, prayers = reference_bundle()
        optina = next(x["slug"] for x in prayers if x["slug"] not in RELOCATABLE)
        move_row(bundle, optina)
        with self.assertRaisesRegex(RuntimeError, "missing original"):
            validate_restored_prayers(bundle, prayers)

    def test_category_parent_not_consistent_is_rejected(self):
        bundle, prayers = reference_bundle()
        move_row(bundle, sorted(RELOCATABLE)[0])
        bundle["categories"][2]["parent"] = 1
        with self.assertRaisesRegex(RuntimeError, "INCONSISTENT"):
            validate_restored_prayers(bundle, prayers)

    def test_missing_original_text_is_rejected(self):
        bundle, prayers = reference_bundle()
        bundle["texts"].pop(sorted(RELOCATABLE)[0])
        with self.assertRaisesRegex(RuntimeError, "Missing prayer texts"):
            validate_restored_prayers(bundle, prayers)


if __name__ == "__main__":
    unittest.main(verbosity=2)
