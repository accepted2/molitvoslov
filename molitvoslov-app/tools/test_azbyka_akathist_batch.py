#!/usr/bin/env python3
"""Regression checks for additive Akathist offline snapshots (no Django needed)."""
import argparse
import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from azbyka_akathist_batch import SOURCE, akathist_index, content_fingerprint, merge, prepare, quarantine, repair, verify_detail


def section(section_type, number, uid):
    return {
        "id": uid, "section_type": section_type, "number": number, "order": uid,
        "note": "", "text": {"id": uid, "content": "Тестовый текст для проверки", "translation": ""},
    }


def akathist(slug, uid):
    items = []
    for number in range(1, 14):
        items.append(section("kontakion", number, uid + number))
        if number <= 12:
            items.append(section("ikos", number, uid + 20 + number))
    # Extra repeat of the first ikos and kontakion is expected by this reader.
    items.append(section("ikos", 1, uid + 42))
    items.append(section("kontakion", 1, uid + 43))
    return {
        "id": uid, "slug": slug, "title": "Акафист " + slug,
        "is_visible": True, "sections": items, "troparion": None, "kontakion_before": None,
        "common_rule": None,
    }


def payload(entries):
    block = {"list": [], "by_slug": {}}
    for x in entries:
        item = {k: x[k] for k in ("id", "slug", "title", "is_visible")}
        block["list"].append(item)
        block["by_slug"][x["slug"]] = x
    data = {
        "schema_version": 1, "generated_at": "2026-11-04T00:00:00Z",
        "categories": [{"id": 1, "name": "Старый раздел"}],
        "texts": {"keep-me": {"id": 1, "content": "Ручная молитва"}},
        "prayer_rules": {"list": [{"slug": "keep"}], "by_slug": {}},
        "psalters": {"list": [], "by_slug": {}}, "kathismas": {"by_number": {}},
        "akathists": block, "canons": {"list": [], "by_slug": {}},
        "daily_quotes": [], "app_assets": {},
    }
    data["content_version"] = content_fingerprint(data)
    return data


class AdditiveAkathistsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.dir = Path(self.temp.name)
        self.old = self.dir / "offline.json"
        self.staged = self.dir / "staged.json"
        self.report = self.dir / "report.json"
        self.backups = self.dir / "backups"
        self.approved = self.dir / "approved.json"
        self.existing = payload([akathist("akafist-old", 13)])
        self.latest = payload([akathist("akafist-old", 1000), akathist("akafist-new", 13)])
        # New Django IDs collide with the local offline copy, not with each
        # other in the staged Django export. Existing IDs must remain stable.
        self.old.write_text(json.dumps(self.existing, ensure_ascii=False), encoding="utf-8")
        self.staged.write_text(json.dumps(self.latest, ensure_ascii=False), encoding="utf-8")
        self.report.write_text(json.dumps({
            "source": SOURCE, "pages": {"https://azbyka.ru/molitvoslov/akafist-new.html":
            {"status": "imported", "slug": "akafist-new"}}
        }), encoding="utf-8")

    def params(self, apply):
        return argparse.Namespace(existing=str(self.old), staged=str(self.staged),
                                  report=str(self.report), backup_dir=str(self.backups), apply=apply)

    def test_structure_includes_repeated_sections(self):
        self.assertTrue(verify_detail(akathist("akafist-new", 100)))
        partial = akathist("akafist-partial", 100)
        partial["sections"] = [s for s in partial["sections"]
                               if s["section_type"] != "ikos" or s["number"] != 8]
        self.assertFalse(verify_detail(partial))

    def test_preview_does_not_modify_json(self):
        before = self.old.read_bytes()
        with contextlib.redirect_stdout(io.StringIO()):
            merge(self.params(False))
        self.assertEqual(before, self.old.read_bytes())
        self.assertFalse(self.backups.exists())

    def test_apply_adds_only_new_while_preserving_old_data_and_ids(self):
        with contextlib.redirect_stdout(io.StringIO()):
            merge(self.params(True))
        result = json.loads(self.old.read_text(encoding="utf-8"))
        index = akathist_index(result)
        self.assertEqual(len(index), 2)
        self.assertEqual(result["akathists"]["by_slug"]["akafist-old"],
                         self.existing["akathists"]["by_slug"]["akafist-old"])
        self.assertNotEqual(index["akafist-new"]["id"], index["akafist-old"]["id"])
        old_section_ids = {s["id"] for s in self.existing["akathists"]["by_slug"]["akafist-old"]["sections"]}
        new_sections = result["akathists"]["by_slug"]["akafist-new"]["sections"]
        self.assertTrue(all(s["id"] not in old_section_ids for s in new_sections))
        self.assertEqual(result["texts"], self.existing["texts"])
        self.assertEqual(result["prayer_rules"], self.existing["prayer_rules"])
        self.assertEqual(result["content_version"], content_fingerprint(result))
        self.assertEqual(len(list(self.backups.glob("*.json"))), 1)

        with contextlib.redirect_stdout(io.StringIO()):
            merge(self.params(True))
        self.assertEqual(len(akathist_index(json.loads(self.old.read_text(encoding="utf-8")))), 2)
        self.assertEqual(len(list(self.backups.glob("*.json"))), 1)

    def test_report_rejects_wrong_source(self):
        self.report.write_text(json.dumps({"source": "https://example.org",
                                            "pages": {"x": {"status": "imported", "slug": "akafist-new"}}}),
                               encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "от проверенного источника"):
            merge(self.params(True))
        self.assertFalse(self.backups.exists())

    def test_checked_manifest_does_not_include_errors_or_existing(self):
        audit = self.dir / "audit.json"
        pages = {}
        for i in range(101):
            pages[str(i)] = {
                "slug": f"akafist-{i}", "status": "checked" if i % 2 == 0 else "error",
                "checks": {"kontakia": 13, "ikoses": 12}, "content_sha256": "f" * 64,
            }
        pages["100"]["status"] = "existing"
        audit.write_text(json.dumps({"source": SOURCE, "pages": pages}), encoding="utf-8")
        with contextlib.redirect_stdout(io.StringIO()):
            prepare(argparse.Namespace(audit=str(audit), output=str(self.approved)))
        approved = json.loads(self.approved.read_text(encoding="utf-8"))
        self.assertEqual(len(approved), 50)
        self.assertNotIn("akafist-100", approved)


    def repair_params(self, apply):
        return argparse.Namespace(
            existing=str(self.old), patch=str(self.dir / "repair.json"),
            backup_dir=str(self.backups), apply=apply,
        )

    def test_repair_old_first_kontakion_refrain_without_overwriting_other_texts(self):
        original = self.existing["akathists"]["by_slug"]["akafist-old"]["sections"][0]["text"]["content"]
        corrected = original + "\n\nГосподи мой, Господи, Радосте моя."
        patch = {
            "source": SOURCE,
            "changes": [{
                "slug": "akafist-old", "akathist_id": 999999,
                "sections": [{
                    "section_type": "kontakion", "number": 1,
                    "old_content": original, "old_translation": "",
                    "new_content": corrected, "new_translation": "",
                }],
            }],
        }
        (self.dir / "repair.json").write_text(
            json.dumps(patch, ensure_ascii=False), encoding="utf-8"
        )
        before = self.old.read_bytes()
        with contextlib.redirect_stdout(io.StringIO()):
            repair(self.repair_params(False))
        self.assertEqual(self.old.read_bytes(), before)
        with contextlib.redirect_stdout(io.StringIO()):
            repair(self.repair_params(True))
        result = json.loads(self.old.read_text(encoding="utf-8"))
        hymn = result["akathists"]["by_slug"]["akafist-old"]
        found = [
            row["text"]["content"] for row in hymn["sections"]
            if row["section_type"] == "kontakion" and row["number"] == 1
        ]
        self.assertTrue(all(value == corrected for value in found))
        self.assertEqual(result["texts"], self.existing["texts"])
        self.assertEqual(result["prayer_rules"], self.existing["prayer_rules"])
        self.assertEqual(result["content_version"], content_fingerprint(result))
        self.assertEqual(len(list(self.backups.glob("*.json"))), 1)

    def test_repair_rejects_manually_changed_content(self):
        patch = {"source": SOURCE, "changes": [{
            "slug": "akafist-old", "akathist_id": 12,
            "sections": [{
                "section_type": "kontakion", "number": 1,
                "old_content": "different-original", "old_translation": "",
                "new_content": "corrected", "new_translation": "",
            }],
        }]}
        (self.dir / "repair.json").write_text(json.dumps(patch), encoding="utf-8")
        before = self.old.read_bytes()
        with self.assertRaisesRegex(ValueError, "изменён вручную"):
            repair(self.repair_params(True))
        self.assertEqual(self.old.read_bytes(), before)
        self.assertFalse(self.backups.exists())


    def quarantine_params(self, apply):
        return argparse.Namespace(
            existing=str(self.old),
            report=str(self.report),
            backup_dir=str(self.backups),
            max_count=5,
            apply=apply,
        )

    def test_quarantine_imported_keeps_all_texts_and_backup(self):
        # The report targets a new item that already exists in this fixture.
        self.old.write_text(json.dumps(
            self.latest, ensure_ascii=False), encoding="utf-8")
        original = json.loads(self.old.read_text(encoding="utf-8"))
        with contextlib.redirect_stdout(io.StringIO()):
            quarantine(self.quarantine_params(False))
        self.assertEqual(json.loads(self.old.read_text(encoding="utf-8")), original)
        with contextlib.redirect_stdout(io.StringIO()):
            quarantine(self.quarantine_params(True))
        result = json.loads(self.old.read_text(encoding="utf-8"))
        old = result["akathists"]["by_slug"]["akafist-old"]
        newly_imported = result["akathists"]["by_slug"]["akafist-new"]
        self.assertEqual(old, original["akathists"]["by_slug"]["akafist-old"])
        self.assertEqual(newly_imported["translation_review_status"], "unverified")
        unmarked_copy = dict(newly_imported)
        unmarked_copy.pop("translation_review_status")
        self.assertEqual(unmarked_copy, original["akathists"]["by_slug"]["akafist-new"])
        self.assertEqual(result["texts"], original["texts"])
        self.assertEqual(result["prayer_rules"], original["prayer_rules"])
        self.assertEqual(result["content_version"], content_fingerprint(result))
        self.assertEqual(len(list(self.backups.glob("*.json"))), 1)
        already_marked = self.old.read_bytes()
        with contextlib.redirect_stdout(io.StringIO()):
            quarantine(self.quarantine_params(True))
        self.assertEqual(self.old.read_bytes(), already_marked,
                         "Repeated apply must not rewrite JSON or update timestamps")
        self.assertEqual(len(list(self.backups.glob("*.json"))), 1,
                         "Repeated apply must not generate redundant backups")

    def test_quarantine_refuses_batch_beyond_limit(self):
        self.old.write_text(json.dumps(self.latest, ensure_ascii=False), encoding="utf-8")
        payload = json.loads(self.report.read_text(encoding="utf-8"))
        payload["pages"]["different"] = {"status": "imported", "slug": "akafist-old"}
        self.report.write_text(json.dumps(payload), encoding="utf-8")
        args = self.quarantine_params(True)
        args.max_count = 1
        before = self.old.read_bytes()
        with self.assertRaisesRegex(ValueError, "above limit"):
            quarantine(args)
        self.assertEqual(self.old.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
