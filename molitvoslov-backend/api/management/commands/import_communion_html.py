import hashlib
from pathlib import Path

from django.core.management.base import (
    BaseCommand,
    CommandError,
)
from django.db import transaction

from api.communion_html_parser import (
    CommunionParseError,
    parse_communion_html,
)
from api.models import (
    PrayerRule,
    PrayerRuleItem,
    Text,
)


DEFAULT_SLUG = (
    "posledovanie-ko-svyatomu-prichashcheniyu"
)


class Command(BaseCommand):
    help = (
        "Проверяет или импортирует HTML-страницу "
        "Последования ко Святому Причащению."
    )

    def add_arguments(
            self,
            parser,
    ):
        parser.add_argument(
            "--html",
            required=True,
            help=(
                "Путь к сохранённому HTML "
                "страницы."
            ),
        )

        parser.add_argument(
            "--slug",
            default=DEFAULT_SLUG,
            help=(
                "Slug PrayerRule. "
                f"По умолчанию: {DEFAULT_SLUG}"
            ),
        )

        parser.add_argument(
            "--title",
            default="",
            help=(
                "При необходимости переопределить "
                "название."
            ),
        )

        parser.add_argument(
            "--check-only",
            action="store_true",
            help=(
                "Только проверить структуру, "
                "не изменяя БД."
            ),
        )

    def handle(
            self,
            *args,
            **options,
    ):
        html_path = Path(
            options["html"]
        )

        if not html_path.exists():
            raise CommandError(
                "Файл не найден: "
                f"{html_path}"
            )

        raw_html = (
            html_path.read_text(
                encoding="utf-8",
                errors="replace",
            )
        )

        try:
            parsed = (
                parse_communion_html(
                    raw_html
                )
            )
        except CommunionParseError as error:
            raise CommandError(
                str(
                    error
                )
            ) from error

        if options["title"]:
            parsed["title"] = (
                options["title"]
            )

        self._print_report(
            html_path,
            parsed,
        )

        if options["check_only"]:
            self.stdout.write("")
            self.stdout.write(
                self.style.SUCCESS(
                    "CHECK-ONLY: структура корректна. "
                    "База данных не изменялась."
                )
            )

            return

        self._save(
            slug=options[
                "slug"
            ],
            parsed=parsed,
        )

    def _print_report(
            self,
            html_path,
            parsed,
    ):
        items = parsed[
            "items"
        ]

        sections = [
            item
            for item
            in items
            if item[
                   "item_type"
               ] == "section"
        ]

        instructions = [
            item
            for item
            in items
            if item[
                   "item_type"
               ] == "instruction"
        ]

        texts = [
            item
            for item
            in items
            if item[
                   "item_type"
               ] == "text"
        ]

        translated = [
            item
            for item
            in texts
            if item[
                "translation"
            ]
        ]

        self.stdout.write("")
        self.stdout.write(
            "=" * 72
        )

        self.stdout.write(
            "ПРОВЕРКА HTML ПОСЛЕДОВАНИЯ"
        )

        self.stdout.write(
            "=" * 72
        )

        self.stdout.write(
            f"Файл: {html_path}"
        )

        self.stdout.write(
            "Название: "
            f"{parsed['title']}"
        )

        self.stdout.write(
            "Вариант: мужской "
            "(section.type-male)"
        )

        self.stdout.write(
            "Всего элементов: "
            f"{len(items)}"
        )

        self.stdout.write(
            "Разделов: "
            f"{len(sections)}"
        )

        self.stdout.write(
            "Текстовых блоков: "
            f"{len(texts)}"
        )

        self.stdout.write(
            "С русским переводом: "
            f"{len(translated)}"
        )

        self.stdout.write(
            "Рубрик / инструкций: "
            f"{len(instructions)}"
        )

        self.stdout.write("")
        self.stdout.write(
            "Разделы:"
        )

        for section in sections:
            self.stdout.write(
                "  "
                + section[
                    "title"
                ]
            )

        if instructions:
            self.stdout.write("")
            self.stdout.write(
                "Рубрики:"
            )

            for item in instructions:
                self.stdout.write(
                    "  "
                    + item[
                        "content"
                    ]
                )

    @transaction.atomic
    def _save(
            self,
            slug,
            parsed,
    ):
        rule, _created = (
            PrayerRule.objects
            .update_or_create(
                slug=slug,
                defaults={
                    "name":
                        parsed[
                            "title"
                        ],

                    "description":
                        (
                            "Последование "
                            "ко Святому Причащению"
                        ),

                    "is_visible":
                        True,
                },
            )
        )

        old_text_ids = list(
            PrayerRuleItem.objects
            .filter(
                rule=rule,
                text__isnull=False,
            )
            .values_list(
                "text_id",
                flat=True,
            )
        )

        PrayerRuleItem.objects.filter(
            rule=rule
        ).delete()

        prefix = (
                "communion-"
                + hashlib.sha1(
            slug.encode(
                "utf-8"
            )
        ).hexdigest()[
                    :10
                ]
                + "-"
        )

        created_items = 0
        created_texts = 0

        for order, item in enumerate(
                parsed[
                    "items"
                ],
                start=1,
        ):
            item_type = item[
                "item_type"
            ]

            if item_type == "text":
                text_slug = (
                    f"{prefix}{order}"
                )

                text_obj, created = (
                    Text.objects
                    .update_or_create(
                        slug=text_slug,
                        defaults={
                            "title":
                                "",

                            "description":
                                "",

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

                if created:
                    created_texts += 1

                PrayerRuleItem.objects.create(
                    rule=rule,
                    item_type=
                    PrayerRuleItem.TYPE_TEXT,
                    text=text_obj,
                    order=order,
                    note=item.get(
                        "note",
                        "",
                    ),
                )

            elif item_type == "section":
                PrayerRuleItem.objects.create(
                    rule=rule,
                    item_type=
                    PrayerRuleItem.TYPE_SECTION,
                    title=item[
                        "title"
                    ],
                    content=item.get(
                        "content",
                        "",
                    ),
                    order=order,
                )

            elif item_type == "instruction":
                PrayerRuleItem.objects.create(
                    rule=rule,
                    item_type=
                    PrayerRuleItem.TYPE_INSTRUCTION,
                    content=item[
                        "content"
                    ],
                    order=order,
                )

            else:
                raise CommandError(
                    "Неизвестный item_type: "
                    f"{item_type}"
                )

            created_items += 1

        # Удаляем только старые служебные Text,
        # которые после переимпорта больше нигде
        # не используются этим правилом.
        if old_text_ids:
            (
                Text.objects
                .filter(
                    id__in=
                    old_text_ids,
                    prayer_rule_items__isnull=
                    True,
                    slug__startswith=
                    prefix,
                )
                .delete()
            )

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                "Импорт завершён."
            )
        )

        self.stdout.write(
            "PrayerRule: "
            f"{rule.slug}"
        )

        self.stdout.write(
            "Элементов создано: "
            f"{created_items}"
        )

        self.stdout.write(
            "Новых Text: "
            f"{created_texts}"
        )
