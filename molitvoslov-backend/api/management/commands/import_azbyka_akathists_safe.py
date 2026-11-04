"""Create-only Akathist importer based on a reviewed, read-only Azbyka audit.

Run audit_azbyka_akathist_catalog first. This command defaults to a plan:
it never imports unless --apply, --approved-file and --rights-confirmed
are supplied together. Existing Akathists and Text rows are NEVER updated.
No source text is written to logs or reports.
"""

import hashlib
import json
import time
from collections import Counter
from pathlib import Path
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from api.management.commands.audit_azbyka_akathist_catalog import (
    CATALOG_URL,
    ROBOTS_URL,
    USER_AGENT,
    normalize_title,
    now_utc,
    parsed_content_sha256,
    save_json,
)
from api.management.commands.import_akathist import Command as AkathistParser
from api.models import Akathist, Text

DEFAULT_AUDIT = Path("files/akathists/azbyka_audit.json")
DEFAULT_RESULT = Path("files/akathists/azbyka_import_report.json")


def load_audit(path):
    if not path.exists():
        raise CommandError("Нет аудита: сначала запустите audit_azbyka_akathist_catalog.")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise CommandError("Ошибка чтения аудита: " + str(exc)) from exc
    pages = data.get("pages")
    if data.get("source") != CATALOG_URL or not isinstance(pages, dict):
        raise CommandError("Некорректный отчёт аудита или неизвестный источник.")
    if len(pages) < 100:
        raise CommandError("Аудит содержит менее 100 ссылок, импорт остановлен.")
    return pages


def load_approved(path):
    if path is None:
        return set()
    try:
        items = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise CommandError("Ошибка файла разрешённых slug: " + str(exc)) from exc
    if not isinstance(items, list) or not items or not all(
        isinstance(value, str) and value.strip() for value in items
    ):
        raise CommandError("Файл разрешений должен быть непустым JSON-массивом slug.")
    if len(set(items)) != len(items):
        raise CommandError("В разрешениях повторяются slug.")
    return set(items)


def existing_reason(slug, title):
    # The old importer calls update_or_create and can delete obsolete sections.
    # Do not let it touch anything already present, even if the title differs.
    if Akathist.objects.filter(slug=slug).exists():
        return "Акафист с этим slug уже существует"
    existing_titles = Akathist.objects.values_list("title", flat=True)
    if any(normalize_title(other) == normalize_title(title) for other in existing_titles):
        return "Акафист с таким названием уже существует"
    if Text.objects.filter(slug__startswith=slug + "-").exists():
        return "Связанные тексты с таким префиксом уже существуют"
    return ""


def validate_candidate(item):
    if not isinstance(item, dict):
        return False
    url, slug = item.get("url", ""), item.get("slug", "")
    if not isinstance(url, str) or not isinstance(slug, str):
        return False
    if not url.startswith("https://azbyka.ru/molitvoslov/"):
        return False
    if not slug or len(slug) > 145 or any(ch not in "abcdefghijklmnopqrstuvwxyz0123456789-" for ch in slug):
        return False
    checks = item.get("checks") or {}
    return (
        item.get("status") == "checked"
        and isinstance(checks, dict)
        and checks.get("kontakia") == 13
        and checks.get("ikoses") == 12
        and len(item.get("content_sha256", "")) == 64
        and isinstance(item.get("title"), str)
        and bool(item["title"].strip())
    )


