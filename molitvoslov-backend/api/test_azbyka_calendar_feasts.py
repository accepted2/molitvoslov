from django.test import SimpleTestCase

from api.azbyka_calendar_feasts import (
    DaySaintLink,
    extract_day_hymn_groups,
    extract_day_saint_links,
    extract_saint_content,
    find_best_hymn_group,
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

    def test_extracts_all_day_commemoration_types(self):
        html = """
        <html><body>
          <h1>6 октября</h1>
          <ul>
            <li><a href="/days/prazdnik-zachatie-ioanna">Зачатие Иоанна Предтечи</a></li>
            <li><a href="/days/sv-innokentij">свт. Иннокентия</a></li>
            <li><a href="/days/svv-ksanfippa-i-polikseniya">Прпп. жен Ксанфиппы и Поликсении</a></li>
            <li><a href="/days/sv-raisa">мц. Раисы</a></li>
            <li><a href="/days/svv-andrej-ioann-petr-antonin">мчч. Андрея, Иоанна, Петра и Антонина</a></li>
            <li><a href="/days/sv-ioann-pankratovich">Сщмч. Иоанна Панкратовича</a></li>
            <li>Иконы Божией Матери: <a href="/days/ikona-slovenskaja">Словенская (1635)</a></li>
          </ul>
          <h2>Чтения Священного Писания</h2>
        </body></html>
        """

        sources = extract_day_saint_links(html)

        self.assertEqual(len(sources), 7)
        self.assertIn("/days/prazdnik-zachatie-ioanna", sources[0].url)
        self.assertIn("/days/svv-ksanfippa-i-polikseniya", sources[2].url)
        self.assertIn("/days/svv-andrej-ioann-petr-antonin", sources[4].url)
        self.assertIn("/days/ikona-slovenskaja", sources[6].url)
        self.assertEqual(
            sources[6].title,
            "Иконы Божией Матери: Словенская (1635)",
        )

    def test_extracts_history_for_feast_page(self):
        html = """
        <html><body>
          <h1>Зачатие Иоанна Предтечи</h1>
          <h2>Даты</h2>
          <p>6 октября</p>
          <h2>Историческое содержание</h2>
          <p>История праздника.</p>
          <p>Продолжение.</p>
          <h2>Богослужения</h2>
          <h3>Тропарь, глас 4</h3>
          <p>Текст тропаря.</p>
          <h3>Кондак, глас 1</h3>
          <p>Текст кондака.</p>
        </body></html>
        """

        parsed = extract_saint_content(html)

        self.assertEqual(
            parsed.life_title,
            "История: Зачатие Иоанна Предтечи",
        )
        self.assertEqual(
            parsed.life_content,
            "История праздника.\n\nПродолжение.",
        )
        self.assertEqual(parsed.troparion_echo, 4)
        self.assertEqual(parsed.kontakion_echo, 1)

    def test_extracts_primary_icon_source_url(self):
        html = """
        <html><body>
          <img src="https://mc.yandex.ru/watch/example.gif" alt="">
          <a href="/days/cache/200x160/storage/images/icons-of-saints/6030/fekla.jpg">
            <img src="/days/cache/200x160/storage/images/icons-of-saints/6030/fekla.jpg"
                 alt="Фекла Иконийская">
          </a>
          <h1>Равноапостольная Фекла Иконийская</h1>
          <h2>День памяти</h2>
          <p>Краткое житие.</p>
        </body></html>
        """

        parsed = extract_saint_content(
            html,
            url="https://azbyka.ru/days/sv-fekla-ikonijskaja",
        )

        self.assertEqual(
            parsed.icon_source_url,
            "https://azbyka.ru/days/cache/200x160/storage/images/"
            "icons-of-saints/6030/fekla.jpg",
        )

    def test_icon_parser_ignores_non_storage_images(self):
        html = """
        <html><body>
          <img src="/assets/logo.png" alt="logo">
          <h1>Святой без иконы</h1>
          <h2>День памяти</h2>
          <p>Краткое житие.</p>
        </body></html>
        """

        parsed = extract_saint_content(html)

        self.assertEqual(parsed.icon_source_url, "")

    def test_extracts_hymns_from_day_group(self):
        html = """
        <html><body>
          <h2>Тропари, кондаки, молитвы и величания</h2>
          <h2>Священномученику Фоке Синопскому</h2>
          <h3>Тропарь, глас 4</h3>
          <p>Текст тропаря Фоке.</p>
          <h3>И кондак, глас 6</h3>
          <p>Текст кондака Фоке.</p>
          <h2>Пророку Ионе</h2>
          <h3>Тропарь, глас 2</h3>
          <p>Текст тропаря Ионе.</p>
        </body></html>
        """

        groups = extract_day_hymn_groups(html)

        self.assertEqual(len(groups), 2)
        self.assertEqual(groups[0].troparion_echo, 4)
        self.assertEqual(groups[0].kontakion_echo, 6)
        self.assertEqual(groups[0].kontakion_title, "И кондак, глас 6")
        self.assertEqual(groups[0].kontakion_content, "Текст кондака Фоке.")

        group, match = find_best_hymn_group(
            "сщмч. Фоки, епископа Синопского",
            groups,
        )
        self.assertIsNotNone(group)
        self.assertEqual(group.kontakion_content, "Текст кондака Фоке.")
        self.assertGreaterEqual(match.score, 0.62)

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

    def test_preserves_word_split_by_inline_accent_markup(self):
        html = """
        <html><body>
          <h1>5 октября</h1>
          <ul>
            <li><a href="/days/sv-foka-sinopskij">сщмч. Ф<span>о́</span>ки, епископа Синопского</a></li>
          </ul>
          <h2>Чтения Священного Писания</h2>
        </body></html>
        """

        sources = extract_day_saint_links(html)

        self.assertEqual(
            sources[0].title,
            "сщмч. Фо́ки, епископа Синопского",
        )

    def test_preserves_inline_markup_inside_hymn_words(self):
        html = """
        <html><body>
          <h1>Пророк Иона</h1>
          <h2>День памяти</h2>
          <p>Краткое житие.</p>
          <h2>Тропари, кондаки, молитвы и величания</h2>
          <h3>Тропарь, глас 2</h3>
          <p>Прор<span>о́</span>ка Твоего память.</p>
        </body></html>
        """

        parsed = extract_saint_content(html)

        self.assertEqual(
            parsed.troparion_content,
            "Проро́ка Твоего память.",
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

    def test_does_not_match_reverend_iona_to_prophet_iona(self):
        sources = [
            DaySaintLink(
                "Прор. Ионы (VIII в. до Р. Х.)",
                "https://azbyka.ru/days/sv-iona",
            ),
            DaySaintLink(
                "прп. Ионы, пресвитера (IX), отца святых Феофана, "
                "творца канонов, и Феодора Начертанных",
                "https://azbyka.ru/days/sv-iona-presviter",
            ),
        ]

        result = find_best_source(
            "преподобного Ионы пресвитера",
            sources,
        )

        self.assertIsNotNone(result.source)
        self.assertTrue(result.source.url.endswith("/sv-iona-presviter"))
        self.assertGreaterEqual(result.score, 0.90)

    def test_rank_mismatch_scores_zero(self):
        sources = [
            DaySaintLink(
                "Прор. Ионы (VIII в. до Р. Х.)",
                "https://azbyka.ru/days/sv-iona",
            ),
        ]

        result = find_best_source(
            "преподобного Ионы пресвитера",
            sources,
        )

        self.assertIsNone(result.source)
        self.assertEqual(result.score, 0.0)

    def test_skips_ambiguous_match(self):
        sources = [
            DaySaintLink("Прор. Ионы", "https://example.test/1"),
            DaySaintLink("Пророка Ионы", "https://example.test/2"),
        ]

        result = find_best_source("Пророка Ионы", sources)

        self.assertIsNone(result.source)
        self.assertIn("неоднознач", result.reason)
