"""No-network tests for source-driven feast matching and display precedence."""
import unittest

from api.calendar_source_matching import match, assignment, normalize_title
from api.management.commands.generate_calendar_from_source import (
    index_source, rank_title,
)


class SourceMatchingTests(unittest.TestCase):
    def test_order_independent_matching(self):
        result = match(
            ["мч. Георгий", "прп. Серафим"],
            ["прп. Серафим", "мч. Георгий"],
        )
        self.assertEqual({(i, j) for i, j, _ in result}, {(0, 1), (1, 0)})

    def test_does_not_merge_same_saint_different_observances(self):
        result = match(
            ["Преподобная Мария Египетская", "Неделя 5-я Великого поста. Мария Египетская"],
            ["Неделя 5-я Великого поста. Мария Египетская", "Преподобная Мария Египетская"],
        )
        self.assertEqual({(i, j) for i, j, _ in result}, {(0, 1), (1, 0)})

    def test_rectangular_matching(self):
        self.assertEqual(len(assignment([[100, 50, 0]])), 1)
        self.assertEqual(len(assignment([[100], [90], [0]])), 1)

    def test_accents(self):
        self.assertEqual(normalize_title("Серафи́м (1903)"), "серафим")

    def test_pascha_outweighs_saint(self):
        self.assertGreater(rank_title("Светлое Христово Воскресение"),
                           rank_title("Преподобный старец"))

    def test_pre_and_afterfeast_not_same_rank_as_twelve(self):
        self.assertGreater(rank_title("Сретение Господне"),
                           rank_title("Отдание Сретения Господня"))

    def test_exact_year_source_moves_feast_without_offset_formula(self):
        from datetime import date
        url = "https://azbyka.ru/days/sv-test"
        reference = [(date(2026, 6, 7), [
            {"id": 7, "title": "Собор тестовых святых", "short_title": ""}
        ])]
        ref_pages = {"2026-06-07": [
            {"url": url, "title": "Собор тестовых святых"}
        ]}
        target_pages = {"2028-06-11": [
            {"url": url, "title": "Собор тестовых святых"}
        ]}
        result, warnings, unmatched = index_source(
            reference, ref_pages, target_pages
        )
        self.assertEqual(result["2028-06-11"][0]["local_id"], 7)
        self.assertEqual(unmatched, 0)
        self.assertEqual(warnings, [])


if __name__ == "__main__":
    unittest.main()
