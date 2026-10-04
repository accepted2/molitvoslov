from django.test import SimpleTestCase

from api.azbyka_calendar_feasts import (
    DaySaintLink,
    extract_day_saint_links,
    extract_saint_content,
    find_best_source,
)


class AzbykaCalendarFeastsParserTests(SimpleTestCase):
    def test_extracts_day_saint_links_before_readings(self):
        html = """
        <html><body>
          <h1>5 октября</h1>
          <ul>
            <li><a href="/days/sv-iona">Прор. Ионы (VIII в. до Р. Х.)</a></li>
            <li><a href="https://azbyka.ru/days/sv-foka-sinopskij?from=calendar">сщмч. Фоки, епископа Синопского</a></li>
          </ul>
          <h2>Чтения Священного Писания</h2>
          <a href="/days/sv-postoronnij">Не брать</a>
        </body></html>
        """

        sources = extract_day_saint_links(html)

        self.assertEqual(len(sources), 2)
        self.assertTrue(sources[0].url.endswith("/days/sv-iona"))
        self.assertTrue(sources[1].url.endswith("/days/sv-foka-sinopskij"))

    def test_extracts_troparion_kontakion_and_life(self):
        html = """
        <html><body>
          <h1>Пророк Иона</h1>
          <h2>День памяти</h2>
          <a>5 октября</a>
          <p>Краткое житие пророка.</p>
          <p>Продолжение жития.</p>
          <h2>Жития и книги в библиотеке</h2>
          <h2>Тропари, кондаки, молитвы и величания</h2>
          <h3>Тропарь, глас 2</h3>
          <p>Текст тропаря.</p>
          <p>Перевод: перевод тропаря.</p>
          <h3>Кондак, глас 2</h3>
          <p>Текст кондака.</p>
          <p>Перевод: перевод кондака.</p>
        </body></html>
        """

        parsed = extract_saint_content(html, url="https://example.test/iona")

        self.assertEqual(parsed.title, "Пророк Иона")
        self.assertEqual(parsed.troparion_title, "Тропарь, глас 2")
        self.assertEqual(parsed.troparion_content, "Текст тропаря.")
        self.assertEqual(parsed.troparion_echo, 2)
        self.assertEqual(parsed.kontakion_content, "Текст кондака.")
        self.assertEqual(parsed.kontakion_echo, 2)
        self.assertEqual(
            parsed.life_content,
            "Краткое житие пророка.\n\nПродолжение жития.",
        )

    def test_matches_old_church_site_titles_to_azbyka(self):
        sources = [
            DaySaintLink(
                "Прор. Ионы (VIII в. до Р. Х.)",
                "https://azbyka.ru/days/sv-iona",
            ),
            DaySaintLink(
                "сщмч. Фоки, епископа Синопского (117)",
                "https://azbyka.ru/days/sv-foka-sinopskij",
            ),
        ]

        iona = find_best_source("Пророка Ионы", sources)
        foka = find_best_source(
            "священномученика Фоки, епископа Синопийскаго",
            sources,
        )

        self.assertIsNotNone(iona.source)
        self.assertTrue(iona.source.url.endswith("/sv-iona"))
        self.assertIsNotNone(foka.source)
        self.assertTrue(foka.source.url.endswith("/sv-foka-sinopskij"))

    def test_skips_ambiguous_match(self):
        sources = [
            DaySaintLink("Прор. Ионы", "https://example.test/1"),
            DaySaintLink("Пророка Ионы", "https://example.test/2"),
        ]

        result = find_best_source("Пророка Ионы", sources)

        self.assertIsNone(result.source)
        self.assertIn("неоднознач", result.reason)
