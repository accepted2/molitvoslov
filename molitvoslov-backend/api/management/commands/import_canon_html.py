import hashlib
from collections import Counter
from pathlib import Path

from django.core.management.base import (
    BaseCommand,
    CommandError,
)
from django.db import transaction

from api.canon_html_parser import (
    CanonParseError,
    EXPECTED_ODES,
    parse_canon_html,
)
from api.models import (
    Canon,
    CanonSection,
    Text,
)


SECTION_LABELS = {
    CanonSection.TYPE_IRMOS:
        "Ирмос",

    CanonSection.TYPE_REFRAIN:
        "Припев",

    CanonSection.TYPE_TROPARION:
        "Тропарь",

    CanonSection.TYPE_THEOTOKION:
        "Богородичен",

    CanonSection.TYPE_GLORY:
        "Слава",

    CanonSection.TYPE_NOW:
        "И ныне",

    CanonSection.TYPE_SEDALEN:
        "Седален",

    CanonSection.TYPE_KONTAKION:
        "Кондак",

    CanonSection.TYPE_IKOS:
        "Икос",

    CanonSection.TYPE_SVETILEN:
        "Светилен",

    CanonSection.TYPE_PRAYER:
        "Молитва",

    CanonSection.TYPE_OTHER:
        "Текст",
}


