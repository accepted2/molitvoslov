import argparse
import json
import re
import time
import zipfile
from io import BytesIO
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup


BASE_URL = "https://azbyka.ru"

# Раздел "Акафисты" в Молитвослове.
START_URLS = [
    "https://azbyka.ru/molitvoslov/1/akafisty",
]

OUTPUT_DIR = Path("files/akathists")
MANIFEST_PATH = OUTPUT_DIR / "download_manifest.json"

REQUEST_DELAY = 1.0

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/153.0 Safari/537.36"
    ),
    "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
}


def load_manifest():
    if not MANIFEST_PATH.exists():
        return {
            "pages": {},
        }

    try:
        return json.loads(
            MANIFEST_PATH.read_text(
                encoding="utf-8"
            )
        )
    except (
            json.JSONDecodeError,
            OSError,
    ):
        return {
            "pages": {},
        }


def save_manifest(manifest):
    OUTPUT_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    MANIFEST_PATH.write_text(
        json.dumps(
            manifest,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def normalize_page_url(url):
    parsed = urlparse(url)

    clean_path = parsed.path.rstrip("/")

    return (
        f"{parsed.scheme}://"
        f"{parsed.netloc}"
        f"{clean_path}"
    )


def is_akathist_page(url):
    parsed = urlparse(url)

    if parsed.netloc not in {
        "azbyka.ru",
        "www.azbyka.ru",
    }:
        return False

    path = parsed.path.lower()

    if not path.startswith(
            "/molitvoslov/"
    ):
        return False

    filename = Path(path).name

    return (
            filename.startswith("akafist-")
            and filename.endswith(".html")
    )


def get_html(session, url):
    response = session.get(
        url,
        headers=HEADERS,
        timeout=30,
    )

    response.raise_for_status()

    return response.text


def discover_akathist_pages(
        session,
):
    """
    Находим страницы акафистов.

    Сначала пробуем страницу категории.
    Дополнительно собираем ссылки со страниц
    категории, если у неё есть пагинация.
    """

    found = set()
    visited_indexes = set()
    queue = list(START_URLS)

    while queue:
        index_url = queue.pop(0)

        if index_url in visited_indexes:
            continue

        visited_indexes.add(
            index_url
        )

        print(
            f"Просматриваю каталог: "
            f"{index_url}"
        )

        try:
            html = get_html(
                session,
                index_url,
            )
        except requests.RequestException as exc:
            print(
                f"  Ошибка каталога: {exc}"
            )
            continue

        soup = BeautifulSoup(
            html,
            "html.parser",
        )

        for anchor in soup.find_all(
                "a",
                href=True,
        ):
            absolute = urljoin(
                index_url,
                anchor["href"],
            )

            absolute = normalize_page_url(
                absolute
            )

            if is_akathist_page(
                    absolute
            ):
                found.add(
                    absolute
                )
                continue

            parsed = urlparse(
                absolute
            )

            # Возможные страницы пагинации
            # внутри раздела акафистов.
            if (
                    parsed.netloc
                    in {
                "azbyka.ru",
                "www.azbyka.ru",
            }
                    and
                    "/molitvoslov/1/akafisty"
                    in parsed.path.lower()
                    and
                    absolute not in visited_indexes
                    and
                    absolute not in queue
            ):
                queue.append(
                    absolute
                )

        time.sleep(
            REQUEST_DELAY
        )

    return sorted(found)


def find_epub_candidates(
        page_url,
        html,
):
    """
    Ищем потенциальные ссылки EPUB.

    Поддерживает:
    - href="...epub"
    - ссылки, у которых текст "epub"
    - абсолютный URL на .epub внутри HTML/JS
    """

    soup = BeautifulSoup(
        html,
        "html.parser",
    )

    candidates = []

    for anchor in soup.find_all(
            "a",
            href=True,
    ):
        href = anchor.get(
            "href",
            ""
        ).strip()

        label = anchor.get_text(
            " ",
            strip=True,
        ).lower()

        href_lower = href.lower()

        if (
                ".epub" in href_lower
                or label == "epub"
                or " epub" in label
                or label.startswith("epub")
        ):
            candidates.append(
                urljoin(
                    page_url,
                    href,
                )
            )

    # Иногда URL спрятан не в обычном <a>.
    patterns = [
        r'https?://[^\s"\'<>]+\.epub(?:\?[^\s"\'<>]*)?',
        r'["\']([^"\']+\.epub(?:\?[^"\']*)?)["\']',
    ]

    for pattern in patterns:
        for match in re.findall(
                pattern,
                html,
                flags=re.IGNORECASE,
        ):
            if isinstance(
                    match,
                    tuple,
            ):
                match = match[0]

            candidates.append(
                urljoin(
                    page_url,
                    match,
                )
            )

    # Убираем повторы,
    # сохраняя исходный порядок.
    unique = []
    seen = set()

    for url in candidates:
        if url in seen:
            continue

        seen.add(url)
        unique.append(url)

    return unique


def looks_like_epub(
        content,
):
    """
    EPUB является ZIP-архивом.

    Дополнительно проверяем, что внутри
    есть типичные EPUB-файлы.
    """

    if not content.startswith(
            b"PK"
    ):
        return False

    try:
        with zipfile.ZipFile(
                BytesIO(content)
        ) as archive:
            names = {
                name.lower()
                for name
                in archive.namelist()
            }

            if "mimetype" in names:
                return True

            if any(
                    name.endswith(
                        ".opf"
                    )
                    for name in names
            ):
                return True

            if any(
                    name.endswith(
                        (
                                ".xhtml",
                                ".html",
                        )
                    )
                    for name in names
            ):
                return True

    except zipfile.BadZipFile:
        return False

    return False


def download_epub(
        session,
        epub_url,
):
    response = session.get(
        epub_url,
        headers=HEADERS,
        timeout=60,
        allow_redirects=True,
    )

    response.raise_for_status()

    if not looks_like_epub(
            response.content
    ):
        return None

    return response


def slug_from_page_url(
        page_url,
):
    name = Path(
        urlparse(
            page_url
        ).path
    ).stem

    name = re.sub(
        r"[^a-zA-Z0-9_-]+",
        "-",
        name,
    )

    return name.strip("-")


def filename_from_response(
        page_url,
        response,
):
    content_disposition = (
        response.headers.get(
            "Content-Disposition",
            ""
        )
    )

    match = re.search(
        r'filename\*?=(?:UTF-8\'\')?["\']?([^"\';]+)',
        content_disposition,
        flags=re.IGNORECASE,
    )

    if match:
        filename = (
            match.group(1)
            .strip()
        )

        if filename.lower().endswith(
                ".epub"
        ):
            return filename

    final_path = Path(
        urlparse(
            response.url
        ).path
    )

    if final_path.suffix.lower() == ".epub":
        return final_path.name

    slug = slug_from_page_url(
        page_url
    )

    return f"{slug}.epub"


def get_page_title(
        html,
):
    soup = BeautifulSoup(
        html,
        "html.parser",
    )

    h1 = soup.find("h1")

    if h1:
        title = h1.get_text(
            " ",
            strip=True,
        )

        if title:
            return title

    title_tag = soup.find(
        "title"
    )

    if title_tag:
        return title_tag.get_text(
            " ",
            strip=True,
        )

    return ""


def process_page(
        session,
        page_url,
        manifest,
):
    print()
    print(
        f"Страница: {page_url}"
    )

    try:
        html = get_html(
            session,
            page_url,
        )
    except requests.RequestException as exc:
        print(
            f"  Ошибка страницы: {exc}"
        )

        return "failed"

    title = get_page_title(
        html
    )

    print(
        f"  Название: {title}"
    )

    candidates = find_epub_candidates(
        page_url,
        html,
    )

    if not candidates:
        print(
            "  EPUB-ссылка не найдена."
        )

        manifest["pages"][
            page_url
        ] = {
            "title": title,
            "status": "no_epub",
            "page_url": page_url,
        }

        save_manifest(
            manifest
        )

        return "failed"

    for epub_url in candidates:
        print(
            f"  Пробую: {epub_url}"
        )

        try:
            response = download_epub(
                session,
                epub_url,
            )
        except requests.RequestException as exc:
            print(
                f"    Ошибка: {exc}"
            )
            continue

        if response is None:
            print(
                "    Это не EPUB."
            )
            continue

        filename = filename_from_response(
            page_url,
            response,
        )

        destination = (
                OUTPUT_DIR /
                filename
        )

        already_exists = (
            destination.exists()
        )

        if already_exists:
            print(
                f"  Уже существует: "
                f"{destination.name}"
            )
        else:
            destination.write_bytes(
                response.content
            )

            print(
                f"  Скачан: "
                f"{destination.name}"
            )

        manifest["pages"][
            page_url
        ] = {
            "title": title,
            "status": "downloaded",
            "page_url": page_url,
            "epub_url": response.url,
            "file": str(
                destination
            ).replace(
                "\\",
                "/",
            ),
            "size": len(
                response.content
            ),
        }

        save_manifest(
            manifest
        )

        if already_exists:
            return "exists"

        return "downloaded"

    print(
        "  Подходящий EPUB скачать "
        "не удалось."
    )

    manifest["pages"][
        page_url
    ] = {
        "title": title,
        "status": "download_failed",
        "page_url": page_url,
    }

    save_manifest(
        manifest
    )

    return "failed"


def manifest_file_exists(
        page_data,
):
    """
    Проверяем, что файл из manifest
    действительно существует на диске.
    """

    if not page_data:
        return False

    if page_data.get(
            "status"
    ) != "downloaded":
        return False

    file_path = page_data.get(
        "file"
    )

    if not file_path:
        return False

    return Path(
        file_path
    ).exists()


def main():
    global REQUEST_DELAY

    parser = argparse.ArgumentParser(
        description=(
            "Скачивает EPUB-акафисты "
            "с Азбуки веры партиями."
        )
    )

    parser.add_argument(
        "--count",
        type=int,
        default=10,
        help=(
            "Сколько новых EPUB скачать "
            "за один запуск."
        ),
    )

    parser.add_argument(
        "--delay",
        type=float,
        default=REQUEST_DELAY,
        help=(
            "Пауза между запросами "
            "в секундах."
        ),
    )

    args = parser.parse_args()

    if args.count < 1:
        parser.error(
            "--count должен быть больше 0"
        )

    REQUEST_DELAY = max(
        args.delay,
        0.5,
    )

    OUTPUT_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    manifest = load_manifest()

    if "pages" not in manifest:
        manifest["pages"] = {}

    session = requests.Session()

    session.headers.update(
        HEADERS
    )

    print(
        "Ищу страницы акафистов..."
    )

    pages = discover_akathist_pages(
        session
    )

    print()

    print(
        f"Найдено страниц: "
        f"{len(pages)}"
    )

    if not pages:
        print(
            "Страницы акафистов "
            "не найдены."
        )
        return

    downloaded = 0
    skipped = 0
    failed = 0

    for page_url in pages:
        # Останавливаемся только после того,
        # как реально скачано нужное количество
        # НОВЫХ файлов.
        if downloaded >= args.count:
            break

        old = (
            manifest["pages"]
            .get(page_url)
        )

        # Если manifest говорит, что файл скачан,
        # проверяем, существует ли он физически.
        if manifest_file_exists(
                old
        ):
            skipped += 1
            continue

        result = process_page(
            session,
            page_url,
            manifest,
        )

        if result == "downloaded":
            downloaded += 1

        elif result == "exists":
            skipped += 1

        else:
            failed += 1

        time.sleep(
            REQUEST_DELAY
        )

    print()
    print("=" * 60)

    print(
        f"Скачано новых EPUB: "
        f"{downloaded}"
    )

    print(
        f"Уже были скачаны ранее: "
        f"{skipped}"
    )

    print(
        f"Не удалось скачать: "
        f"{failed}"
    )

    print(
        f"Папка: {OUTPUT_DIR}"
    )

    print(
        f"Manifest: {MANIFEST_PATH}"
    )

    print("=" * 60)


if __name__ == "__main__":
    main()