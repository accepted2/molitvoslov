"""Audit Azbyka's Akathist catalog without writing prayer text to Django.

Usage:
  python manage.py audit_azbyka_akathist_catalog --catalog-only
  python manage.py audit_azbyka_akathist_catalog --limit 20
  python manage.py audit_azbyka_akathist_catalog --limit 0

The JSON report is resumable and contains only metadata, never copyrighted
prayer text. The command does not publish or overwrite any Akathist.
"""
import hashlib
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse, urlunparse
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup
from django.core.management.base import BaseCommand, CommandError

from api.management.commands.import_akathist import Command as ExistingAkathistParser
from api.models import Akathist

CATALOG_URL = "https://azbyka.ru/molitvoslov/akafisty-v-pravoslavnom-kalendare.html"
ROBOTS_URL = "https://azbyka.ru/robots.txt"
USER_AGENT = "MolitvoslovCatalogAudit/1.0 (+manual review before any republication)"
DEFAULT_OUTPUT = Path("files/akathists/azbyka_audit.json")
# Fixed source path: do not crawl arbitrary user-supplied domains.
ALLOWED_HOST = "azbyka.ru"


def canonical_url(raw):
    target = urljoin(CATALOG_URL, str(raw or "").strip())
    parts = urlparse(target)
    if parts.scheme != "https" or parts.hostname != ALLOWED_HOST:
        return None
    path = re.sub(r"/+", "/", parts.path).rstrip("/")
    if not path.startswith("/molitvoslov/"):
        return None
    name = path.rsplit("/", 1)[-1].lower()
    if "akafist" not in name and "akathist" not in name:
        return None
    if name in {"akafisty", "akafisty-v-pravoslavnom-kalendare.html"}:
        return None
    return urlunparse(("https", ALLOWED_HOST, path, "", "", ""))


def slug_for_url(url):
    filename = urlparse(url).path.rsplit("/", 1)[-1]
    name = re.sub(r"\.html?$", "", filename, flags=re.IGNORECASE).lower()
    name = re.sub(r"[^a-z0-9-]+", "-", name).strip("-")
    if len(name) > 145:
        name = name[:125].rstrip("-") + "-" + hashlib.sha1(url.encode()).hexdigest()[:12]
    return name


def normalize_title(value):
    return re.sub(r"^акафист\s+", "", re.sub(r"\s+", " ", value).strip(), flags=re.I).casefold()


def discover_catalog(html):
    """Return stable, deduplicated list of actual Akathist page links."""
    soup = BeautifulSoup(html, "html.parser")
    # Numbered Akathist lists are the authoritative entries on this page.
    roots = soup.select("ol li a[href]")
    if not roots:
        raise ValueError("В каталоге не найдены нумерованные ссылки на акафисты.")
    found = {}
    for link in roots:
        url = canonical_url(link.get("href"))
        if not url or url in found:
            continue
        label = link.get_text(" ", strip=True)
        if len(label) < 3:
            continue
        title = label if re.match(r"^акафист\b", label, re.I) else "Акафист " + label
        found[url] = {"url": url, "slug": slug_for_url(url), "title": title}
    return list(found.values())


def now_utc():
    return datetime.now(timezone.utc).isoformat()


def save_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def count_types(sections, section_type):
    return sum(section.get("type") == section_type for section in sections)


def parsed_content_sha256(sections, troparion=None, kontakion_before=None):
    """Stable source-text fingerprint; independent of dynamic page HTML."""
    payload = {
        "sections": [
            {key: section.get(key) for key in ("type", "number", "content", "translation", "note")}
            for section in sections
        ],
        "troparion": troparion,
        "kontakion_before": kontakion_before,
    }
    encoded = json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


