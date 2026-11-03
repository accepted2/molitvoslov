#!/usr/bin/env python3
"""No-network regression checks for local APK exporter repair and no-loss promotion."""
import ast
import unittest
from repair_local_mobile_export import corrected_exporter
from promote_local_django_offline import compare_without_loss

BASE_EXPORTER = """
from api.models import Akathist, Text
def build_mobile_content_payload():
    # original code also includes unmodified prayers
    visible_akathists = list(Akathist.objects.filter(is_visible=True).order_by("id"))
    curated_akathist_ids = [item.id for item in visible_akathists if is_curated_akathist(item)]
    akathists_qs = Akathist.objects.filter(id__in=curated_akathist_ids).order_by("id")
    prayers = Text.objects.filter(is_visible=True)
    return akathists_qs, prayers
"""


def snapshot(with_new):
    old = {
        "schema_version": 1,
        "akathists": {"list": [
            {"slug": "existing", "title": "Святителю Николаю", "is_visible": True}
        ], "by_slug": {"existing": {"sections": [{"id": 1}]}}},
        "canons": {"list": [{"slug": "canon"}], "by_slug": {"canon": {}}},
        "prayer_rules": {"list": [{"slug": "morning"}], "by_slug": {"morning": {}}},
        "texts": {"morning-prayer": {"slug": "morning-prayer", "content": "Было"}},
        "psalters": {"by_slug": {"p": {}}},
        "kathismas": {"by_number": {"1": {}}},
        "categories": [{"slug": "c"}],
        "category_texts": {"c": []},
        "app_assets": {},
    }
    if with_new:
        old["akathists"]["list"].append({
            "slug": "new", "title": "Избавление от бед страждущих", "is_visible": True
        })
        old["akathists"]["by_slug"]["new"] = {"sections": [{"id": i} for i in range(26)]}
        old["texts"]["new-prayer"] = {"slug": "new-prayer", "content": "Добавлено"}
        old["texts"]["morning-prayer"]["content"] = "Исправлено"
    return old


class ExporterRepairTests(unittest.TestCase):
    def test_single_line_legacy_filter(self):
        patched, old = corrected_exporter(BASE_EXPORTER)
        self.assertIn("id__in=curated_akathist_ids", old)
        self.assertIn("akathists_qs = Akathist.objects.filter(is_visible=True)", patched)
        self.assertIn("prayers = Text.objects.filter(is_visible=True)", patched)
        ast.parse(patched)

    def test_multiline_legacy_filter(self):
        source = BASE_EXPORTER.replace(
            "akathists_qs = Akathist.objects.filter(id__in=curated_akathist_ids).order_by(\"id\")",
            "akathists_qs = (Akathist.objects\n"
            "        .filter(id__in=curated_akathist_ids)\n"
            "        .order_by(\"id\"))",
        )
        patched, _ = corrected_exporter(source)
        self.assertIn("akathists_qs = Akathist.objects.filter(is_visible=True)", patched)
        ast.parse(patched)

    def test_no_unrecognized_replacement(self):
        source = BASE_EXPORTER.replace(
            "Akathist.objects.filter(id__in=curated_akathist_ids)",
            "Akathist.objects.filter(is_visible=True)",
        )
        with self.assertRaisesRegex(RuntimeError, "not the known legacy curated-only"):
            corrected_exporter(source)

    def test_existing_public_content_is_preserved(self):
        changes = compare_without_loss(snapshot(False), snapshot(True))
        self.assertEqual(changes["akathists_added"], 1)
        self.assertEqual(changes["texts_added"], 1)
        self.assertEqual(changes["texts_changed"], 1)

    def test_missing_old_prayer_is_rejected(self):
        before = snapshot(False)
        after = snapshot(True)
        after["texts"].pop("morning-prayer")
        with self.assertRaisesRegex(RuntimeError, "REFUSING DATA LOSS"):
            compare_without_loss(before, after)

    def test_missing_canon_is_rejected(self):
        before = snapshot(False)
        after = snapshot(True)
        after["canons"] = {"list": [], "by_slug": {}}
        with self.assertRaisesRegex(RuntimeError, "REFUSING DATA LOSS"):
            compare_without_loss(before, after)


if __name__ == "__main__":
    unittest.main(verbosity=2)
