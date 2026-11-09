import json
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile

from django.test import SimpleTestCase

from api.management.commands.audit_akathist_epubs import (
    inspect_book,
    load_manifest,
    read_book_html,
)


class AkathistEpubAuditTests(SimpleTestCase):
    """The audit must never need database access."""

    def _make_epub(self, folder, filename="akafist-test.epub", valid=True):
        book = Path(folder) / filename
        with ZipFile(book, "w") as archive:
            if not valid:
                archive.writestr("OEBPS/Book.html", "<html><body>No headings</body></html>")
                return book
            sections = []
            for number in range(1, 14):
                sections.append(f"<p><strong>Кондак {number}</strong></p>")
                sections.append(
                    f"<p>Приими молитву нашу, Господи, и сохрани нас. Аминь {number}.</p>"
                )
                if number < 13:
                    sections.append(f"<p>Икос {number}</p>")
                    sections.append(
                        f"<p>Радуйся, святый заступниче, моли Бога о нас. Аминь {number}.</p>"
                    )
            html = "<html><body><article>" + "".join(sections) + "</article></body></html>"
            archive.writestr("OEBPS/Book.html", html.encode("utf-8"))
        return book

    def test_plain_paragraph_headers_are_previewed_but_not_written(self):
        with TemporaryDirectory() as tmp:
            book = self._make_epub(tmp)
            row, detail = inspect_book(
                book, {"title": "Акафист тестовый", "url": "https://example.org/source"}
            )
            self.assertEqual(row["status"], "parsed_review_required", row["error"])
            self.assertEqual((row["kontakions"], row["ikoses"]), (13, 12))
            self.assertEqual(row["promoted_headings"], 25)
            self.assertEqual(row["source_url"], "https://example.org/source")
            self.assertEqual(len(detail["sections"]), 25)
            self.assertEqual(detail["sections"][0]["type"], "kontakion")
            self.assertEqual(detail["sections"][-1]["number"], 13)
            self.assertTrue(book.exists())

    def test_invalid_book_is_reported_without_import(self):
        with TemporaryDirectory() as tmp:
            book = self._make_epub(tmp, valid=False)
            row, detail = inspect_book(book, {})
            self.assertEqual(row["status"], "review")
            self.assertTrue(row["error"])
            self.assertEqual(detail["sections"], [])

    def test_manifest_tracks_source_file_not_epub_count(self):
        with TemporaryDirectory() as tmp:
            folder = Path(tmp)
            manifest = {"pages": {
                "https://azbyka.ru/first": {
                    "status": "downloaded",
                    "file": "files/akathists/akafist-test.epub",
                    "title": "Первый акафист",
                },
                "https://azbyka.ru/second": {"status": "no_epub"},
            }}
            (folder / "download_manifest.json").write_text(
                json.dumps(manifest, ensure_ascii=False), encoding="utf-8"
            )
            mapping, error = load_manifest(folder)
            self.assertFalse(error)
            self.assertEqual(len(mapping), 1)
            self.assertIn("akafist-test.epub", mapping)

    def test_book_html_is_read_in_memory_only(self):
        with TemporaryDirectory() as tmp:
            book = self._make_epub(tmp)
            soup, name = read_book_html(book)
            self.assertEqual(name, "OEBPS/Book.html")
            self.assertIn("Кондак 13", soup.get_text(" ", strip=True))
            self.assertEqual(sorted(Path(tmp).iterdir()), [book])
