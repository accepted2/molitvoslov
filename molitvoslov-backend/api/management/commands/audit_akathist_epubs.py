"""Read-only EPUB preflight for Azbyka akathists.

Run:
    python manage.py audit_akathist_epubs
    python manage.py audit_akathist_epubs --directory files/akathists --limit 5

Produces a CSV summary and a JSON file with section previews and diagnostics.
It does not call save_akathist(), perform ORM writes, or access the network.
"""
import csv
import json
import re
import unicodedata
import zipfile
from collections import Counter
from pathlib import Path

from bs4 import BeautifulSoup
from django.core.management.base import BaseCommand, CommandError

from api.management.commands.import_akathist import Command as HtmlAkathistImporter


MAX_HTML_BYTES = 12 * 1024 * 1024
NUMBERED_HEADING = re.compile(
    r"^\s*(кондакъ?|икосъ?)\s*[.:]?\s*(?:№\s*)?(\d{1,2})\s*[.:]?\s*$",
    re.IGNORECASE,
)
LIKELY_SECTION = re.compile(
    r"(?:кондак|кондaк|конда|ікос|икос|їкос|икосъ|молитва)",
    re.IGNORECASE,
)
CANDIDATE_TAGS = ("h1", "h2", "h3", "h4", "h5", "h6", "p")


def fold(text):
    value = unicodedata.normalize("NFD", str(text or ""))
    return "".join(ch for ch in value if unicodedata.category(ch) != "Mn").lower()


def load_manifest(folder):
    path = folder / "download_manifest.json"
    if not path.exists():
        return {}, "Manifest not present"

    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
        pages = data.get("pages", {})
        if not isinstance(pages, dict):
            return {}, "Manifest 'pages' is not an object"
    except (OSError, ValueError, TypeError) as exc:
        return {}, f"Manifest unreadable: {exc}"

    by_filename = {}
    for url, record in pages.items():
        if not isinstance(record, dict) or record.get("status") != "downloaded":
            continue
        name = Path(str(record.get("file") or "")).name
        if name:
            by_filename[name.lower()] = {
                "url": str(record.get("page_url") or url),
                "title": str(record.get("title") or "").strip(),
            }
    return by_filename, ""


def read_book_html(filename):
    """Only read the EPUB's main HTML file; never extract archive paths."""
    with zipfile.ZipFile(filename) as archive:
        bad = archive.testzip()
        if bad:
            raise ValueError(f"Corrupted EPUB member: {bad}")
        names = [name for name in archive.namelist()
                 if name.lower().endswith(("book.html", "book.xhtml"))]
        if len(names) != 1:
            raise ValueError(f"Expected one Book.html, found {len(names)}")
        member = archive.getinfo(names[0])
        if member.file_size > MAX_HTML_BYTES:
            raise ValueError("Book.html exceeds 12 MiB safety limit")
        raw = archive.read(member)
        soup = BeautifulSoup(raw, "html.parser")
        # A broken EPUB must not silently become an empty akathist.
        if len(soup.get_text(" ", strip=True)) < 300:
            raise ValueError("Book.html is too short")
        return soup, names[0]


def heading_diagnostics(soup, importer):
    items = []
    seen_tags = set()
    for tag in soup.find_all(CANDIDATE_TAGS):
        raw = tag.get_text(" ", strip=True)
        if len(raw) > 110 or not raw:
            continue
        collapsed = " ".join(fold(raw).split())
        if not LIKELY_SECTION.search(collapsed):
            continue
        key = (tag.name, raw[:110])
        if key in seen_tags:
            continue
        seen_tags.add(key)
        found = NUMBERED_HEADING.fullmatch(collapsed)
        # Count unique headings separately from raw text word occurrences.
        items.append({
            "tag": tag.name,
            "text": raw[:110],
            "numbered": found.group(1).lower() + " " + found.group(2) if found else "",
            "parser_recognized": bool(importer.parse_section_heading(raw)),
        })
    return items


def upgrade_plain_paragraph_headings(soup, importer):
    """Promote stand-alone <p> headers in an in-memory copy only.

    The existing HTML parser expects h2..h6; EPUB producers sometimes
    use plain <p> tags for all 25 numbered sections. Never promote a
    paragraph that also contains actual prayer body text.
    """
    promoted = 0
    for paragraph in list(soup.find_all("p")):
        if paragraph.find_parent(("h1", "h2", "h3", "h4", "h5", "h6")):
            continue
        title = paragraph.get_text(" ", strip=True)
        if len(title) > 90 or not importer.parse_section_heading(title):
            continue
        paragraph.name = "h3"
        promoted += 1
    return promoted


