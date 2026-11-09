from itertools import count
from pathlib import Path
from tempfile import TemporaryDirectory

from django.core.management.base import CommandError
from django.test import SimpleTestCase

from api.management.commands.stage_azbyka_cs_preview import (
    build_preview_akathist,
    check_url,
    read_candidates,
)


def sample_sections():
    sections = []
    for number in range(1, 14):
        sections.append({
            "type": "kontakion", "number": number,
            "content": f"Яко преславен еси, Господи, помилуй нас, аминь {number}.",
            "translation": "", "note": "",
        })
        if number <= 12:
            sections.append({
                "type": "ikos", "number": number,
                "content": f"Радуйся, изрядное утешение наше, свет немеркнущий {number}.",
                "translation": "", "note": "",
            })
    sections.append({
        "type": "prayer", "number": 1,
        "content": "Сподоби и сохрани ны, Пресвятая Богородице.",
        "translation": "", "note": "",
    })
    return sections


def ids():
    return {
        "akathists": count(400000000),
        "sections": count(450000000),
        "texts": count(500000000),
    }


class LocalPreviewStagingTests(SimpleTestCase):
    def test_only_ready_cs_from_catalog_report(self):
        with TemporaryDirectory() as folder:
            file = Path(folder) / "catalog.csv"
            file.write_text(
                "url,slug,title,category,status,details\n"
                "https://azbyka.ru/molitvoslov/akafist-new.html,"
                "akafist-new,Акафист новый,Тест,READY_CS,OK\n"
                "https://azbyka.ru/molitvoslov/akafist-no.html,"
                "akafist-no,Акафист старый,Тест,EXISTS,slug\n"
                "https://azbyka.ru/molitvoslov/akafist-failed.html,"
                "akafist-failed,Акафист неразобранный,Тест,REVIEW,error\n",
                encoding="utf-8",
            )
            ready = read_candidates(file, max_count=0)
            self.assertEqual([r["slug"] for r in ready], ["akafist-new"])
            self.assertEqual(read_candidates(file, max_count=1), ready)

    def test_invalid_external_source_is_rejected(self):
        self.assertFalse(check_url(
            "https://example.org/molitvoslov/akafist-new.html", "akafist-new"
        ))
        self.assertFalse(check_url(
            "https://azbyka.ru/molitvoslov/akafist-new.html", "akafist-other"
        ))
        self.assertTrue(check_url(
            "https://azbyka.ru/molitvoslov/akafist-new.html", "akafist-new"
        ))
        with TemporaryDirectory() as folder:
            path = Path(folder) / "catalog.csv"
            path.write_text(
                "url,slug,title,status\n"
                "https://example.org/molitvoslov/akafist-new.html,"
                "akafist-new,Акафист новый,READY_CS\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(CommandError, "CSV"):
                read_candidates(path, max_count=0)

    def test_preview_matches_reader_sections_and_discards_ru(self):
        entry = {"slug": "akafist-new", "title": "Акафист новый"}
        common_rule = {"id": 42, "opening": {"content": "Отче наш"}, "ending": None}
        summary, detail = build_preview_akathist(
            entry,
            sample_sections(),
            {"content": "Яко благ еси", "translation": ""},
            None,
            ids(),
            common_rule,
        )
        self.assertTrue(summary["is_visible"])
        self.assertEqual(summary["id"], detail["id"])
        self.assertEqual(summary["slug"], detail["slug"])
        self.assertEqual(detail["translation_review_status"], "unverified")
        self.assertTrue(detail["local_preview"])
        self.assertEqual(detail["common_rule"], common_rule)
        self.assertIsNot(detail["common_rule"], common_rule)
        self.assertEqual(len(detail["sections"]), 28)
        self.assertEqual([
            (s["section_type"], s["number"]) for s in detail["sections"][-4:]
        ], [
            ("kontakion", 13), ("ikos", 1), ("kontakion", 1), ("prayer", 1),
        ])
        self.assertEqual(detail["sections"][1]["text"]["id"],
                         detail["sections"][-3]["text"]["id"])
        self.assertEqual(detail["sections"][0]["text"]["id"],
                         detail["sections"][-2]["text"]["id"])
        for section in detail["sections"]:
            self.assertFalse(section["text"]["translation"])
            self.assertFalse(section["text"]["translation_uk"])
            self.assertEqual(section["text"]["language"], "cu")
        self.assertEqual(detail["troparion"]["content"], "Яко благ еси")
        self.assertEqual(detail["troparion"]["translation"], "")

    def test_reject_partial_hymn(self):
        broken = [x for x in sample_sections()
                  if (x["type"], x["number"]) != ("kontakion", 13)]
        with self.assertRaisesRegex(ValueError, "Недостаточно кондаков"):
            build_preview_akathist(
                {"slug": "akafist-new", "title": "Акафист новый"},
                broken, None, None, ids(), None
            )

    def test_reject_duplicate_section(self):
        bad = sample_sections()
        bad.append(dict(bad[0]))
        with self.assertRaisesRegex(ValueError, "Повтор исходной секции"):
            build_preview_akathist(
                {"slug": "akafist-new", "title": "Акафист новый"},
                bad, None, None, ids(), None
            )