class Command(BaseCommand):
    help = "Безопасный поэтапный импорт НОВЫХ акафистов после аудита и утверждения списка."

    def add_arguments(self, parser):
        parser.add_argument("--audit", default=str(DEFAULT_AUDIT))
        parser.add_argument("--report", default=str(DEFAULT_RESULT))
        parser.add_argument("--approved-file", help="JSON-массив вручную одобренных slug.")
        parser.add_argument("--limit", type=int, default=20, help="0 = все одобренные.")
        parser.add_argument("--delay", type=float, default=2.0)
        parser.add_argument("--apply", action="store_true", help="Создать новые записи в локальном Django.")
        parser.add_argument(
            "--rights-confirmed", action="store_true",
            help="Подтвердить право на повторное использование и публикацию выбранных текстов.",
        )

    def handle(self, *args, **options):
        if options["limit"] < 0 or options["delay"] < 1:
            raise CommandError("--limit >= 0 и --delay >= 1 обязательны.")
        approved = load_approved(Path(options["approved_file"]) if options["approved_file"] else None)
        if options["apply"] and (not approved or not options["rights_confirmed"]):
            raise CommandError("--apply требует --approved-file и --rights-confirmed.")
        pages = load_audit(Path(options["audit"]))
        checked_slugs = {item.get("slug") for item in pages.values() if validate_candidate(item)}
        unknown = approved - checked_slugs
        if unknown:
            raise CommandError("Нет успешно проверенного аудита для slug: " + ", ".join(sorted(unknown)[:10]))

        eligible = []
        counts = Counter()
        for item in pages.values():
            if not validate_candidate(item):
                counts["не прошёл аудит / уже существует"] += 1
                continue
            reason = existing_reason(item["slug"], item["title"])
            if reason:
                counts["есть в Django / конфликт"] += 1
                continue
            if item["slug"] not in approved:
                counts["ожидает разрешения"] += 1
                continue
            eligible.append(item)
        self.stdout.write("Ссылок в аудите: " + str(len(pages)))
        self.stdout.write("Статусы: " + str(dict(counts)))
        self.stdout.write("Одобрено для создания и отсутствует в БД: " + str(len(eligible)))
        if not options["apply"]:
            self.stdout.write("ПЛАН: Django, offline JSON и Supabase не изменены.")
            self.stdout.write("Чтобы импортировать, укажите --apply и подтвердите права.")
            return

        report_path = Path(options["report"])
        if report_path.exists():
            try:
                report = json.loads(report_path.read_text(encoding="utf-8"))
                if not isinstance(report.get("pages"), dict):
                    raise ValueError("pages must be dict")
            except (OSError, ValueError) as exc:
                raise CommandError("Не удалось прочитать прошлый отчёт: " + str(exc)) from exc
        else:
            report = {"source": CATALOG_URL, "pages": {}}

        session = requests.Session()
        session.headers.update({"User-Agent": USER_AGENT, "Accept-Language": "ru-RU,ru;q=0.9"})
        robots = RobotFileParser()
        robots.set_url(ROBOTS_URL)
        try:
            response = session.get(ROBOTS_URL, timeout=25)
            if response.status_code == 404:
                robots.parse([])
            else:
                response.raise_for_status()
                robots.parse(response.text.splitlines())
        except requests.RequestException as exc:
            raise CommandError("Не удалось проверить robots.txt, импорт остановлен: " + str(exc)) from exc
        if not robots.can_fetch(USER_AGENT, CATALOG_URL):
            raise CommandError("robots.txt запрещает обход каталога.")

        if not eligible:
            self.stdout.write("Новых разрешённых акафистов нет; ничего не изменено.")
            return
        parser = AkathistParser()
        imported = 0
        attempted = 0
        last_request = time.monotonic()
        limit = options["limit"]
        for item in eligible:
            if limit and attempted >= limit:
                break
            slug, title, url = item["slug"], item["title"], item["url"]
            if not robots.can_fetch(USER_AGENT, url):
                report["pages"][url] = {"slug": slug, "status": "robots_blocked"}
                continue
            reason = existing_reason(slug, title)
            if reason:
                report["pages"][url] = {"slug": slug, "status": "skipped", "reason": reason}
                continue
            elapsed = time.monotonic() - last_request
            if elapsed < options["delay"]:
                time.sleep(options["delay"] - elapsed)
            attempted += 1
            self.stdout.write("[%s] %s" % (attempted, title))
            try:
                response = session.get(url, timeout=45)
                last_request = time.monotonic()
                response.raise_for_status()
                if len(response.content) > 6_000_000:
                    raise ValueError("HTML превышает 6 MB")
                html_hash = hashlib.sha256(response.content).hexdigest()
                parser.source_url, parser.akathist_slug, parser.akathist_title = url, slug, title
                root = parser.find_best_root(BeautifulSoup(response.text, "html.parser"))
                troparion, kontakion_before = parser.parse_preface_hymns(root)
                sections = parser.normalize_sections(parser.parse_sections(root))
                parser.validate_sections(sections)
                text_hash = parsed_content_sha256(sections, troparion, kontakion_before)
                if text_hash != item["content_sha256"]:
                    raise ValueError("Текст изменился после аудита; нужен --refresh-checked")
                # Recheck inside the same transaction. No preexisting Akathist
                # or Text record may be overwritten by the legacy save method.
                with transaction.atomic():
                    reason = existing_reason(slug, title)
                    if reason:
                        raise ValueError("Конфликт перед сохранением: " + reason)
                    created = parser.save_akathist(
                        sections=sections,
                        troparion=troparion,
                        kontakion_before=kontakion_before,
                    )
                    if not created.sections.exists():
                        raise ValueError("Акафист создан без разделов")
                report["pages"][url] = {
                    "slug": slug, "status": "imported", "created_id": created.id,
                    "sections": len(sections), "html_sha256": html_hash,
                    "content_sha256": text_hash,
                }
                imported += 1
            except requests.HTTPError as exc:
                report["pages"][url] = {"slug": slug, "status": "error", "error": str(exc)[:350]}
                if response.status_code in (429, 503):
                    self.stderr.write("Сайт ограничил запросы, импорт остановлен.")
                    break
            except (requests.RequestException, Exception) as exc:
                report["pages"][url] = {"slug": slug, "status": "error", "error": str(exc)[:350]}
                self.stderr.write(self.style.WARNING("%s: %s" % (slug, exc)))
            finally:
                report["updated_at"] = now_utc()
                save_json(report_path, report)
        self.stdout.write("Создано новых акафистов: %s; запросов: %s" % (imported, attempted))
        self.stdout.write("Отчёт: " + str(report_path))
        self.stdout.write("Offline JSON и поисковая база НЕ изменены: нужен отдельный проверяемый экспорт.")
