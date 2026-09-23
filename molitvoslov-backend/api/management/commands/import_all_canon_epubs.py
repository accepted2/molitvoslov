import json
import re
from pathlib import Path
from urllib.parse import urlparse

from django.core.management import (
    call_command,
)
from django.core.management.base import (
    BaseCommand,
    CommandError,
)

from api.models import Canon


DEFAULT_MANIFEST = Path(
    'files/canons/download_manifest.json'
)


LEGACY_CHURCH_MARKERS = (
    'на церковнославянском языке',
    'церковнославянским шрифтом',
)


class Command(BaseCommand):
    help = (
        'Массово импортирует '
        'скачанные EPUB-каноны '
        'из download_manifest.json.'
    )

    def add_arguments(
            self,
            parser,
    ):
        parser.add_argument(
            '--manifest',
            default=str(
                DEFAULT_MANIFEST
            ),
            help=(
                'Путь к download_manifest.json. '
                'По умолчанию: '
                'files/canons/'
                'download_manifest.json'
            ),
        )

        parser.add_argument(
            '--offset',
            type=int,
            default=0,
            help=(
                'Сколько EPUB пропустить '
                'от начала manifest.'
            ),
        )

        parser.add_argument(
            '--count',
            type=int,
            default=None,
            help=(
                'Сколько EPUB обработать '
                'после --offset.'
            ),
        )

        parser.add_argument(
            '--check-only',
            action='store_true',
            help=(
                'Только проверить EPUB. '
                'База не изменяется.'
            ),
        )

        parser.add_argument(
            '--include-legacy-church',
            action='store_true',
            help=(
                'Не пропускать специальные '
                'legacy ЦС-версии.'
            ),
        )

    def handle(
            self,
            *args,
            **options,
    ):
        manifest_path = Path(
            options[
                'manifest'
            ]
        )

        offset = (
            options[
                'offset'
            ]
        )

        count = (
            options[
                'count'
            ]
        )

        check_only = (
            options[
                'check_only'
            ]
        )

        include_legacy = (
            options[
                'include_legacy_church'
            ]
        )

        if offset < 0:
            raise CommandError(
                '--offset не может '
                'быть меньше 0.'
            )

        if (
            count is not None
            and
            count < 1
        ):
            raise CommandError(
                '--count должен '
                'быть больше 0.'
            )

        if not manifest_path.exists():
            raise CommandError(
                'Manifest не найден: '
                f'{manifest_path}'
            )

        try:
            manifest = json.loads(
                manifest_path
                .read_text(
                    encoding='utf-8'
                )
            )
        except (
            json.JSONDecodeError,
            OSError,
        ) as exc:
            raise CommandError(
                'Не удалось прочитать '
                f'manifest: {exc}'
            ) from exc

        pages = (
            manifest.get(
                'pages',
                {},
            )
        )

        downloaded = [
            (
                page_url,
                data,
            )
            for (
                page_url,
                data,
            )
            in pages.items()
            if data.get(
                'status'
            ) == 'downloaded'
        ]

        if not downloaded:
            raise CommandError(
                'В manifest нет '
                'скачанных EPUB.'
            )

        if offset >= len(
            downloaded
        ):
            raise CommandError(
                '--offset выходит '
                'за пределы списка: '
                f'offset={offset}, '
                f'downloaded='
                f'{len(downloaded)}.'
            )

        if count is None:
            batch = (
                downloaded[
                    offset:
                ]
            )
        else:
            batch = (
                downloaded[
                    offset:
                    offset + count
                ]
            )

        self.stdout.write('')
        self.stdout.write(
            '=' * 72
        )

        self.stdout.write(
            'МАССОВЫЙ ИМПОРТ КАНОНОВ'
        )

        self.stdout.write(
            '=' * 72
        )

        self.stdout.write(
            f'Manifest: '
            f'{manifest_path}'
        )

        self.stdout.write(
            'Скачанных EPUB: '
            f'{len(downloaded)}'
        )

        self.stdout.write(
            f'Offset: {offset}'
        )

        self.stdout.write(
            'В выбранной партии: '
            f'{len(batch)}'
        )

        if check_only:
            self.stdout.write(
                self.style.WARNING(
                    'CHECK-ONLY: '
                    'БД изменяться не будет.'
                )
            )

        success = 0
        failed = 0
        skipped = 0

        failures = []

        for index, (
            page_url,
            data,
        ) in enumerate(
            batch,
            start=1,
        ):
            title = (
                data.get(
                    'title'
                )
                or ''
            ).strip()

            self.stdout.write('')
            self.stdout.write(
                '-' * 72
            )

            self.stdout.write(
                f'[{index}] '
                f'{title or page_url}'
            )

            if (
                not include_legacy
                and
                self.is_legacy(
                    title
                )
            ):
                skipped += 1

                self.stdout.write(
                    self.style.WARNING(
                        'Пропуск legacy '
                        'ЦС-версии.'
                    )
                )

                continue

            file_value = (
                data.get(
                    'file'
                )
            )

            if not file_value:
                skipped += 1

                self.stdout.write(
                    self.style.WARNING(
                        'Нет пути к EPUB '
                        'в manifest.'
                    )
                )

                continue

            epub_path = Path(
                file_value
            )

            if not epub_path.exists():
                skipped += 1

                self.stdout.write(
                    self.style.WARNING(
                        'EPUB отсутствует: '
                        f'{epub_path}'
                    )
                )

                continue

            url_slug = (
                self.make_slug(
                    page_url
                )
            )

            if not url_slug:
                skipped += 1

                self.stdout.write(
                    self.style.WARNING(
                        'Не удалось '
                        'получить slug.'
                    )
                )

                continue

            slug = (
                self.resolve_slug(
                    title=title,
                    url_slug=url_slug,
                )
            )

            self.stdout.write(
                f'URL: {page_url}'
            )

            self.stdout.write(
                f'EPUB: {epub_path}'
            )

            self.stdout.write(
                f'Slug: {slug}'
            )

            try:
                kwargs = {
                    'epub':
                        str(
                            epub_path
                        ),

                    'slug':
                        slug,

                    'title':
                        title,
                }

                if check_only:
                    kwargs[
                        'check_only'
                    ] = True

                call_command(
                    'import_canon_epub',
                    **kwargs,
                )

            except Exception as exc:
                failed += 1

                failures.append(
                    {
                        'title':
                            title,

                        'slug':
                            slug,

                        'file':
                            str(
                                epub_path
                            ),

                        'error':
                            str(
                                exc
                            ),
                    }
                )

                self.stdout.write(
                    self.style.ERROR(
                        'ОШИБКА: '
                        f'{exc}'
                    )
                )

                continue

            success += 1

        self.stdout.write('')
        self.stdout.write(
            '=' * 72
        )

        self.stdout.write(
            (
                'ПРОВЕРКА ЗАВЕРШЕНА'
                if check_only
                else
                'ИМПОРТ ЗАВЕРШЁН'
            )
        )

        self.stdout.write(
            '=' * 72
        )

        self.stdout.write(
            f'Успешно: {success}'
        )

        self.stdout.write(
            f'С ошибками: {failed}'
        )

        self.stdout.write(
            f'Пропущено: {skipped}'
        )

        if failures:
            self.stdout.write('')
            self.stdout.write(
                'ОШИБКИ:'
            )

            for item in failures:
                self.stdout.write(
                    ''
                )

                self.stdout.write(
                    item[
                        'title'
                    ]
                )

                self.stdout.write(
                    '  EPUB: '
                    + item[
                        'file'
                    ]
                )

                self.stdout.write(
                    '  Ошибка: '
                    + item[
                        'error'
                    ]
                )

    def is_legacy(
            self,
            title,
    ):
        normalized = (
            self.normalize_title(
                title
            )
        )

        return any(
            marker in normalized
            for marker
            in LEGACY_CHURCH_MARKERS
        )

    def resolve_slug(
            self,
            title,
            url_slug,
    ):
        normalized = (
            self.normalize_title(
                title
            )
        )

        if not normalized:
            return url_slug

        matches = []

        for (
            existing_title,
            existing_slug,
        ) in (
            Canon.objects
            .values_list(
                'title',
                'slug',
            )
        ):
            if (
                self.normalize_title(
                    existing_title
                )
                ==
                normalized
            ):
                matches.append(
                    existing_slug
                )

                if len(
                    matches
                ) > 1:
                    break

        if len(
            matches
        ) == 1:
            return matches[0]

        return url_slug

    def normalize_title(
            self,
            value,
    ):
        normalized = ' '.join(
            (
                value
                or ''
            )
            .strip()
            .casefold()
            .split()
        )

        return normalized.replace(
            'ё',
            'е',
        )

    def make_slug(
            self,
            page_url,
    ):
        parsed = urlparse(
            page_url
        )

        filename = Path(
            parsed.path
        ).stem

        slug = (
            filename
            .lower()
        )

        slug = re.sub(
            r'[^a-z0-9_-]+',
            '-',
            slug,
        )

        slug = re.sub(
            r'-+',
            '-',
            slug,
        )

        return slug.strip(
            '-'
        )