class Command(BaseCommand):
    help = (
        "Импортирует один канон "
        "из извлечённого Book.html. "
        "На этапе разработки EPUB "
        "не используется."
    )

    def add_arguments(
            self,
            parser,
    ):
        parser.add_argument(
            "--html",
            required=True,
            help=(
                "Путь к Book.html."
            ),
        )

        parser.add_argument(
            "--slug",
            required=True,
            help=(
                "Slug канона."
            ),
        )

        parser.add_argument(
            "--title",
            default="",
            help=(
                "Название вручную. "
                "Если не указано, "
                "берётся из <h1>/<title>."
            ),
        )

        parser.add_argument(
            "--check-only",
            action="store_true",
            help=(
                "Только проверить структуру. "
                "База данных не изменяется."
            ),
        )

    def handle(
            self,
            *args,
            **options,
    ):
        html_path = Path(
            options[
                "html"
            ]
        )

        slug = (
            options[
                "slug"
            ]
            .strip()
        )

        title_override = (
            options[
                "title"
            ]
            .strip()
        )

        check_only = (
            options[
                "check_only"
            ]
        )

        if not html_path.exists():
            raise CommandError(
                "Book.html не найден: "
                f"{html_path}"
            )

        html = self.read_html(
            html_path
        )

        try:
            parsed = (
                parse_canon_html(
                    html
                )
            )
        except CanonParseError as exc:
            raise CommandError(
                str(
                    exc
                )
            ) from exc

        if title_override:
            parsed[
                "title"
            ] = (
                title_override
            )

        if not parsed[
            "title"
        ]:
            raise CommandError(
                "Не найдено название "
                "канона."
            )

        self.print_report(
            html_path,
            parsed,
        )

        if check_only:
            self.stdout.write(
                ""
            )

            self.stdout.write(
                self.style.SUCCESS(
                    "CHECK-ONLY: "
                    "структура корректна. "
                    "База данных "
                    "не изменялась."
                )
            )

            return

        self.save_canon(
            slug=slug,
            parsed=parsed,
        )

        self.stdout.write(
            ""
        )

        self.stdout.write(
            self.style.SUCCESS(
                "Канон импортирован "
                "успешно."
            )
        )

    def read_html(
            self,
            path,
    ):
        raw = path.read_bytes()

        for encoding in (
                "utf-8-sig",
                "utf-8",
                "cp1251",
        ):
            try:
                return raw.decode(
                    encoding
                )
            except UnicodeDecodeError:
                continue

        raise CommandError(
            "Не удалось определить "
            "кодировку HTML."
        )

    def print_report(
            self,
            html_path,
            parsed,
    ):
        self.stdout.write(
            ""
        )

        self.stdout.write(
            "=" * 72
        )

        self.stdout.write(
            "ПРОВЕРКА BOOK.HTML КАНОНА"
        )

        self.stdout.write(
            "=" * 72
        )

        self.stdout.write(
            f"Файл: {html_path}"
        )

        self.stdout.write(
            "Название: "
            + parsed[
                "title"
            ]
        )

        self.stdout.write(
            "Глас: "
            + (
                    parsed[
                        "tone"
                    ]
                    or "не указан"
            )
        )

        self.stdout.write(
            "Песни: "
            + ", ".join(
                str(
                    number
                )
                for number
                in parsed[
                    "seen_odes"
                ]
            )
        )

        self.stdout.write(
            "Всего элементов: "
            f"{len(parsed['sections'])}"
        )

        self.stdout.write(
            ""
        )

        for ode_number in EXPECTED_ODES:
            items = [
                item
                for item
                in parsed[
                    "sections"
                ]
                if item[
                       "ode_number"
                   ] == ode_number
            ]

            counts = Counter(
                item[
                    "section_type"
                ]
                for item
                in items
            )

            translated = sum(
                1
                for item
                in items
                if item[
                    "translation"
                ]
            )

            self.stdout.write(
                f"Песнь {ode_number}: "
                f"{len(items)} элементов, "
                f"{translated} с переводом"
            )

            self.stdout.write(
                "  "
                + ", ".join(
                    f"{key}={value}"
                    for (
                        key,
                        value,
                    )
                    in sorted(
                        counts.items()
                    )
                )
            )

        outside = [
            item
            for item
            in parsed[
                "sections"
            ]
            if item[
                   "ode_number"
               ] is None
        ]

        if outside:
            self.stdout.write(
                ""
            )

            self.stdout.write(
                "Отдельные разделы / заголовки вне песен:"
            )

            for item in outside:
                self.stdout.write(
                    "  "
                    + (
                            item[
                                "heading"
                            ]
                            or
                            SECTION_LABELS.get(
                                item[
                                    "section_type"
                                ],
                                item[
                                    "section_type"
                                ],
                            )
                    )
                )

    @transaction.atomic
    def save_canon(
            self,
            slug,
            parsed,
    ):
        canon, created = (
            Canon.objects
            .update_or_create(
                slug=slug,
                defaults={
                    "title":
                        parsed[
                            "title"
                        ],

                    "tone":
                        parsed[
                            "tone"
                        ],

                    "is_visible":
                        True,
                },
            )
        )

        old_sections = list(
            CanonSection.objects
            .filter(
                canon=canon,
                variant=1,
            )
            .values(
                "id",
                "order",
                "text_id",
            )
        )

        old_text_ids = {
            row[
                "text_id"
            ]
            for row
            in old_sections
        }

        desired_orders = set()

        canon_hash = (
            hashlib.sha1(
                slug.encode(
                    "utf-8"
                )
            )
            .hexdigest()[
                :10
            ]
        )

        for item in parsed[
            "sections"
        ]:
            order = int(
                item[
                    "order"
                ]
            )

            desired_orders.add(
                order
            )

            text_slug = (
                f"canon-"
                f"{canon_hash}-"
                f"{order}"
            )

            text_title = (
                    item[
                        "heading"
                    ]
                    or
                    self.make_text_title(
                        item
                    )
            )

            text_object, _ = (
                Text.objects
                .update_or_create(
                    slug=text_slug,
                    defaults={
                        "title":
                            text_title[
                                :255
                            ],

                        "content":
                            item[
                                "content"
                            ],

                        "translation":
                            item[
                                "translation"
                            ],

                        "language":
                            "cu",

                        "is_visible":
                            True,
                    },
                )
            )

            CanonSection.objects.update_or_create(
                canon=canon,
                variant=1,
                order=order,
                defaults={
                    "section_type":
                        item[
                            "section_type"
                        ],

                    "ode_number":
                        item[
                            "ode_number"
                        ],

                    "heading":
                        item[
                            "heading"
                        ][
                            :255
                        ],

                    "text":
                        text_object,
                },
            )

        stale = (
            CanonSection.objects
            .filter(
                canon=canon,
                variant=1,
            )
            .exclude(
                order__in=(
                    desired_orders
                )
            )
        )

        stale_text_ids = list(
            stale.values_list(
                "text_id",
                flat=True,
            )
        )

        stale.delete()

        cleanup_ids = (
                old_text_ids
                | set(
            stale_text_ids
        )
        )

        if cleanup_ids:
            Text.objects.filter(
                id__in=cleanup_ids,
                canon_sections__isnull=True,
            ).delete()

        self.stdout.write(
            (
                "Создан Canon."
                if created
                else
                "Обновлён Canon."
            )
        )

        self.stdout.write(
            "Элементов в БД: "
            f"{CanonSection.objects.filter(canon=canon, variant=1).count()}"
        )

    def make_text_title(
            self,
            item,
    ):
        label = (
            SECTION_LABELS.get(
                item[
                    "section_type"
                ],
                "Текст",
            )
        )

        if item[
            "ode_number"
        ]:
            return (
                f"Песнь "
                f"{item['ode_number']} — "
                f"{label}"
            )

        return label