class Command(BaseCommand):
    help = "Безопасно сверяет каталог 500+ акафистов Азбуки: чтение и проверка без изменений БД."

    def add_arguments(self, parser):
        parser.add_argument("--catalog-only", action="store_true",
                            help="Только получить список ссылок и сравнить с БД.")
        parser.add_argument("--limit", type=int, default=20,
                            help="Сколько новых страниц проверить за запуск (0 = все).")
        parser.add_argument("--delay", type=float, default=2,
                            help="Минимальная пауза между HTTP-запросами в секундах.")
        parser.add_argument("--output", default=str(DEFAULT_OUTPUT),
                            help="Локальный JSON-отчёт; повторный запуск продолжает проверку.")
        parser.add_argument("--retry-failed", action="store_true",
                            help="Повторно проверить страницы с прошлой ошибкой.")
        parser.add_argument("--refresh-checked", action="store_true",
                            help="Повторно проверить уже разобранные страницы и обновить контрольную сумму текста.")

    def handle(self, *args, **options):
        limit = options["limit"]
        if limit < 0:
            raise CommandError("--limit не может быть отрицательным")
        delay = max(1.0, options["delay"])
        output = Path(options["output"])
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
            raise CommandError("Не удалось проверить robots.txt; обход остановлен: " + str(exc))
        if not robots.can_fetch(USER_AGENT, CATALOG_URL):
            raise CommandError("robots.txt запрещает чтение каталога автоматическим клиентом")

        try:
            response = session.get(CATALOG_URL, timeout=45)
            response.raise_for_status()
            catalog = discover_catalog(response.text)
        except (requests.RequestException, ValueError) as exc:
            raise CommandError("Не удалось получить каталог: " + str(exc))
        if not catalog:
            raise CommandError("Каталог пуст: отменено обновление отчёта")

        self.stdout.write(f"Ссылок в каталоге: {len(catalog)}")
        if len(catalog) < 100:
            raise CommandError("Каталог подозрительно неполный (<100 ссылок): отменено")

        by_slug = {item["slug"]: item["title"]
                   for item in Akathist.objects.values("slug", "title")}
        by_title = {}
        for slug, title in by_slug.items():
            by_title.setdefault(normalize_title(title), set()).add(slug)

        report = {}
        if output.exists():
            try:
                previous = json.loads(output.read_text(encoding="utf-8"))
                report = previous.get("pages", {})
                if not isinstance(report, dict):
                    report = {}
            except (OSError, json.JSONDecodeError) as exc:
                raise CommandError("Не удалось прочитать прошлый отчёт: " + str(exc))

        fresh = {}
        for item in catalog:
            url, slug, title = item["url"], item["slug"], item["title"]
            stored = dict(report.get(url, {}))
            stored.update(item)
            existing = []
            if slug in by_slug:
                existing.append(slug)
            existing.extend(sorted(by_title.get(normalize_title(title), set()) - set(existing)))
            if existing:
                stored["status"] = "existing"
                stored["existing_slugs"] = existing
                stored["detail"] = "Пропущен: уже есть в Django, не перезаписываем"
            elif stored.get("status") == "existing":
                stored["status"] = "pending"
                stored.pop("existing_slugs", None)
            else:
                stored.setdefault("status", "pending")
            fresh[url] = stored

        data = {"source": CATALOG_URL, "updated_at": now_utc(),
                "catalog_count": len(catalog), "pages": fresh}
        save_json(output, data)

        from collections import Counter
        counts = Counter(x["status"] for x in fresh.values())
        self.stdout.write("Первичная сверка: " + str(dict(counts)))
        self.stdout.write(f"Отчёт: {output}")
        if options["catalog_only"]:
            self.stdout.write("CATALOG ONLY: Django, offline JSON и Supabase не менялись.")
            return

        # Reuse the existing, well-tested HTML-to-section parser strictly in
        # read-only mode. Never call import_one() or save_akathist().
        parser = ExistingAkathistParser()
        processed = 0
        last_request = time.monotonic()

        for url, item in fresh.items():
            status = item["status"]
            if status == "existing" or (status == "checked" and not options["refresh_checked"]):
                continue
            if status not in ("pending", "error") or (status == "error" and not options["retry_failed"]):
                continue
            if limit and processed >= limit:
                break
            if not robots.can_fetch(USER_AGENT, url):
                item.update(status="robots_blocked", error="robots.txt запретил чтение страницы")
                continue

            elapsed = time.monotonic() - last_request
            if elapsed < delay:
                time.sleep(delay - elapsed)

            processed += 1
            self.stdout.write(f"[{processed}] Проверка: {item['title']}")
            try:
                response = session.get(url, timeout=45)
                last_request = time.monotonic()
                response.raise_for_status()
                if len(response.content) > 6_000_000:
                    raise ValueError("HTML больше 6 MB")
                parser.source_url = url
                parser.akathist_slug = item["slug"]
                parser.akathist_title = item["title"]
                soup = BeautifulSoup(response.text, "html.parser")
                root = parser.find_best_root(soup)
                troparion, kontakion_before = parser.parse_preface_hymns(root)
                sections = parser.normalize_sections(parser.parse_sections(root))
                parser.validate_sections(sections)
                counts = {
                    "kontakia": count_types(sections, "kontakion"),
                    "ikoses": count_types(sections, "ikos"),
                    "prayers": count_types(sections, "prayer"),
                    "has_troparion": bool(troparion),
                    "has_preface_kontakion": bool(kontakion_before),
                    "russian_translated_sections": sum(
                        bool(section.get("translation")) for section in sections
                    ),
                    "source_sections": len(sections),
                }
                item.update(
                    status="checked",
                    checks=counts,
                    html_sha256=hashlib.sha256(response.content).hexdigest(),
                    content_sha256=parsed_content_sha256(sections, troparion, kontakion_before),
                )
                item.pop("error", None)
            except (requests.RequestException, Exception) as exc:
                item.update(status="error", error=str(exc)[:1500])
                self.stderr.write(self.style.WARNING(f"  Ошибка: {exc}"))
                if isinstance(exc, requests.HTTPError) and response.status_code in (429, 503):
                    self.stderr.write("Сервер ограничил запросы. Остановка до следующего запуска.")
                    data["updated_at"] = now_utc()
                    save_json(output, data)
                    break
            finally:
                data["updated_at"] = now_utc()
                save_json(output, data)

        counts = Counter(x["status"] for x in fresh.values())
        self.stdout.write("РЕЗУЛЬТАТ: " + str(dict(counts)))
        self.stdout.write("Ни один акафист не создан, не опубликован и не перезаписан.")
        self.stdout.write("Проверенные страницы требуют проверки прав и выборочного контроля качества.")
