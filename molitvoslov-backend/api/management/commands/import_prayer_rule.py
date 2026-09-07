import json
import re

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from slugify import slugify

from api.models import (
    Text,
    PrayerRule,
    PrayerRuleItem,
    PrayerRuleFootnote,
)


class Command(BaseCommand):
    help = 'Импорт молитвенного правила из structured JSON'

    def add_arguments(self, parser):
        parser.add_argument(
            'json_path',
            type=str,
            help='Путь к JSON-файлу'
        )

        parser.add_argument(
            '--replace',
            action='store_true',
            help='Удалить существующие элементы правила перед импортом'
        )

    def handle(self, *args, **options):
        json_path = options['json_path']
        replace = options['replace']

        try:
            with open(
                    json_path,
                    'r',
                    encoding='utf-8'
            ) as file:
                data = json.load(file)

        except FileNotFoundError:
            raise CommandError(
                f'Файл не найден: {json_path}'
            )

        except json.JSONDecodeError as error:
            raise CommandError(
                f'Ошибка JSON: {error}'
            )

        self.validate_data(data)

        with transaction.atomic():
            rule = self.import_rule(
                data=data,
                replace=replace
            )

        self.stdout.write(
            self.style.SUCCESS(
                f'Импорт завершён: {rule.name}'
            )
        )

    # =========================================================
    # ВАЛИДАЦИЯ
    # =========================================================

    def validate_data(self, data):
        if 'rule' not in data:
            raise CommandError(
                'В JSON отсутствует объект "rule".'
            )

        if not data['rule'].get('name'):
            raise CommandError(
                'В rule отсутствует name.'
            )

        if 'items' not in data:
            raise CommandError(
                'В JSON отсутствует массив "items".'
            )

    # =========================================================
    # ПРАВИЛО
    # =========================================================

    def import_rule(self, data, replace=False):
        rule_data = data['rule']

        name = rule_data['name'].strip()

        slug = rule_data.get('slug')

        if not slug:
            slug = slugify(name)

        rule, created = PrayerRule.objects.get_or_create(
            slug=slug,
            defaults={
                'name': name,
                'description': rule_data.get(
                    'description',
                    ''
                ),
                'is_visible': True,
            }
        )

        if not created:
            rule.name = name

            if 'description' in rule_data:
                rule.description = (
                    rule_data['description']
                )

            rule.save()

        if replace:
            rule.items.all().delete()
            rule.footnotes.all().delete()

        elif rule.items.exists():
            raise CommandError(
                f'Правило "{rule.name}" уже содержит элементы. '
                f'Используй --replace для повторного импорта.'
            )

        # Сначала создаём сноски,
        # чтобы потом можно было привязать их к item.
        footnote_map = self.import_footnotes(
            rule=rule,
            footnotes=data.get(
                'footnotes',
                []
            )
        )

        self.import_items(
            rule=rule,
            items=data['items'],
            footnote_map=footnote_map,
        )

        return rule

    # =========================================================
    # СНОСКИ
    # =========================================================

    def import_footnotes(
            self,
            rule,
            footnotes
    ):
        footnote_map = {}

        for raw_footnote in footnotes:
            raw_footnote = raw_footnote.strip()

            match = re.match(
                r'^\[(\d+)\]\s*(.*)$',
                raw_footnote,
                flags=re.DOTALL
            )

            if not match:
                self.stdout.write(
                    self.style.WARNING(
                        'Не удалось распознать сноску: '
                        f'{raw_footnote}'
                    )
                )
                continue

            number = int(
                match.group(1)
            )

            content = (
                match.group(2)
                .strip()
            )

            footnote = (
                PrayerRuleFootnote.objects.create(
                    rule=rule,
                    number=number,
                    content=content,
                )
            )

            footnote_map[number] = footnote

            self.stdout.write(
                f'  FOOTNOTE [{number}]'
            )

        return footnote_map

    # =========================================================
    # РАБОТА С МАРКЕРАМИ [1], [2]...
    # =========================================================

    def extract_footnotes(self, value):
        """
        Возвращает:

        cleaned_text,
        [1, 2, ...]

        Например:

        "Молитва[2]"
        →

        "Молитва",
        [2]
        """

        if not value:
            return '', []

        numbers = [
            int(number)
            for number in re.findall(
                r'\[(\d+)\]',
                value
            )
        ]

        cleaned = re.sub(
            r'\[(\d+)\]',
            '',
            value
        )

        # После удаления маркеров убираем
        # случайные двойные пробелы.
        cleaned = re.sub(
            r'[ \t]{2,}',
            ' ',
            cleaned
        )

        return cleaned.strip(), numbers

    def attach_footnotes(
            self,
            rule_item,
            numbers,
            footnote_map
    ):
        for number in sorted(set(numbers)):

            footnote = footnote_map.get(
                number
            )

            if footnote is None:
                self.stdout.write(
                    self.style.WARNING(
                        f'Элемент #{rule_item.order}: '
                        f'ссылка [{number}] есть, '
                        f'но сама сноска не найдена.'
                    )
                )
                continue

            rule_item.footnotes.add(
                footnote
            )

    # =========================================================
    # ITEMS
    # =========================================================

    def import_items(
            self,
            rule,
            items,
            footnote_map
    ):
        for item_data in items:
            item_type = item_data.get(
                'type',
                'text'
            )

            order = item_data.get(
                'order'
            )

            if order is None:
                raise CommandError(
                    f'У элемента отсутствует order: '
                    f'{item_data}'
                )

            if item_type == 'text':
                self.import_text_item(
                    rule=rule,
                    item_data=item_data,
                    order=order,
                    footnote_map=footnote_map,
                )

            elif item_type == 'instruction':
                self.import_instruction_item(
                    rule=rule,
                    item_data=item_data,
                    order=order,
                    footnote_map=footnote_map,
                )

            elif item_type == 'section':
                self.import_section_item(
                    rule=rule,
                    item_data=item_data,
                    order=order,
                    footnote_map=footnote_map,
                )

            else:
                raise CommandError(
                    f'Неизвестный type '
                    f'"{item_type}" '
                    f'у элемента #{order}.'
                )

    # =========================================================
    # TEXT
    # =========================================================

    def import_text_item(
            self,
            rule,
            item_data,
            order,
            footnote_map
    ):
        raw_title = item_data.get(
            'title',
            ''
        )

        raw_description = item_data.get(
            'description',
            ''
        )

        raw_content = item_data.get(
            'content',
            ''
        )

        raw_note = item_data.get(
            'note',
            ''
        )

        title, title_refs = (
            self.extract_footnotes(
                raw_title
            )
        )

        description, description_refs = (
            self.extract_footnotes(
                raw_description
            )
        )

        content, content_refs = (
            self.extract_footnotes(
                raw_content
            )
        )

        note, note_refs = (
            self.extract_footnotes(
                raw_note
            )
        )

        all_refs = (
                title_refs
                + description_refs
                + content_refs
                + note_refs
        )

        if not content:
            raise CommandError(
                f'Пустой text у элемента #{order}.'
            )

        description_position = (
            item_data.get(
                'description_position',
                'before'
            )
        )

        # -----------------------------------------------------
        # Ищем уже существующий канонический Text
        # -----------------------------------------------------

        text = (
            Text.objects
            .filter(
                content=content,
                language='cu'
            )
            .first()
        )

        if text:
            changed = False

            if (
                    title
                    and not text.title
            ):
                text.title = title
                changed = True

            if (
                    description
                    and not text.description
            ):
                text.description = (
                    description
                )
                changed = True

            if changed:
                text.save()

        else:
            text = Text.objects.create(
                title=title,
                description=description,
                description_position=description_position,
                content=content,
                language='cu',
                is_visible=True,
            )

        rule_item = (
            PrayerRuleItem.objects.create(
                rule=rule,
                item_type=PrayerRuleItem.TYPE_TEXT,
                text=text,
                order=order,
                note=note,
            )
        )

        self.attach_footnotes(
            rule_item=rule_item,
            numbers=all_refs,
            footnote_map=footnote_map,
        )

        self.stdout.write(
            f'  TEXT #{order}: '
            f'{text.title or text.content[:50]}'
        )

    # =========================================================
    # INSTRUCTION
    # =========================================================

    def import_instruction_item(
            self,
            rule,
            item_data,
            order,
            footnote_map
    ):
        raw_content = item_data.get(
            'content',
            ''
        )

        content, refs = (
            self.extract_footnotes(
                raw_content
            )
        )

        if not content:
            raise CommandError(
                f'Пустая instruction #{order}.'
            )

        rule_item = (
            PrayerRuleItem.objects.create(
                rule=rule,
                item_type=(
                    PrayerRuleItem.TYPE_INSTRUCTION
                ),
                content=content,
                order=order,
            )
        )

        self.attach_footnotes(
            rule_item=rule_item,
            numbers=refs,
            footnote_map=footnote_map,
        )

        self.stdout.write(
            f'  INSTRUCTION #{order}: '
            f'{content[:60]}'
        )

    # =========================================================
    # SECTION
    # =========================================================

    def import_section_item(
            self,
            rule,
            item_data,
            order,
            footnote_map
    ):
        raw_title = item_data.get(
            'title',
            ''
        )

        raw_content = item_data.get(
            'content',
            ''
        )

        title, title_refs = (
            self.extract_footnotes(
                raw_title
            )
        )

        content, content_refs = (
            self.extract_footnotes(
                raw_content
            )
        )

        if not title and not content:
            raise CommandError(
                f'Пустой section #{order}.'
            )

        rule_item = (
            PrayerRuleItem.objects.create(
                rule=rule,
                item_type=(
                    PrayerRuleItem.TYPE_SECTION
                ),
                title=title,
                content=content,
                order=order,
            )
        )

        self.attach_footnotes(
            rule_item=rule_item,
            numbers=(
                    title_refs
                    + content_refs
            ),
            footnote_map=footnote_map,
        )

        self.stdout.write(
            f'  SECTION #{order}: '
            f'{title or content[:60]}'
        )