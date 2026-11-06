"""Независимые от БД проверки синтаксиса чтений и деления сообщений."""
from django.test import SimpleTestCase

from api.telegram_daily import (
    ScriptureReferenceError, VerseRange, parse_reference, split_telegram_text,
)


class TelegramDailyParsingTests(SimpleTestCase):
    def test_single_passage(self):
        self.assertEqual(
            parse_reference("Лк.10:1–15"),
            ("LUK", [VerseRange(10, 1, 10, 15)]),
        )

    def test_discontinuous_passage_across_chapters(self):
        self.assertEqual(
            parse_reference("Мф.10:32–33,37–38,19:27–30"),
            (
                "MAT",
                [
                    VerseRange(10, 32, 10, 33),
                    VerseRange(10, 37, 10, 38),
                    VerseRange(19, 27, 19, 30),
                ],
            ),
        )

    def test_cross_chapter_range(self):
        self.assertEqual(
            parse_reference("Евр.11:33–12:2"),
            ("HEB", [VerseRange(11, 33, 12, 2)]),
        )

    def test_lectionary_suffix(self):
        self.assertEqual(
            parse_reference("1Кор.1:1–9 (зач. 122)"),
            ("1CO", [VerseRange(1, 1, 1, 9)]),
        )
        self.assertEqual(
            parse_reference("Мф.10:32–33,19:27–30 (38 зач. от полу́)"),
            ("MAT", [VerseRange(10, 32, 10, 33), VerseRange(19, 27, 19, 30)]),
        )

    def test_unrecognized_reference_is_not_hallucinated(self):
        with self.assertRaises(ScriptureReferenceError):
            parse_reference("Неизвестная. 5:1–7")

    def test_text_split_keeps_content(self):
        text = "Первый стих\n" * 600
        parts = split_telegram_text(text)
        self.assertTrue(parts)
        self.assertTrue(all(len(part) <= 3900 for part in parts))
        self.assertEqual("\n".join(parts).replace("\n", ""), text.replace("\n", ""))

    def test_long_line(self):
        parts = split_telegram_text("А" * 9000)
        self.assertEqual("".join(parts), "А" * 9000)
        self.assertTrue(all(len(part) <= 3900 for part in parts))
