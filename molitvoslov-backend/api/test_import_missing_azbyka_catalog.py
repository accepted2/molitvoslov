import json
from pathlib import Path
from tempfile import TemporaryDirectory

from django.core.management.base import CommandError
from django.test import SimpleTestCase

from api.management.commands.import_missing_azbyka_catalog import (
    Command, catalogue_entries, existing_match, is_church_text, load_offline_inventory, load_previous_report,
    normalize_slug, only_church, source_only,
)


class CatalogChurchOnlyTests(SimpleTestCase):
    def test_write_disabled_until_bundled_app_content_is_checked(self):
        # This must fail before downloading or querying Django.
        with self.assertRaisesRegex(CommandError, "offlineContent.json"):
            Command().handle(write=True)

    def test_offline_inventory_includes_every_published_and_hidden_akathist(self):
        # The user's actual local APK has 20, including five absent from Supabase.
        with TemporaryDirectory() as folder:
            path = Path(folder) / "offlineContent.json"
            extra = [
                "akafist-premudrosti-slova-bozhija",
                "akafist-slava-bogu-za-vsyo",
                "akafist-svjatomu-duhu",
                "akafist-v-chest-sretenija-presvjatyja-vladychicy-nasheja-bogorodicy-s-pravednoju-elisavetoju-v-gornem-grade-iudove",
                "akafist-vsemogushhemu-bogu-v-nashestvii-pechali",
            ]
            listed = [
                {"slug": f"akafist-other-{i}", "title": f"Акафист прочий {i}", "is_visible": True}
                for i in range(15)
            ] + [
                {"slug": slug, "title": f"Акафист уже существующий {i}", "is_visible": True}
                for i, slug in enumerate(extra)
            ]
            payload = {
                "akathists": {
                    "list": listed,
                    "by_slug": {row["slug"]: {"title": row["title"]} for row in listed},
                }
            }
            path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
            entries, published = load_offline_inventory(path)
            self.assertEqual(len(entries), 20)
            self.assertEqual(published, 20)
            for slug in extra:
                self.assertTrue(existing_match({"slug": slug, "title": "Другое имя"}, entries))
            self.assertTrue(existing_match({
                "slug": "akafist-svjatomu-duhu", "title": "Новый заголовок"
            }, entries))
            self.assertFalse(existing_match({
                "slug": "akafist-completely-new", "title": "Акафист ещё не добавленный"
            }, entries))

    def test_offline_inventory_must_be_provided_and_well_formed(self):
        with self.assertRaisesRegex(CommandError, "--offline-file"):
            load_offline_inventory(None)
        with TemporaryDirectory() as folder:
            path = Path(folder) / "offlineContent.json"
            path.write_text('{"akathists":{"list":[],"by_slug":{}}}', encoding="utf-8")
            with self.assertRaisesRegex(CommandError, "неполный"):
                load_offline_inventory(path)

    def test_resume_report_reuses_prior_checks(self):
        with TemporaryDirectory() as folder:
            report = Path(folder) / "catalog_cs_report.csv"
            report.write_text(
                "url,slug,title,category,status,details\\n"
                "https://azbyka.ru/molitvoslov/akafist-new.html,akafist-new,"
                "New,Feasts,READY_CS,13 kontakia\\n"
                "https://azbyka.ru/molitvoslov/akafist-bad.html,akafist-bad,"
                "Bad,Feasts,REVIEW,parse failed\\n",
                encoding="utf-8",
            )
            previous = load_previous_report(report)
            self.assertEqual(len(previous), 2)
            self.assertEqual(
                previous["https://azbyka.ru/molitvoslov/akafist-new.html"]["status"],
                "READY_CS",
            )
            self.assertEqual(
                previous["https://azbyka.ru/molitvoslov/akafist-bad.html"]["status"],
                "REVIEW",
            )

    def test_corrupt_resume_report_fails_safely(self):
        with TemporaryDirectory() as folder:
            report = Path(folder) / "catalog_cs_report.csv"
            report.write_text("one,two\\na,b\\n", encoding="utf-8")
            with self.assertRaisesRegex(CommandError, "CSV"):
                load_previous_report(report)

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
