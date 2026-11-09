"""Tests for eliminating source lectionary markers, without rewriting Scripture."""
import copy
import json
import unittest
from pathlib import Path

from build_csl_ponomar_bible import parse_source
from clean_offline_csl_lectionary import clean_bundle, digest
from csl_lectionary_markers import strip_lectionary_annotations

ROOT = Path(__file__).resolve().parent.parent


class LectionaryCleanupTest(unittest.TestCase):
    def test_mark_1_1_preserves_real_first_words(self):
        original = "**(Зача́ло 1)** Зача́ло є҆ѵⷢ҇лїа і҆и҃са хрⷭ҇та̀, сн҃а бж҃їѧ"
        result, removed = strip_lectionary_annotations(original)
        self.assertEqual(removed, 1)
        self.assertEqual(result, "Зача́ло є҆ѵⷢ҇лїа і҆и҃са хрⷭ҇та̀, сн҃а бж҃їѧ")
        self.assertFalse("**" in result)

    def test_shortened_titlo_marker_in_middle_of_verse(self):
        text = "И҆ бы́сть во гра́дѣ: **(Заⷱ҇ 21)** и҆ по не́мъ и҆дѧ́хꙋ."
        result, removed = strip_lectionary_annotations(text)
        self.assertEqual(removed, 1)
        self.assertEqual(result, "И҆ бы́сть во гра́дѣ: и҆ по не́мъ и҆дѧ́хꙋ.")

    def test_literal_verse_parentheses_and_other_markdown_stay(self):
        text = "Абрама (тогѡ̀) брата, **(не зачало)** въ морѐ."
        self.assertEqual(strip_lectionary_annotations(text), (text, 0))
        for text in ("Зача́ло є҆ѵⷢ҇лїа", "Въ нача́лѣ бѣ̀ Сло́во."):
            self.assertEqual(strip_lectionary_annotations(text), (text, 0))

    def test_generators_omit_annotations_at_import(self):
        source = (
            "#1\n"
            "1| **(Зача́ло 1)** Зача́ло є҆ѵⷢ҇лїа і҆и҃са хрⷭ҇та̀.\n"
            "2| Писано̀ бо: **(Заⷱ҇ 2)** и҆ посыла́ю.\n"
        )
        chapters, ignored = parse_source(source, "MRK")
        self.assertEqual(ignored["other_lines"], [])
        self.assertEqual(chapters[0]["verses"][0]["text"], "Зача́ло є҆ѵⷢ҇лїа і҆и҃са хрⷭ҇та̀.")
        self.assertEqual(chapters[0]["verses"][1]["text"], "Писано̀ бо: и҆ посыла́ю.")

    def test_bundled_csl_bible_is_cleanable_without_changing_ids(self):
        bundle = ROOT / "src/data/offlineBibleCslTraditional.json"
        self.assertTrue(bundle.exists())
        data = json.loads(bundle.read_text(encoding="utf-8-sig"))
        self.assertEqual(len(data["books"]), 77)
        before_ids = [
            (b["id"], ch["id"], v["id"])
            for b in data["books"] for ch in b["chapters"] for v in ch["verses"]
        ]
        old = copy.deepcopy(data)
        report = clean_bundle(data)
        self.assertGreater(report["verses_scanned"], 36000)
        self.assertGreater(report["markers_removed"], 100)
        mark = next(b for b in data["books"] if b["code"] == "MRK")
        self.assertTrue(mark["chapters"][0]["verses"][0]["text"].startswith("Зача́ло"))
        self.assertFalse(mark["chapters"][0]["verses"][0]["text"].startswith("**"))
        self.assertEqual(
            before_ids,
            [(b["id"], ch["id"], v["id"])
             for b in data["books"] for ch in b["chapters"] for v in ch["verses"]],
        )
        original = next(b for b in old["books"] if b["code"] == "MRK")
        self.assertNotEqual(
            original["chapters"][0]["verses"][0]["text"],
            mark["chapters"][0]["verses"][0]["text"],
        )
        self.assertEqual(data["translation"], old["translation"])
        self.assertEqual(digest(data), digest(data))
        self.assertEqual(clean_bundle(data)["markers_removed"], 0)


if __name__ == "__main__":
    unittest.main()
