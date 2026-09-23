import re

import requests
from bs4 import BeautifulSoup

from django.core.management.base import BaseCommand
from django.db import transaction

from api.models import (
    Akathist,
    AkathistSection,
    Text,
)


SOURCE_URL = (
    'https://azbyka.ru/bogosluzhenie/'
    'kanon-s-akafistom-svyatitelyu-i-chudotvorczu-nikolayu/'
)

AKATHIST_SLUG = 'akafist-svyatitelyu-nikolayu'

AKATHIST_TITLE = (
    'Акафист святителю Николаю Чудотворцу'
)


class Command(BaseCommand):
    help = (
        'Импортирует акафист святителю Николаю '
        'с церковнославянским текстом '
        'и русским переводом'
    )

    def handle(self, *args, **options):
        self.stdout.write(
            'Загружаю источник...'
        )

        html = self.download_page()

        self.stdout.write(
            'Разбираю страницу...'
        )

        sections = self.parse_page(
            html
        )

        self.stdout.write(
            f'Найдено исходных разделов: '
            f'{len(sections)}'
        )

        sections = self.normalize_sections(
            sections
        )

        self.stdout.write(
            f'После нормализации: '
            f'{len(sections)}'
        )

        self.validate_sections(
            sections
        )

        with transaction.atomic():
            akathist = self.save_akathist(
                sections
            )

        self.stdout.write(
            self.style.SUCCESS(
                '\nИмпорт завершён успешно.'
            )
        )

        self.stdout.write(
            f'Акафист: '
            f'{akathist.title}'
        )

        self.stdout.write(
            f'Разделов в БД: '
            f'{akathist.sections.count()}'
        )

        self.stdout.write(
            '\nПоследние разделы:'
        )

        final_sections = (
            akathist.sections
            .select_related('text')
            .order_by('order')
        )

        for section in final_sections:
            if section.order >= 23:
                note = (
                    f' | {section.note}'
                    if section.note
                    else ''
                )

                self.stdout.write(
                    f'{section.order}: '
                    f'{section.get_section_type_display()} '
                    f'{section.number or ""}'
                    f'{note}'
                )

        self.stdout.write(
            '\nAPI: '
            f'/api/akathists/'
            f'{akathist.slug}/'
        )

    # =====================================================
    # ЗАГРУЗКА
    # =====================================================

    def download_page(self):
        response = requests.get(
            SOURCE_URL,
            headers={
                'User-Agent': (
                    'Mozilla/5.0 '
                    'MolitvoslovImporter/1.0'
                )
            },
            timeout=30,
        )

        response.raise_for_status()

        return response.text

    # =====================================================
    # ПАРСИНГ
    # =====================================================

    def parse_page(self, html):
        soup = BeautifulSoup(
            html,
            'html.parser'
        )

        rows = soup.select('tr')

        if not rows:
            raise RuntimeError(
                'На странице не найдена таблица '
                'с параллельным текстом.'
            )

        sections = []

        current = None

        in_akathist = False

        prayer_number = 0

        for row in rows:
            cells = row.find_all(
                ['td', 'th'],
                recursive=False
            )

            if not cells:
                continue

            left = ''
            right = ''

            if len(cells) >= 1:
                left = self.clean_text(
                    cells[0].get_text(
                        '\n',
                        strip=True
                    )
                )

            if len(cells) >= 2:
                right = self.clean_text(
                    cells[1].get_text(
                        '\n',
                        strip=True
                    )
                )

            combined = self.clean_text(
                f'{left}\n{right}'
            )

            # =================================================
            # ИЩЕМ НАЧАЛО АКАФИСТА
            # =================================================

            if not in_akathist:
                if self.is_akathist_heading(
                        combined
                ):
                    in_akathist = True

                continue

            # =================================================
            # КОНДАК 13 МОЖЕТ БЫТЬ
            # В СЕРЕДИНЕ ЯЧЕЙКИ
            # =================================================

            embedded_13 = (
                self.extract_embedded_kontakion_13(
                    left,
                    right,
                )
            )

            if embedded_13:
                if current:
                    left_before = (
                        embedded_13[
                            'left_before'
                        ]
                    )

                    right_before = (
                        embedded_13[
                            'right_before'
                        ]
                    )

                    if left_before:
                        current[
                            'content_parts'
                        ].append(
                            left_before
                        )

                    if right_before:
                        current[
                            'translation_parts'
                        ].append(
                            right_before
                        )

                    self.finish_section(
                        sections,
                        current
                    )

                current = {
                    'type':
                        'kontakion',

                    'number':
                        13,

                    'content_parts':
                        [],

                    'translation_parts':
                        [],

                    'note':
                        'Читается трижды',
                }

                left_after = (
                    embedded_13[
                        'left_after'
                    ]
                )

                right_after = (
                    embedded_13[
                        'right_after'
                    ]
                )

                if left_after:
                    current[
                        'content_parts'
                    ].append(
                        left_after
                    )

                if right_after:
                    current[
                        'translation_parts'
                    ].append(
                        right_after
                    )

                continue

            # =================================================
            # УКАЗАНИЕ "ТРИЖДЫ"
            # =================================================

            if (
                    current
                    and
                    current['type']
                    == 'kontakion'
                    and
                    current['number']
                    == 13
                    and
                    self.is_three_times_note(
                        combined
                    )
            ):
                current['note'] = (
                    'Читается трижды'
                )

                if left:
                    current[
                        'content_parts'
                    ].append(
                        left
                    )

                if right:
                    current[
                        'translation_parts'
                    ].append(
                        right
                    )

                continue

            # =================================================
            # ОБЫЧНЫЙ КОНДАК / ИКОС
            # =================================================

            section_match = re.match(
                r'^\s*'
                r'(Кондак|Икос)'
                r'\s*(\d+)'
                r'\s*[:.]?\s*',
                left,
                flags=re.IGNORECASE,
            )

            if section_match:
                if current:
                    self.finish_section(
                        sections,
                        current
                    )

                section_word = (
                    section_match
                    .group(1)
                    .lower()
                )

                number = int(
                    section_match.group(2)
                )

                section_type = (
                    'kontakion'
                    if section_word == 'кондак'
                    else 'ikos'
                )

                left_content = (
                    left[
                        section_match.end():
                    ]
                    .strip()
                )

                right_content = (
                    self.remove_section_heading(
                        right,
                        section_type,
                        number,
                    )
                )

                current = {
                    'type':
                        section_type,

                    'number':
                        number,

                    'content_parts':
                        [],

                    'translation_parts':
                        [],

                    'note':
                        '',
                }

                if left_content:
                    current[
                        'content_parts'
                    ].append(
                        left_content
                    )

                if right_content:
                    current[
                        'translation_parts'
                    ].append(
                        right_content
                    )

                continue

            # =================================================
            # МОЛИТВА
            # =================================================

            if self.is_prayer_heading(
                    left
            ):
                if current:
                    self.finish_section(
                        sections,
                        current
                    )

                prayer_number += 1

                current = (
                    self.make_prayer_section(
                        left,
                        right,
                        prayer_number,
                    )
                )

                continue

            # =================================================
            # ОБЫЧНОЕ ПРОДОЛЖЕНИЕ
            # =================================================

            if current:
                if left:
                    current[
                        'content_parts'
                    ].append(
                        left
                    )

                if right:
                    current[
                        'translation_parts'
                    ].append(
                        right
                    )

        if current:
            self.finish_section(
                sections,
                current
            )

        return sections

    # =====================================================
    # НОРМАЛИЗАЦИЯ
    # =====================================================

    def normalize_sections(
            self,
            sections,
    ):
        """
        Приводим результат к структуре:

        Кондак 1
        Икос 1
        ...
        Кондак 12
        Икос 12
        Кондак 13
        Молитва 1
        Молитва 2
        Молитва 3

        Повторные Икос 1 и Кондак 1
        после Кондака 13 здесь убираются.

        Они будут добавлены позднее как
        отдельные AkathistSection со ссылками
        на уже существующие Text.
        """

        normalized = []

        seen_kontakions = set()
        seen_ikoses = set()

        kontakion_13_seen = False

        for section in sections:
            section_type = section[
                'type'
            ]

            number = section[
                'number'
            ]

            # =============================================
            # МОЛИТВЫ
            # =============================================

            if section_type == 'prayer':
                section = section.copy()

                section['content'] = (
                    self.clean_prayer_content(
                        section.get(
                            'content',
                            ''
                        ),
                        number,
                    )
                )

                section['translation'] = (
                    self.clean_prayer_content(
                        section.get(
                            'translation',
                            ''
                        ),
                        number,
                    )
                )

                normalized.append(
                    section
                )

                continue

            # =============================================
            # КОНДАКИ
            # =============================================

            if section_type == 'kontakion':
                if kontakion_13_seen:
                    continue

                if number in seen_kontakions:
                    continue

                section = section.copy()

                if number == 13:
                    section['note'] = (
                        'Читается трижды'
                    )

                    section['content'] = (
                        self.clean_kontakion_13(
                            self.clean_repeated_tail(
                                section.get(
                                    'content',
                                    ''
                                )
                            )
                        )
                    )

                    section['translation'] = (
                        self.clean_kontakion_13(
                            self.clean_repeated_tail(
                                section.get(
                                    'translation',
                                    ''
                                )
                            )
                        )
                    )

                    kontakion_13_seen = True

                seen_kontakions.add(
                    number
                )

                normalized.append(
                    section
                )

                continue

            # =============================================
            # ИКОСЫ
            # =============================================

            if section_type == 'ikos':
                if kontakion_13_seen:
                    continue

                if number in seen_ikoses:
                    continue

                section = section.copy()

                if number == 12:
                    section['content'] = (
                        self.clean_repeated_tail(
                            section.get(
                                'content',
                                ''
                            )
                        )
                    )

                    section['translation'] = (
                        self.clean_repeated_tail(
                            section.get(
                                'translation',
                                ''
                            )
                        )
                    )

                seen_ikoses.add(
                    number
                )

                normalized.append(
                    section
                )

        return normalized

    # =====================================================
    # ОЧИСТКА ПОВТОРНОГО ИКОСА 1 / КОНДАКА 1
    # =====================================================

    def clean_repeated_tail(
            self,
            value,
    ):
        if not value:
            return ''

        patterns = [
            r'\bТаже\s+икос\s+1',
            r'\bИ\s+затем\s+икос\s+1',
            r'\bИкос\s+1\s*:',
            r'\bИкос\s+1\s*\.',
        ]

        earliest = None

        for pattern in patterns:
            match = re.search(
                pattern,
                value,
                flags=re.IGNORECASE,
            )

            if not match:
                continue

            if (
                    earliest is None
                    or
                    match.start() < earliest
            ):
                earliest = (
                    match.start()
                )

        if earliest is not None:
            value = value[
                :earliest
            ]

        return value.strip()

    # =====================================================
    # ОЧИСТКА КОНДАКА 13
    # =====================================================

    def clean_kontakion_13(
            self,
            value,
    ):
        """
        Убираем:

        [Трижды.]
        [Трижды]
        (3)

        Эта информация хранится отдельно
        в AkathistSection.note.
        """

        if not value:
            return ''

        value = re.sub(
            r'\s*'
            r'\[\s*Трижды\.?\s*\]'
            r'\s*$',
            '',
            value,
            flags=re.IGNORECASE,
        )

        value = re.sub(
            r'\s*'
            r'\(\s*3\s*\)'
            r'\s*$',
            '',
            value,
        )

        return value.strip()

    # =====================================================
    # КОНДАК 13 В СЕРЕДИНЕ СТРОКИ
    # =====================================================

    def extract_embedded_kontakion_13(
            self,
            left,
            right,
    ):
        pattern = re.compile(
            r'\bКондак\s*13\s*[:.]?\s*',
            flags=re.IGNORECASE,
        )

        left_match = pattern.search(
            left
        )

        right_match = pattern.search(
            right
        )

        if (
                not left_match
                and
                not right_match
        ):
            return None

        left_before = ''
        left_after = ''

        right_before = ''
        right_after = ''

        if left_match:
            left_before = (
                left[
                    :left_match.start()
                ]
                .strip()
            )

            left_after = (
                left[
                    left_match.end():
                ]
                .strip()
            )

        else:
            left_before = (
                left.strip()
            )

        if right_match:
            right_before = (
                right[
                    :right_match.start()
                ]
                .strip()
            )

            right_after = (
                right[
                    right_match.end():
                ]
                .strip()
            )

        else:
            right_before = (
                right.strip()
            )

        return {
            'left_before':
                left_before,

            'left_after':
                left_after,

            'right_before':
                right_before,

            'right_after':
                right_after,
        }

    # =====================================================
    # МОЛИТВЫ
    # =====================================================

    def make_prayer_section(
            self,
            left,
            right,
            number,
    ):
        left_content = (
            self.clean_prayer_prefix(
                self.remove_prayer_heading(
                    left
                )
            )
        )

        right_content = (
            self.clean_prayer_prefix(
                self.remove_prayer_heading(
                    right
                )
            )
        )

        current = {
            'type':
                'prayer',

            'number':
                number,

            'content_parts':
                [],

            'translation_parts':
                [],

            'note':
                '',
        }

        if left_content:
            current[
                'content_parts'
            ].append(
                left_content
            )

        if right_content:
            current[
                'translation_parts'
            ].append(
                right_content
            )

        return current

    def is_prayer_heading(
            self,
            value,
    ):
        if not value:
            return False

        first_line = (
            value
            .split(
                '\n',
                1,
            )[0]
            .strip()
            .lower()
        )

        return (
                first_line.startswith(
                    'молитва'
                )
                and
                len(first_line) < 160
        )

    def remove_prayer_heading(
            self,
            value,
    ):
        if not value:
            return ''

        lines = value.splitlines()

        if not lines:
            return ''

        first_line = (
            lines[0]
            .strip()
        )

        match = re.match(
            r'^\s*'
            r'Молитва'
            r'(?:\s+\d+)?'
            r'\s*[:.]?\s*'
            r'(.*)$',
            first_line,
            flags=re.IGNORECASE,
        )

        if not match:
            return value.strip()

        remainder = (
            match
            .group(1)
            .strip()
        )

        remaining_lines = [
            line.strip()
            for line in lines[1:]
            if line.strip()
        ]

        parts = []

        if remainder:
            parts.append(
                remainder
            )

        parts.extend(
            remaining_lines
        )

        return '\n'.join(
            parts
        ).strip()

    def clean_prayer_prefix(
            self,
            value,
    ):
        """
        Удаляет части заголовков источника:

        святому Николаю.
        вторая.
        третия.
        третья.
        """

        if not value:
            return ''

        lines = value.splitlines()

        prefixes = {
            'святому николаю.',
            'святому николаю',
            'вторая.',
            'вторая',
            'третия.',
            'третия',
            'третья.',
            'третья',
        }

        while lines:
            first_line = (
                lines[0]
                .strip()
            )

            if (
                    first_line.lower()
                    not in prefixes
            ):
                break

            lines = lines[1:]

        return '\n'.join(
            lines
        ).strip()

    def clean_prayer_content(
            self,
            value,
            number,
    ):
        """
        Окончательная очистка молитвы.

        У первой/второй молитвы убираются
        только служебные заголовки.

        У третьей молитвы дополнительно
        отрезается всё последующее
        чинопоследование:

        Таже:
        Достойно есть...
        Трисвятое...
        Тропарь...
        Богородичен...

        Это уже не относится к самой
        третьей молитве.
        """

        if not value:
            return ''

        value = self.clean_prayer_prefix(
            value
        )

        if number != 3:
            return value.strip()

        patterns = [
            r'(?m)^\s*Таже\s*:\s*$',
            r'(?m)^\s*Затем\s*:\s*$',
        ]

        earliest = None

        for pattern in patterns:
            match = re.search(
                pattern,
                value,
                flags=re.IGNORECASE,
            )

            if not match:
                continue

            if (
                    earliest is None
                    or
                    match.start() < earliest
            ):
                earliest = (
                    match.start()
                )

        if earliest is not None:
            value = value[
                :earliest
            ]

        return value.strip()

    # =====================================================
    # ВАЛИДАЦИЯ
    # =====================================================

    def validate_sections(
            self,
            sections,
    ):
        kontakions = [
            section
            for section in sections
            if section['type']
               == 'kontakion'
        ]

        ikoses = [
            section
            for section in sections
            if section['type']
               == 'ikos'
        ]

        prayers = [
            section
            for section in sections
            if section['type']
               == 'prayer'
        ]

        kontakion_numbers = [
            section['number']
            for section in kontakions
        ]

        ikos_numbers = [
            section['number']
            for section in ikoses
        ]

        expected_kontakions = list(
            range(1, 14)
        )

        expected_ikoses = list(
            range(1, 13)
        )

        if (
                kontakion_numbers
                != expected_kontakions
        ):
            raise ValueError(
                '\nНеверно разобраны Кондаки.\n'
                f'Получено: '
                f'{kontakion_numbers}\n'
                f'Ожидалось: '
                f'{expected_kontakions}'
            )

        if (
                ikos_numbers
                != expected_ikoses
        ):
            raise ValueError(
                '\nНеверно разобраны Икосы.\n'
                f'Получено: '
                f'{ikos_numbers}\n'
                f'Ожидалось: '
                f'{expected_ikoses}'
            )

        kontakion_13 = next(
            (
                section
                for section in kontakions
                if section['number'] == 13
            ),
            None,
        )

        if not kontakion_13:
            raise ValueError(
                'Кондак 13 не найден.'
            )

        if not kontakion_13[
            'content'
        ]:
            raise ValueError(
                'Кондак 13 найден, '
                'но его текст пуст.'
            )

        if not kontakion_13[
            'translation'
        ]:
            raise ValueError(
                'У Кондака 13 '
                'нет русского перевода.'
            )

        if (
                '[Трижды'
                in kontakion_13[
            'content'
        ]
        ):
            raise ValueError(
                'В Кондаке 13 '
                'осталась пометка [Трижды].'
            )

        if re.search(
                r'\(\s*3\s*\)',
                kontakion_13[
                    'translation'
                ],
        ):
            raise ValueError(
                'В переводе Кондака 13 '
                'осталась пометка (3).'
            )

        kontakion_13['note'] = (
            'Читается трижды'
        )

        # =================================================
        # ПРОВЕРКА ИКОСА 12
        # =================================================

        ikos_12 = next(
            (
                section
                for section in ikoses
                if section['number'] == 12
            ),
            None,
        )

        if ikos_12:
            combined = (
                    ikos_12.get(
                        'content',
                        ''
                    )
                    +
                    '\n'
                    +
                    ikos_12.get(
                        'translation',
                        ''
                    )
            ).lower()

            suspicious = [
                'таже икос 1',
                'и затем икос 1',
                'икос 1:',
            ]

            for marker in suspicious:
                if marker in combined:
                    raise ValueError(
                        'В Икосе 12 '
                        'остался повторный Икос 1.'
                    )

        # =================================================
        # ПРОВЕРКА МОЛИТВ
        # =================================================

        for prayer in prayers:
            beginning = (
                prayer.get(
                    'content',
                    ''
                )
                .strip()
                .lower()
            )

            bad_prefixes = (
                'святому николаю',
                'вторая',
                'третия',
                'третья',
            )

            if beginning.startswith(
                    bad_prefixes
            ):
                raise ValueError(
                    'В начале Молитвы '
                    f'{prayer["number"]} '
                    'остался служебный заголовок.'
                )

        prayer_3 = next(
            (
                prayer
                for prayer in prayers
                if prayer['number'] == 3
            ),
            None,
        )

        if prayer_3:
            combined = (
                    prayer_3.get(
                        'content',
                        ''
                    )
                    +
                    '\n'
                    +
                    prayer_3.get(
                        'translation',
                        ''
                    )
            ).lower()

            forbidden = [
                'таже:',
                'затем:',
                'достойно есть',
                'трисвятое',
                'тропарь, глас 4',
                'богородичен',
            ]

            for marker in forbidden:
                if marker in combined:
                    raise ValueError(
                        'После третьей молитвы '
                        'остался текст '
                        'последующего чинопоследования: '
                        f'{marker}'
                    )

        self.stdout.write(
            self.style.SUCCESS(
                'Проверка структуры пройдена.'
            )
        )

        self.stdout.write(
            f'Кондаков: '
            f'{len(kontakions)}'
        )

        self.stdout.write(
            f'Икосов: '
            f'{len(ikoses)}'
        )

        self.stdout.write(
            f'Молитв: '
            f'{len(prayers)}'
        )

        if not prayers:
            self.stdout.write(
                self.style.WARNING(
                    'Молитвы после акафиста '
                    'не найдены.'
                )
            )

    # =====================================================
    # СОХРАНЕНИЕ
    # =====================================================

    def save_akathist(
            self,
            sections,
    ):
        akathist, _ = (
            Akathist.objects
            .update_or_create(
                slug=AKATHIST_SLUG,
                defaults={
                    'title':
                        AKATHIST_TITLE,

                    'description':
                        (
                            'Акафист святителю '
                            'Николаю Чудотворцу'
                        ),

                    'is_visible':
                        True,
                }
            )
        )

        # Секции пересоздаём.
        # Сами Text обновляются по стабильному slug.

        AkathistSection.objects.filter(
            akathist=akathist
        ).delete()

        text_objects = {}

        # =================================================
        # СОЗДАЁМ / ОБНОВЛЯЕМ TEXT
        # =================================================

        for section in sections:
            section_type = (
                section['type']
            )

            number = (
                section['number']
            )

            key = (
                section_type,
                number,
            )

            text_slug = (
                f'{AKATHIST_SLUG}-'
                f'{section_type}-'
                f'{number}'
            )

            title = self.make_title(
                section_type,
                number,
            )

            text_object, _ = (
                Text.objects.update_or_create(
                    slug=text_slug,
                    defaults={
                        'title':
                            title,

                        'description':
                            '',

                        'content':
                            section[
                                'content'
                            ],

                        'translation':
                            section[
                                'translation'
                            ],

                        'language':
                            'cu',

                        'description_position':
                            'before',

                        'is_visible':
                            True,
                    }
                )
            )

            text_objects[key] = (
                text_object
            )

        # =================================================
        # ОСНОВНАЯ ЧАСТЬ АКАФИСТА
        # =================================================

        order = 1

        prayers = []

        for section in sections:
            if (
                    section['type']
                    == 'prayer'
            ):
                prayers.append(
                    section
                )

                continue

            key = (
                section['type'],
                section['number'],
            )

            AkathistSection.objects.create(
                akathist=akathist,

                section_type=(
                    section['type']
                ),

                number=(
                    section['number']
                ),

                text=(
                    text_objects[key]
                ),

                note=(
                    section['note']
                ),

                order=order,
            )

            order += 1

        # =================================================
        # ПОВТОРНЫЙ ИКОС 1
        #
        # Используем тот же Text.
        # =================================================

        ikos_1_text = (
            text_objects.get(
                (
                    'ikos',
                    1,
                )
            )
        )

        if not ikos_1_text:
            raise ValueError(
                'Не найден Text '
                'для Икоса 1.'
            )

        AkathistSection.objects.create(
            akathist=akathist,
            section_type='ikos',
            number=1,
            text=ikos_1_text,
            note='',
            order=order,
        )

        order += 1

        # =================================================
        # ПОВТОРНЫЙ КОНДАК 1
        #
        # Используем тот же Text.
        # =================================================

        kontakion_1_text = (
            text_objects.get(
                (
                    'kontakion',
                    1,
                )
            )
        )

        if not kontakion_1_text:
            raise ValueError(
                'Не найден Text '
                'для Кондака 1.'
            )

        AkathistSection.objects.create(
            akathist=akathist,
            section_type='kontakion',
            number=1,
            text=kontakion_1_text,
            note='',
            order=order,
        )

        order += 1

        # =================================================
        # МОЛИТВЫ
        # =================================================

        for section in prayers:
            key = (
                'prayer',
                section['number'],
            )

            text_object = (
                text_objects.get(
                    key
                )
            )

            if not text_object:
                raise ValueError(
                    'Не найден Text для '
                    f'Молитвы '
                    f'{section["number"]}.'
                )

            AkathistSection.objects.create(
                akathist=akathist,

                section_type='prayer',

                number=(
                    section['number']
                ),

                text=text_object,

                note=(
                    section['note']
                ),

                order=order,
            )

            order += 1

        return akathist

    # =====================================================
    # ЗАВЕРШЕНИЕ СЕКЦИИ
    # =====================================================

    def finish_section(
            self,
            sections,
            current,
    ):
        content = self.join_parts(
            current[
                'content_parts'
            ]
        )

        translation = self.join_parts(
            current[
                'translation_parts'
            ]
        )

        if not content:
            return

        sections.append({
            'type':
                current['type'],

            'number':
                current['number'],

            'content':
                content,

            'translation':
                translation,

            'note':
                current['note'],
        })

    # =====================================================
    # ОБЩИЕ МЕТОДЫ
    # =====================================================

    def join_parts(
            self,
            parts,
    ):
        cleaned = []

        for part in parts:
            part = self.clean_text(
                part
            )

            if not part:
                continue

            cleaned.append(
                part
            )

        return '\n\n'.join(
            cleaned
        )

    def clean_text(
            self,
            value,
    ):
        if not value:
            return ''

        value = value.replace(
            '\xa0',
            ' '
        )

        value = re.sub(
            r'[ \t]+',
            ' ',
            value
        )

        value = re.sub(
            r'\n{3,}',
            '\n\n',
            value
        )

        return value.strip()

    def is_akathist_heading(
            self,
            value,
    ):
        value = (
            value
            .lower()
        )

        return (
                'акафист святителю николаю'
                in value
        )

    def is_three_times_note(
            self,
            value,
    ):
        if not value:
            return False

        value = (
            value
            .lower()
        )

        return (
                'трижды'
                in value
                or
                bool(
                    re.search(
                        r'\(\s*3\s*\)',
                        value
                    )
                )
        )

    def remove_section_heading(
            self,
            value,
            section_type,
            number,
    ):
        if not value:
            return ''

        if (
                section_type
                == 'kontakion'
        ):
            word = 'Кондак'

        else:
            word = 'Икос'

        pattern = (
            rf'^\s*'
            rf'{word}'
            rf'\s*{number}'
            rf'\s*[:.]?\s*'
        )

        return re.sub(
            pattern,
            '',
            value,
            count=1,
            flags=re.IGNORECASE,
        ).strip()

    # =====================================================
    # ЗАГОЛОВКИ TEXT
    # =====================================================

    def make_title(
            self,
            section_type,
            number,
    ):
        if (
                section_type
                == 'kontakion'
        ):
            return (
                f'Кондак {number}'
            )

        if (
                section_type
                == 'ikos'
        ):
            return (
                f'Икос {number}'
            )

        return (
            f'Молитва {number}'
        )