def inspect_book(book, manifest_entry):
    importer = HtmlAkathistImporter()
    importer.check_only = True
    row = {
        "file": book.name,
        "manifest": bool(manifest_entry),
        "source_url": manifest_entry.get("url", ""),
        "title": manifest_entry.get("title", "") or book.stem.replace("-", " "),
        "status": "review",
        "recognized_headings": 0,
        "promoted_headings": 0,
        "kontakions": 0,
        "ikoses": 0,
        "prayers": 0,
        "with_russian_translation": 0,
        "error": "",
    }
    detail = {"file": book.name, "source_url": row["source_url"],
              "book_member": "", "headings": [], "sections": []}

    try:
        soup, member_name = read_book_html(book)
        detail["book_member"] = member_name
        detail["headings"] = heading_diagnostics(soup, importer)
        row["recognized_headings"] = sum(
            x["parser_recognized"] for x in detail["headings"]
        )

        # A new BeautifulSoup object is unnecessary: diagnostics above do
        # not modify HTML; only these in-memory paragraph tags are promoted.
        row["promoted_headings"] = upgrade_plain_paragraph_headings(soup, importer)
        root = importer.find_best_root(soup)
        sections = importer.normalize_sections(importer.parse_sections(root))
        importer.validate_sections(sections)

        row["kontakions"] = sum(x["type"] == "kontakion" for x in sections)
        row["ikoses"] = sum(x["type"] == "ikos" for x in sections)
        row["prayers"] = sum(x["type"] == "prayer" for x in sections)
        row["with_russian_translation"] = sum(bool(x.get("translation")) for x in sections)
        row["status"] = "parsed_review_required"
        detail["sections"] = [{
            "type": x["type"], "number": x["number"],
            "characters": len(x.get("content") or ""),
            "translation_characters": len(x.get("translation") or ""),
            "opening": (x.get("content") or "")[:180],
            "ending": (x.get("content") or "")[-100:],
        } for x in sections]
    except (ValueError, zipfile.BadZipFile, CommandError, OSError, UnicodeError) as exc:
        row["error"] = str(exc)[:400]
    except Exception as exc:
        # Report unexpected parser cases without mutating source EPUBs.
        row["error"] = f"{type(exc).__name__}: {exc}"[:400]

    return row, detail


class Command(BaseCommand):
    help = "Read-only EPUB audit using the existing Azbyka akathist parser."

    def add_arguments(self, parser):
        parser.add_argument("--directory", default="files/akathists")
        parser.add_argument("--limit", type=int, default=0)
        parser.add_argument("--output", help="CSV output path; JSON uses same stem")

    def handle(self, *args, **options):
        folder = Path(options["directory"])
        if not folder.is_dir():
            raise CommandError(f"EPUB directory not found: {folder}")

        books = sorted(folder.glob("*.epub"))
        if options["limit"] < 0:
            raise CommandError("--limit must not be negative")
        if options["limit"]:
            books = books[:options["limit"]]
        if not books:
            raise CommandError(f"No EPUB books in {folder}")

        manifest, manifest_error = load_manifest(folder)
        rows, details = [], []
        for book in books:
            row, detail = inspect_book(book, manifest.get(book.name.lower(), {}))
            rows.append(row)
            details.append(detail)
            label = self.style.SUCCESS if row["status"] == "parsed_review_required" else self.style.WARNING
            self.stdout.write(label(
                f'{book.name}: {row["status"]}, '
                f'K={row["kontakions"]}, I={row["ikoses"]}, '
                f'P={row["prayers"]}; {row["error"]}'
            ))

        csv_path = Path(options["output"] or folder / "epub_import_readiness.csv")
        csv_path.parent.mkdir(parents=True, exist_ok=True)
        json_path = csv_path.with_suffix(".json")
        with csv_path.open("w", newline="", encoding="utf-8-sig") as stream:
            writer = csv.DictWriter(stream, fieldnames=rows[0].keys())
            writer.writeheader()
            writer.writerows(rows)
        json_path.write_text(json.dumps({
            "mode": "READ_ONLY_PREVIEW",
            "no_database_writes": True,
            "manifest_error": manifest_error,
            "summary": {
                "books": len(books),
                "parsed_review_required": sum(
                    row["status"] == "parsed_review_required" for row in rows),
                "needs_parser_work": sum(
                    row["status"] != "parsed_review_required" for row in rows),
                "not_in_manifest": [row["file"] for row in rows if not row["manifest"]],
                "manifest_downloaded": len(manifest),
            },
            "books": details,
        }, ensure_ascii=False, indent=2), encoding="utf-8")
        self.stdout.write(f"CSV: {csv_path}\nJSON: {json_path}")
        self.stdout.write("READ-ONLY: existing EPUBs, Django models and database unchanged.")
