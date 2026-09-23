import json
import re
from pathlib import Path
from urllib.parse import urlparse

from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError

from api.models import Akathist


DEFAULT_MANIFEST = Path(
    "files/akathists/download_manifest.json"
)

# На Азбуке есть отдельные старые версии, подготовленные именно
# под церковнославянский шрифт/старую кодировку. Их заголовки и
# содержимое отличаются от обычных EPUB: например, «Кондaкъ №.»
# и т. п. Без отдельной конвертации такого текста в нормальный
# Unicode импортировать его в приложение нельзя.
LEGACY_CHURCH_MARKERS = (
    "на церковнославянском языке",
    "церковнославянским шрифтом",
)


class Command(BaseCommand):
    help = (
        "Массово импортирует скачанные EPUB-акафисты "
        "из download_manifest.json."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--manifest",
            default=str(DEFAULT_MANIFEST),
            help=(
                "Путь к download_manifest.json. "
                "По умолчанию: "
                "files/akathists/download_manifest.json"
            ),
        )

        parser.add_argument(
            "--offset",
            type=int,
            default=0,
            help=(
                "Сколько скачанных EPUB (status=downloaded) "
                "пропустить от начала manifest. По умолчанию: 0."
            ),
        )

        parser.add_argument(
            "--count",
            type=int,
            default=None,
            help=(
                "Сколько скачанных EPUB взять после --offset. "
                "Legacy ЦС-версии входят в это окно, но по умолчанию "
                "пропускаются при импорте."
            ),
        )

        parser.add_argument(
            "--check-only",
            action="store_true",
            help=(
                "Только проверить EPUB. "
                "Ничего не записывать в БД."
            ),
        )

        parser.add_argument(
            "--include-legacy-church",
            action="store_true",
            help=(
                "Не пропускать специальные EPUB в старой "
                "церковнославянской шрифтовой кодировке. "
                "Обычно этот флаг использовать не нужно."
            ),
        )

    def handle(self, *args, **options):
        manifest_path = Path(options["manifest"])
        offset = options["offset"]
        count = options["count"]
        check_only = options["check_only"]
        include_legacy = options["include_legacy_church"]

        if offset < 0:
            raise CommandError(
                "--offset не может быть меньше 0."
            )

        if count is not None and count < 1:
            raise CommandError(
                "--count должен быть больше 0."
            )

        if not manifest_path.exists():
            raise CommandError(
                f"Manifest не найден: {manifest_path}"
            )

        try:
            manifest = json.loads(
                manifest_path.read_text(
                    encoding="utf-8"
                )
            )
        except (
                json.JSONDecodeError,
                OSError,
        ) as exc:
            raise CommandError(
                f"Не удалось прочитать manifest: {exc}"
            ) from exc

        pages = manifest.get(
            "pages",
            {},
        )

        if not pages:
            raise CommandError(
                "В manifest отсутствуют страницы."
            )

        downloaded_items = [
            (page_url, data)
            for page_url, data in pages.items()
            if data.get("status") == "downloaded"
        ]

        if offset >= len(downloaded_items):
            raise CommandError(
                "--offset выходит за пределы скачанных EPUB: "
                f"offset={offset}, downloaded={len(downloaded_items)}."
            )

        if count is None:
            batch_items = downloaded_items[offset:]
        else:
            batch_items = downloaded_items[
                offset:offset + count
            ]

        self.stdout.write("")
        self.stdout.write("=" * 72)
        self.stdout.write(
            "МАССОВЫЙ ИМПОРТ АКАФИСТОВ"
        )
        self.stdout.write("=" * 72)

        self.stdout.write(
            f"Manifest: {manifest_path}"
        )

        self.stdout.write(
            f"Записей в manifest: {len(pages)}"
        )

        self.stdout.write(
            f"Скачанных EPUB в manifest: {len(downloaded_items)}"
        )

        self.stdout.write(
            f"Offset: {offset}"
        )

        self.stdout.write(
            f"EPUB в выбранной партии: {len(batch_items)}"
        )

        if check_only:
            self.stdout.write(
                self.style.WARNING(
                    "Режим CHECK-ONLY: "
                    "БД изменяться не будет."
                )
            )

        processed = 0
        success = 0
        failed = 0
        skipped = 0
        skipped_legacy = 0
        reused_existing_slug = 0

        failures = []
        legacy_items = []

        for batch_index, (page_url, data) in enumerate(
                batch_items,
                start=1,
        ):
            title = (
                    data.get("title")
                    or ""
            ).strip()

            if (
                    not include_legacy
                    and self.is_legacy_church_variant(
                title
            )
            ):
                skipped_legacy += 1
                legacy_items.append(
                    {
                        "title": title,
                        "page_url": page_url,
                        "file": data.get("file") or "",
                    }
                )

                self.stdout.write("")
                self.stdout.write(
                    self.style.WARNING(
                        f"[{batch_index}] Пропуск legacy ЦС-версии: "
                        f"{title}"
                    )
                )
                self.stdout.write(
                    "  Причина: старая шрифтовая "
                    "церковнославянская кодировка; "
                    "нужна отдельная Unicode-конвертация."
                )
                continue

            file_value = data.get("file")

            if not file_value:
                skipped += 1

                self.stdout.write(
                    self.style.WARNING(
                        f"\n[{batch_index}] Пропуск: {page_url}\n"
                        "  В manifest нет пути к файлу."
                    )
                )

                continue

            epub_path = Path(file_value)

            if not epub_path.exists():
                skipped += 1

                self.stdout.write(
                    self.style.WARNING(
                        f"\n[{batch_index}] Пропуск: {page_url}\n"
                        f"  EPUB отсутствует: "
                        f"{epub_path}"
                    )
                )

                continue

            url_slug = self.make_slug(
                page_url
            )

            if not url_slug:
                skipped += 1

                self.stdout.write(
                    self.style.WARNING(
                        f"\n[{batch_index}] Пропуск: {page_url}\n"
                        "  Не удалось получить slug."
                    )
                )

                continue

            slug = self.resolve_slug(
                title=title,
                url_slug=url_slug,
            )

            if slug != url_slug:
                reused_existing_slug += 1

            processed += 1

            self.stdout.write("")
            self.stdout.write("-" * 72)

            self.stdout.write(
                f"[{batch_index}] {title}"
            )

            self.stdout.write(
                f"URL: {page_url}"
            )

            self.stdout.write(
                f"EPUB: {epub_path}"
            )

            self.stdout.write(
                f"Slug: {slug}"
            )

            if slug != url_slug:
                self.stdout.write(
                    self.style.WARNING(
                        "  Использован slug уже существующего "
                        "акафиста с тем же нормализованным названием, "
                        "чтобы не создавать дубль."
                    )
                )

            try:
                command_options = {
                    "epub": str(epub_path),
                    "slug": slug,
                    "title": title,
                }

                if check_only:
                    command_options[
                        "check_only"
                    ] = True

                call_command(
                    "import_akathist_epub",
                    **command_options,
                )

            except Exception as exc:
                failed += 1

                error_text = str(exc)

                failures.append(
                    {
                        "title": title,
                        "slug": slug,
                        "page_url": page_url,
                        "file": str(epub_path),
                        "error": error_text,
                    }
                )

                self.stdout.write("")
                self.stdout.write(
                    self.style.ERROR(
                        "ОШИБКА ИМПОРТА"
                    )
                )

                self.stdout.write(
                    self.style.ERROR(
                        error_text
                    )
                )

                # Ошибка одного EPUB не должна
                # останавливать импорт остальных.
                continue

            success += 1

        self.stdout.write("")
        self.stdout.write("=" * 72)

        if check_only:
            self.stdout.write(
                "ПРОВЕРКА ЗАВЕРШЕНА"
            )
        else:
            self.stdout.write(
                "ИМПОРТ ЗАВЕРШЁН"
            )

        self.stdout.write("=" * 72)

        self.stdout.write(
            f"EPUB в выбранной партии: {len(batch_items)}"
        )

        self.stdout.write(
            f"Обработано обычных EPUB: {processed}"
        )

        self.stdout.write(
            self.style.SUCCESS(
                f"Успешно: {success}"
            )
        )

        if failed:
            self.stdout.write(
                self.style.ERROR(
                    f"С ошибками: {failed}"
                )
            )
        else:
            self.stdout.write(
                f"С ошибками: {failed}"
            )

        self.stdout.write(
            f"Пропущено некорректных записей: "
            f"{skipped}"
        )

        self.stdout.write(
            f"Пропущено legacy ЦС-версий: "
            f"{skipped_legacy}"
        )

        self.stdout.write(
            f"Переиспользовано существующих slug: "
            f"{reused_existing_slug}"
        )

        if legacy_items:
            self.stdout.write("")
            self.stdout.write("=" * 72)
            self.stdout.write(
                "LEGACY ЦЕРКОВНОСЛАВЯНСКИЕ ВЕРСИИ"
            )
            self.stdout.write("=" * 72)

            for index, item in enumerate(
                    legacy_items,
                    start=1,
            ):
                self.stdout.write("")
                self.stdout.write(
                    f"{index}. {item['title']}"
                )
                self.stdout.write(
                    f"   EPUB: {item['file']}"
                )
                self.stdout.write(
                    "   Статус: пропущен до отдельной "
                    "Unicode-конвертации."
                )

        if failures:
            self.stdout.write("")
            self.stdout.write("=" * 72)
            self.stdout.write(
                "СПИСОК ОШИБОК"
            )
            self.stdout.write("=" * 72)

            for index, item in enumerate(
                    failures,
                    start=1,
            ):
                self.stdout.write("")
                self.stdout.write(
                    f"{index}. "
                    f"{item['title']}"
                )

                self.stdout.write(
                    f"   Slug: "
                    f"{item['slug']}"
                )

                self.stdout.write(
                    f"   EPUB: "
                    f"{item['file']}"
                )

                self.stdout.write(
                    f"   Ошибка: "
                    f"{item['error']}"
                )

    def is_legacy_church_variant(
            self,
            title,
    ):
        normalized = self.normalize_title(
            title
        )

        return any(
            marker in normalized
            for marker in LEGACY_CHURCH_MARKERS
        )

    def resolve_slug(
            self,
            title,
            url_slug,
    ):
        """
        Если акафист уже есть в БД под другим slug,
        но с тем же нормализованным названием, используем
        существующий slug.

        Сравнение выполняется в Python через casefold(), потому
        что SQLite не гарантирует полноценный Unicode-регистр
        для кириллицы при __iexact.
        """

        normalized_title = self.normalize_title(
            title
        )

        if not normalized_title:
            return url_slug

        matches = []

        for existing_title, existing_slug in (
                Akathist.objects.values_list(
                    "title",
                    "slug",
                )
        ):
            if (
                    self.normalize_title(existing_title)
                    == normalized_title
            ):
                matches.append(existing_slug)

                if len(matches) > 1:
                    break

        if len(matches) == 1:
            return matches[0]

        return url_slug

    def normalize_title(
            self,
            value,
    ):
        """
        Нормализует название для безопасного сравнения:
        - Unicode casefold для кириллицы;
        - схлопывание пробелов;
        - ё/е считаются одинаковыми.
        """

        normalized = " ".join(
            (value or "").strip().casefold().split()
        )

        return normalized.replace(
            "ё",
            "е",
        )

    def make_slug(
            self,
            page_url,
    ):
        """
        Получаем slug непосредственно
        из URL страницы Азбуки.
        """

        parsed = urlparse(
            page_url
        )

        filename = Path(
            parsed.path
        ).stem

        slug = filename.lower()

        slug = re.sub(
            r"[^a-z0-9_-]+",
            "-",
            slug,
        )

        slug = re.sub(
            r"-+",
            "-",
            slug,
        )

        return slug.strip("-")
