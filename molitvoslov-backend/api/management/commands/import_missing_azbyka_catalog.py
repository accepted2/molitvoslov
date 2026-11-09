"""Add NEW Church Slavonic akathists from the Azbyka catalogue.

This command intentionally never rewrites existing Akathist or Text records.
Default mode is preview only; --write must be supplied for database inserts.
It uses the existing HTML akathist parser, without downloading EPUB files.
"""
import csv
import re
import time
import unicodedata
from pathlib import Path
from urllib.parse import urljoin, urlsplit, urlunsplit

import requests
from bs4 import BeautifulSoup
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from api.akathist_curated import CURATED_AKATHISTS, normalize_akathist_title
from api.management.commands.import_akathist import Command as ExistingAkathistParser
from api.models import Akathist

CATALOG_URL = "https://azbyka.ru/molitvoslov/akafisty-v-pravoslavnom-kalendare.html"
HEADERS = {"User-Agent": "MolitvoslovContentImport/1.0 (readable HTML; one request at a time)"}
SECTION_RE = re.compile(r"^акафисты(?:\s|$)", re.IGNORECASE)
CHURCH_WORDS = re.compile(
    r"\b(?:яко|аще|еси|вопием|возопием|мя|тя|ти|несть|имущ[а-я]*|"
    r"сый|богородице|владычице|присно|сподоби|согрешени[а-я]*|"
    r"избави|помилуй)\b", re.IGNORECASE
)


def normalize_slug(url):
    url_parts = urlsplit(url)
    slug = Path(url_parts.path.rstrip("/")).stem.lower()
    return slug if re.fullmatch(r"akafist-[a-z0-9-]+", slug) else ""


def catalogue_entries(html):
    """Read only article lists under h2 headings 'Акафисты ...'."""
    soup = BeautifulSoup(html, "html.parser")
    output = {}
    for listing in soup.find_all(("ol", "ul")):
        section = listing.find_previous("h2")
        if section is None or not SECTION_RE.match(section.get_text(" ", strip=True)):
            continue
        category = section.get_text(" ", strip=True)
        for item in listing.find_all("li", recursive=False):
            anchor = item.find("a", href=True)
            if not anchor:
                continue
            url = urljoin(CATALOG_URL, anchor["href"])
            parts = urlsplit(url)
            if parts.hostname not in {"azbyka.ru", "www.azbyka.ru"}:
                continue
            url = urlunsplit(("https", "azbyka.ru", parts.path.rstrip("/"), "", ""))
            slug = normalize_slug(url)
            if not slug or not parts.path.startswith("/molitvoslov/"):
                continue
            title = anchor.get_text(" ", strip=True)
            if not title:
                continue
            output.setdefault(url, {
                "url": url, "slug": slug,
                "title": title if title.lower().startswith("акафист") else "Акафист " + title,
                "category": category,
            })
    return list(output.values())


def fold(value):
    value = unicodedata.normalize("NFD", str(value or ""))
    return "".join(char for char in value if unicodedata.category(char) != "Mn")


def existing_match(entry, existing):
    slug = entry["slug"]
    title = normalize_akathist_title(entry["title"])
    original_slug = re.sub(r"-na-cerkovnoslavjanskom-jazyke$", "", slug)
    # Curated alternatives have differing spellings/transliterations.
    for known in CURATED_AKATHISTS:
        if (slug in known["slugs"] or original_slug in known["slugs"]) and any(
            item["slug"] in known["slugs"] for item in existing
        ):
            return "curated-alias"
    for item in existing:
        if slug == item["slug"] or original_slug == item["slug"]:
            return "slug"
        if title == normalize_akathist_title(item["title"]):
            return "title"
    return ""


def is_church_text(sections):
    # Conservative guard: a modern Russian-only page must not silently
    # enter the Church Slavonic field. Ambiguous content requires review.
    source = fold(" ".join(
        entry["content"] for entry in sections
        if entry["type"] in ("kontakion", "ikos")
    )).lower()
    return len(CHURCH_WORDS.findall(source)) >= 8


def only_church(sections):
    # Existing parser can return original and translation; discard translation
    # entirely, leaving old API's RU field empty for new books.
    return [{**section, "translation": ""} for section in sections]


def source_only(data):
    return {**data, "translation": ""} if data and data.get("content") else None


