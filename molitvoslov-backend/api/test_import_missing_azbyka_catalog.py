from django.test import SimpleTestCase

from api.management.commands.import_missing_azbyka_catalog import (
    catalogue_entries, existing_match, is_church_text,
    normalize_slug, only_church, source_only,
)


class CatalogChurchOnlyTests(SimpleTestCase):
    def test_catalogue_only_section_links_and_deduplicates(self):
        html = """
        <h1>Сборник акафистов</h1>
        <ul><li><a href="/molitvoslov/akafist-not-in-catalog.html">Меню</a></li></ul>
        <h2>Акафисты Богу</h2>
        <ol><li><a href="/molitvoslov/akafist-iisusu-sladchajshemu.html">
        Иисусу Сладчайшему</a></li></ol>
        <h2>Акафисты святым</h2>
        <ol><li><a href="/molitvoslov/akafist-new-saint.html">Святому</a></li>
        <li><a href="https://example.org/molitvoslov/akafist-other.html">Чужой</a></li></ol>
        <h2>Акафисты на каждый день седмицы</h2>
        <h4>Среда</h4>
        <ol><li><a href="/molitvoslov/akafist-iisusu-sladchajshemu.html">
        Повтор</a></li></ol>
        <h2>Комментарии</h2>
        <ol><li><a href="/molitvoslov/akafist-comment.html">Ссылка из комментария</a></li></ol>
        """
        entries = catalogue_entries(html)
        self.assertEqual(len(entries), 2)
        self.assertEqual(entries[0]["slug"], "akafist-iisusu-sladchajshemu")
        self.assertEqual(entries[1]["title"], "Акафист Святому")

    def test_existing_curated_alias_is_not_added_again(self):
        existing = [
            {"slug": "akafist-svyatitelyu-nikolayu",
             "title": "Акафист святителю Николаю Чудотворцу"}
        ]
        entry = {
            "slug": "akafist-svjatitelju-nikolaju-chudotvorcu",
            "title": "Акафист святителю Николаю, архиепископу Мир Ликийских",
        }
        self.assertEqual(existing_match(entry, existing), "curated-alias")
        self.assertEqual(existing_match(
            {"slug": "akafist-svjatitelju-nikolaju-chudotvorcu-na-cerkovnoslavjanskom-jazyke",
             "title": "Акафист Николаю на церковнославянском языке"},
            existing), "curated-alias")

    def test_exact_existing_slug_or_title_is_skipped(self):
        existing = [
            {"slug": "akafist-special", "title": "Акафист у иконы"},
        ]
        self.assertEqual(existing_match(
            {"slug": "akafist-special", "title": "Другой"},
            existing), "slug")
        self.assertEqual(existing_match(
            {"slug": "akafist-other", "title": "Акафист у иконы"},
            existing), "title")

    def test_only_church_text_is_retained(self):
        initial = [
            {"type": "kontakion", "number": 1,
             "content": "Яко благословен еси, Господи.",
             "translation": "Ведь Ты благословен, Господи."},
        ]
        sanitized = only_church(initial)
        self.assertEqual(sanitized[0]["translation"], "")
        self.assertEqual(sanitized[0]["content"], initial[0]["content"])
        self.assertEqual(initial[0]["translation"], "Ведь Ты благословен, Господи.")
        preface = source_only({
            "content": "Яко еси благ.",
            "translation": "Потому что Ты добр."
        })
        self.assertEqual(preface["translation"], "")

    def test_language_guard_fails_closed(self):
        section = {"type": "kontakion", "content": "Яко еси ты благ, "
                   "мя не остави; сподоби и избави, помилуй, "
                   "яко тя возлюбих, аще согреших, присно воспою."}
        self.assertTrue(is_church_text([section]))
        self.assertFalse(is_church_text([
            {"type": "kontakion",
             "content": "Я благодарю тебя, Господи, за поддержку и любовь."}
        ]))

    def test_path_rules_avoid_unrelated_pages(self):
        self.assertEqual(normalize_slug(
            "https://azbyka.ru/molitvoslov/akafist-iisusu-sladchajshemu.html"
        ), "akafist-iisusu-sladchajshemu")
        self.assertEqual(normalize_slug(
            "https://azbyka.ru/molitvoslov/kanon-1.html"
        ), "")
