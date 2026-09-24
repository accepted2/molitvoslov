from django.core.management.base import (
    BaseCommand,
    CommandError,
)
from django.db import transaction

from api.models import (
    PrayerRule,
    PrayerRuleItem,
    Text,
)
from api.thanksgiving_html_parser import (
    parse_thanksgiving_html,
)


class Command(BaseCommand):
    help = (
        'Импорт благодарственных молитв '
        'по Святом Причащении из Book.html'
    )

    def add_arguments(
        self,
        parser,
    ):
        parser.add_argument(
            '--html',
            required=True,
            help='Путь к Book.html',
        )

        parser.add_argument(
            '--variant',
            choices=[
                'male',
                'female',
            ],
            default='male',
            help=(
                'Вариант текста: '
                'male (по умолчанию) '
                'или female'
            ),
        )

        parser.add_argument(
            '--check-only',
            action='store_true',
            help=(
                'Только разобрать HTML '
                'и показать статистику, '
                'не меняя БД'
            ),
        )

    def handle(
        self,
        *args,
        **options,
    ):
        html_path = (
            options['html']
        )

        variant = (
            options['variant']
        )

        try:
            parsed = (
                parse_thanksgiving_html(
                    html_path,
                    variant=variant,
                )
            )

        except FileNotFoundError:
            raise CommandError(
                f'Файл не найден: '
                f'{html_path}'
            )

        except (
            ValueError,
            OSError,
        ) as error:
            raise CommandError(
                str(error)
            )

        self.print_check(
            parsed
        )

        if options[
            'check_only'
        ]:
            self.stdout.write(
                self.style.WARNING(
                    '\nCHECK ONLY: '
                    'база данных '
                    'не изменялась.'
                )
            )

            return

        with transaction.atomic():
            rule = (
                self.import_rule(
                    parsed
                )
            )

        self.stdout.write(
            self.style.SUCCESS(
                '\nИмпорт завершён.\n'
                f'PrayerRule: '
                f'{rule.slug}\n'
                f'Элементов создано: '
                f'{rule.items.count()}'
            )
        )

    def print_check(
        self,
        parsed,
    ):
        items = (
            parsed['items']
        )

        texts = [
            item
            for item in items
            if item['type']
            == 'text'
        ]

        instructions = [
            item
            for item in items
            if item['type']
            == 'instruction'
        ]

        translated = [
            item
            for item in texts
            if item.get(
                'translation'
            )
        ]

        titled = [
            item
            for item in texts
            if item.get(
                'title'
            )
        ]

        self.stdout.write(
            '\n'
            + '=' * 72
        )

        self.stdout.write(
            'ПРОВЕРКА HTML '
            'БЛАГОДАРСТВЕННЫХ '
            'МОЛИТВ'
        )

        self.stdout.write(
            '=' * 72
        )

        self.stdout.write(
            f'Название: '
            f'{parsed["name"]}'
        )

        self.stdout.write(
            f'Вариант: '
            f'{parsed["variant"]}'
        )

        self.stdout.write(
            f'Всего элементов: '
            f'{len(items)}'
        )

        self.stdout.write(
            f'Текстовых блоков: '
            f'{len(texts)}'
        )

        self.stdout.write(
            f'Инструкций / рубрик: '
            f'{len(instructions)}'
        )

        self.stdout.write(
            f'С русским переводом: '
            f'{len(translated)}'
        )

        self.stdout.write(
            '\nЗаголовки:'
        )

        for item in titled:
            self.stdout.write(
                f'  {item["title"]}'
            )

    def import_rule(
        self,
        parsed,
    ):
        rule, _created = (
            PrayerRule.objects
            .update_or_create(
                slug=parsed['slug'],
                defaults={
                    'name':
                        parsed['name'],

                    'description':
                        '',

                    'is_visible':
                        True,
                },
            )
        )

        # Повторный запуск команды безопасен:
        # заменяем только структуру этого правила.
        rule.items.all().delete()
        rule.footnotes.all().delete()

        for item in parsed[
            'items'
        ]:
            if (
                item['type']
                == 'instruction'
            ):
                (
                    PrayerRuleItem
                    .objects
                    .create(
                        rule=rule,
                        item_type=(
                            PrayerRuleItem
                            .TYPE_INSTRUCTION
                        ),
                        content=(
                            item['content']
                        ),
                        order=(
                            item['order']
                        ),
                    )
                )

                continue

            text = (
                self.get_or_create_text(
                    item
                )
            )

            (
                PrayerRuleItem
                .objects
                .create(
                    rule=rule,
                    item_type=(
                        PrayerRuleItem
                        .TYPE_TEXT
                    ),
                    text=text,
                    note=(
                        item.get(
                            'note',
                            ''
                        )
                    ),
                    order=(
                        item['order']
                    ),
                )
            )

        return rule

    def get_or_create_text(
        self,
        item,
    ):
        title = (
            item.get(
                'title',
                ''
            )
            or ''
        ).strip()

        content = (
            item['content']
        ).strip()

        translation = (
            item.get(
                'translation',
                ''
            )
            or ''
        ).strip()

        # Используем только Text с тем же заголовком.
        # Иначе общий текст вроде "Отче наш" может
        # неожиданно получить чужой заголовок в этом правиле.
        candidates = (
            Text.objects
            .filter(
                content=content,
                language='cu',
            )
            .order_by('id')
        )

        text = None

        for candidate in candidates:
            candidate_title = (
                candidate.title
                or ''
            ).strip()

            if (
                candidate_title
                == title
            ):
                text = candidate
                break

        if text is None:
            text = Text.objects.create(
                title=title,
                content=content,
                translation=translation,
                language='cu',
                is_visible=True,
            )

            return text

        changed_fields = []

        if (
            translation
            and text.translation
            != translation
        ):
            text.translation = (
                translation
            )

            changed_fields.append(
                'translation'
            )

        if not text.is_visible:
            text.is_visible = True

            changed_fields.append(
                'is_visible'
            )

        if changed_fields:
            text.save(
                update_fields=
                    changed_fields
            )

        return text