class Command(BaseCommand):
    help = "Preview/import only missing Church Slavonic akathists from Azbyka catalogue"

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=10,
                            help="Max missing candidates to check (0 = all)")
        parser.add_argument("--delay", type=float, default=1.5)
        parser.add_argument("--write", action="store_true",
                            help="Insert NEW akathists; never update existing ones")
        parser.add_argument("--report", default="files/akathists/catalog_cs_report.csv")

    def handle(self, *args, **options):
        # The APK uses its own offlineContent.json, which can contain books
        # absent from this Django database. Until both inventories are checked,
        # no write operation is safe, even when database slugs are new.
        if options["write"]:
            raise CommandError(
                "Запись отключена: сначала требуется сверить каталог "
                "с полным offlineContent.json из приложения, а не только с Django."
            )
        limit = options["limit"]
        if limit < 0:
            raise CommandError("--limit must not be negative")
        delay = max(1.0, options["delay"])
        session = requests.Session()
        session.headers.update(HEADERS)
        try:
            response = session.get(CATALOG_URL, timeout=40)
            response.raise_for_status()
        except requests.RequestException as exc:
            raise CommandError(f"Cannot load catalogue: {exc}") from exc

        candidates = catalogue_entries(response.text)
        if not candidates:
            raise CommandError("No catalogue links found: HTML format may have changed")

        existing = list(Akathist.objects.values("slug", "title"))
        rows = []
        handled = 0
        skipped = 0
        for entry in candidates:
            match = existing_match(entry, existing)
            if match:
                skipped += 1
                rows.append({**entry, "status": "EXISTS", "details": match})
                continue
            if limit and handled >= limit:
                break
            handled += 1
            parser = ExistingAkathistParser()
            parser.check_only = True
            parser.source_url = entry["url"]
            parser.akathist_slug = entry["slug"]
            parser.akathist_title = entry["title"]
            try:
                html = parser.download_page(entry["url"])
                soup = BeautifulSoup(html, "html.parser")
                title_tag = soup.find("h1")
                if title_tag:
                    page_title = title_tag.get_text(" ", strip=True)
                    if page_title.lower().startswith("акафист"):
                        entry["title"] = page_title
                        parser.akathist_title = page_title
                match = existing_match(entry, existing)
                if match:
                    rows.append({**entry, "status": "EXISTS", "details": match})
                    continue

                root = parser.find_best_root(soup)
                pre_troparion, pre_kontakion = parser.parse_preface_hymns(root)
                sections = only_church(parser.normalize_sections(parser.parse_sections(root)))
                parser.validate_sections(sections)
                if not is_church_text(sections):
                    raise ValueError("Church Slavonic source uncertain; review manually")

                if options["write"]:
                    with transaction.atomic():
                        # The check is repeated immediately before saving.
                        fresh = list(Akathist.objects.values("slug", "title"))
                        if existing_match(entry, fresh):
                            rows.append({**entry, "status": "EXISTS", "details": "rechecked"})
                            continue
                        parser.save_akathist(
                            sections=sections,
                            troparion=source_only(pre_troparion),
                            kontakion_before=source_only(pre_kontakion),
                        )
                        existing.append({"slug": entry["slug"], "title": entry["title"]})
                    status = "ADDED_CS"
                else:
                    status = "READY_CS"
                rows.append({
                    **entry, "status": status,
                    "details": f"13 kontakia, 12 ikoses, "
                               f"{sum(s['type'] == 'prayer' for s in sections)} prayers",
                })
            except (Exception) as exc:
                rows.append({
                    **entry, "status": "REVIEW",
                    "details": f"{type(exc).__name__}: {exc}"[:240],
                })
            finally:
                time.sleep(delay)

        report = Path(options["report"])
        report.parent.mkdir(parents=True, exist_ok=True)
        with report.open("w", newline="", encoding="utf-8-sig") as stream:
            writer = csv.DictWriter(
                stream, fieldnames=("url", "slug", "title", "category", "status", "details")
            )
            writer.writeheader()
            writer.writerows(rows)

        statuses = {}
        for row in rows:
            statuses[row["status"]] = statuses.get(row["status"], 0) + 1
        self.stdout.write(f"Catalog unique links: {len(candidates)}")
        self.stdout.write(f"Existing database akathists: {len(Akathist.objects.all())}")
        self.stdout.write(f"Already present skipped: {skipped}")
        self.stdout.write(f"Missing candidates checked: {handled}")
        self.stdout.write(f"Results: {statuses}")
        self.stdout.write(f"Report: {report}")
        if not options["write"]:
            self.stdout.write("PREVIEW ONLY: no database writes. Use --write to add missing.")
