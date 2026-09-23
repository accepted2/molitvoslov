import json
import re
import unicodedata
from pathlib import Path

import requests
from bs4 import BeautifulSoup, Tag
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from api.models import Akathist, AkathistSection, Text


SECTION_TAGS = ('h2', 'h3', 'h4', 'h5', 'h6')

CONTENT_CLASSES = {
    'paint',
    'church',
    'church-slavonic',
    'church_slavonic',
    'slavonic',
}

TRANSLATION_CLASSES = {
    'translate',
    'translation',
    'russian',
    'rus',
}


class Command(BaseCommand):
    help = 'Импортирует один или несколько акафистов с сайта Азбука веры.'

    def add_arguments(self, parser):
        parser.add_argument('--url', help='URL одного акафиста.')
        parser.add_argument('--slug', help='Slug одного акафиста.')
        parser.add_argument('--title', help='Название одного акафиста.')

        parser.add_argument(
            '--manifest',
            help='JSON-файл со списком всех акафистов.',
        )

        parser.add_argument(
            '--check-only',
            action='store_true',
            help='Только разобрать и проверить данные, не записывая их в БД.',
        )

    def handle(self, *args, **options):
        self.check_only = options['check_only']

        items = self.get_import_items(options)

        self.stdout.write(
            f'\nАкафистов для обработки: {len(items)}\n'
        )

        for index, item in enumerate(items, start=1):
            self.stdout.write(
                '\n'
                + '=' * 80
                + f'\n[{index}/{len(items)}] {item["title"]}\n'
                + '=' * 80
            )

            self.import_one(
                url=item['url'],
                slug=item['slug'],
                title=item['title'],
            )

        self.stdout.write(
            self.style.SUCCESS(
                '\n\nВСЕ АКАФИСТЫ УСПЕШНО ОБРАБОТАНЫ.'
            )
        )

    # ======================================================================
    # АРГУМЕНТЫ
    # ======================================================================

    def get_import_items(self, options):
        manifest = options.get('manifest')

        if manifest:
            path = Path(manifest)

            if not path.exists():
                raise CommandError(
                    f'Файл манифеста не найден: {path}'
                )

            try:
                data = json.loads(
                    path.read_text(encoding='utf-8')
                )
            except (OSError, json.JSONDecodeError) as error:
                raise CommandError(
                    f'Не удалось прочитать manifest: {error}'
                ) from error

            if not isinstance(data, list):
                raise CommandError(
                    'Manifest должен содержать JSON-массив.'
                )

            result = []

            for number, item in enumerate(data, start=1):
                if not isinstance(item, dict):
                    raise CommandError(
                        f'Manifest: элемент {number} должен быть объектом.'
                    )

                url = str(item.get('url', '')).strip()
                slug = str(item.get('slug', '')).strip()
                title = str(item.get('title', '')).strip()

                if not url or not slug or not title:
                    raise CommandError(
                        f'Manifest: у элемента {number} должны быть '
                        f'url, slug и title.'
                    )

                result.append({
                    'url': url,
                    'slug': slug,
                    'title': title,
                })

            if not result:
                raise CommandError(
                    'Manifest пуст.'
                )

            return result

        url = (options.get('url') or '').strip()
        slug = (options.get('slug') or '').strip()
        title = (options.get('title') or '').strip()

        if not url or not slug or not title:
            raise CommandError(
                'Укажи либо --manifest, либо одновременно '
                '--url, --slug и --title.'
            )

        return [{
            'url': url,
            'slug': slug,
            'title': title,
        }]

    # ======================================================================
    # ОДИН АКАФИСТ
    # ======================================================================

    def import_one(self, url, slug, title):
        self.source_url = url
        self.akathist_slug = slug
        self.akathist_title = title

        self.stdout.write(f'Источник: {url}')

        html = self.download_page(url)
        soup = BeautifulSoup(html, 'html.parser')

        root = self.find_best_root(soup)

        troparion, kontakion_before = self.parse_preface_hymns(root)

        sections = self.parse_sections(root)

        sections = self.normalize_sections(sections)

        self.validate_sections(sections)

        prayers = [
            section
            for section in sections
            if section['type'] == 'prayer'
        ]

        self.stdout.write(
            f'Молитв после акафиста: {len(prayers)}'
        )

        self.stdout.write(
            f'Тропарь перед акафистом: '
            f'{"ДА" if troparion else "НЕТ"}'
        )

        self.stdout.write(
            f'Кондак перед акафистом: '
            f'{"ДА" if kontakion_before else "НЕТ"}'
        )

        if self.check_only:
            self.print_check_result(sections)
            return

        with transaction.atomic():
            akathist = self.save_akathist(
                sections=sections,
                troparion=troparion,
                kontakion_before=kontakion_before,
            )

        self.stdout.write(
            self.style.SUCCESS(
                f'Сохранено: {akathist.title}'
            )
        )

        self.stdout.write(
            f'ID акафиста: {akathist.id}'
        )

        self.stdout.write(
            f'Секций в БД: {akathist.sections.count()}'
        )

    # ======================================================================
    # HTTP
    # ======================================================================

    def download_page(self, url):
        try:
            response = requests.get(
                url,
                headers={
                    'User-Agent': (
                        'Mozilla/5.0 '
                        '(Windows NT 10.0; Win64; x64) '
                        'AppleWebKit/537.36 '
                        '(KHTML, like Gecko) '
                        'Chrome/153.0.0.0 Safari/537.36'
                    ),
                    'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
                },
                timeout=30,
            )

            response.raise_for_status()

        except requests.RequestException as error:
            raise CommandError(
                f'Не удалось загрузить страницу:\n{error}'
            ) from error

        return response.text

    # ======================================================================
    # ROOT
    # ======================================================================

    def find_best_root(self, soup):
        candidates = []

        selectors = (
            'div.noTypo',
            'article',
            'main',
            '.entry-content',
            '.post-content',
            '.article-content',
            '.content',
        )

        for selector in selectors:
            candidates.extend(
                soup.select(selector)
            )

        candidates.append(soup)

        best = soup
        best_score = -1

        for candidate in candidates:
            score = 0

            for heading in candidate.find_all(SECTION_TAGS):
                info = self.parse_section_heading(
                    self.clean_text(
                        heading.get_text(' ', strip=True)
                    )
                )

                if info and info['type'] in ('kontakion', 'ikos'):
                    score += 1

            if score > best_score:
                best = candidate
                best_score = score

        if best_score < 20:
            raise CommandError(
                'Не найден контейнер с полным текстом акафиста. '
                f'Распознано заголовков: {best_score}.'
            )

        return best

    # ======================================================================
    # НОРМАЛИЗАЦИЯ
    # ======================================================================

    def normalize_for_match(self, value):
        if not value:
            return ''

        value = unicodedata.normalize('NFD', value)

        value = ''.join(
            char
            for char in value
            if unicodedata.category(char) != 'Mn'
        )

        return unicodedata.normalize('NFC', value)

    def clean_text(self, value):
        if not value:
            return ''

        value = value.replace('\xa0', ' ')

        value = self.fix_historical_letters(value)
        value = self.fix_split_words(value)
        value = self.fix_inline_brackets(value)

        value = re.sub(r'[ \t]+', ' ', value)
        value = re.sub(r' *\n *', '\n', value)
        value = re.sub(r'\n{3,}', '\n\n', value)

        value = self.fix_split_words(value)

        return value.strip()

    def fix_historical_letters(self, value):
        if not value:
            return ''

        cyrillic = r'А-Яа-яЁёІіѴѵ'

        value = re.sub(
            rf'(?<=[{cyrillic}])I(?=[{cyrillic}])',
            'І',
            value,
        )

        value = re.sub(
            rf'(?<=[{cyrillic}])i(?=[{cyrillic}])',
            'і',
            value,
        )

        return value

    def fix_split_words(self, value):
        if not value:
            return ''

        return re.sub(
            r'\b([А-ЯЁІѴ])\n([а-яёіѵ]{2,})',
            r'\1\2',
            value,
        )

    def fix_inline_brackets(self, value):
        if not value:
            return ''

        def replace(match):
            inside = re.sub(
                r'\s+',
                ' ',
                match.group(1),
            ).strip()

            return f'[{inside}]'

        value = re.sub(
            r'\[\s*([^\]]+?)\s*\]',
            replace,
            value,
            flags=re.DOTALL,
        )

        value = re.sub(
            r'\]\s*\n+\s*,',
            '],',
            value,
        )

        return value

    def join_parts(self, parts):
        result = []

        for part in parts:
            cleaned = self.clean_text(part)

            if cleaned:
                result.append(cleaned)

        return '\n\n'.join(result)

    # ======================================================================
    # ЗАГОЛОВКИ
    # ======================================================================

    def parse_section_heading(self, value):
        if not value:
            return None

        normalized = self.normalize_for_match(value).strip()

        match = re.match(
            r'^(Кондак|Икос)\s*(\d+)\s*[\.:]?\s*$',
            normalized,
            flags=re.IGNORECASE,
        )

        if match:
            word = match.group(1).lower()

            return {
                'type': 'kontakion' if word == 'кондак' else 'ikos',
                'number': int(match.group(2)),
            }

        if self.is_prayer_heading(value):
            return {
                'type': 'prayer',
                'number': None,
            }

        return None

    def match_section_heading_prefix(self, value):
        if not value:
            return None

        normalized = self.normalize_for_match(value)

        match = re.match(
            r'^\s*(Кондак|Икос)\s*(\d+)\s*[\.:]?\s*',
            normalized,
            flags=re.IGNORECASE,
        )

        if not match:
            return None

        return {
            'type': (
                'kontakion'
                if match.group(1).lower() == 'кондак'
                else 'ikos'
            ),
            'number': int(match.group(2)),
        }

    def is_prayer_heading(self, value):
        if not value:
            return False

        first_line = value.split('\n', 1)[0].strip()
        normalized = self.normalize_for_match(first_line).lower()

        return (
                normalized.startswith('молитва')
                and len(normalized) < 160
        )

    def remove_section_heading(self, value, section_type, number):
        if not value:
            return ''

        normalized = self.normalize_for_match(value)

        word = (
            'Кондак'
            if section_type == 'kontakion'
            else 'Икос'
        )

        match = re.match(
            rf'^\s*{word}\s*{number}\s*[\.:]?\s*',
            normalized,
            flags=re.IGNORECASE,
        )

        if not match:
            return value.strip()

        original_match = re.match(
            rf'^\s*{word}\s*{number}\s*[\.:]?\s*',
            value,
            flags=re.IGNORECASE,
        )

        if original_match:
            return value[original_match.end():].strip()

        return value.strip()

    def remove_prayer_heading(self, value):
        if not value:
            return ''

        lines = value.splitlines()

        if not lines:
            return ''

        first_line = self.normalize_for_match(
            lines[0].strip()
        )

        if not re.match(
                r'^\s*Молитва\b',
                first_line,
                flags=re.IGNORECASE,
        ):
            return value.strip()

        return '\n'.join(
            line.strip()
            for line in lines[1:]
            if line.strip()
        ).strip()

    # ======================================================================
    # ОБЩЕЕ ОКОНЧАНИЕ И МУСОР СТРАНИЦЫ
    # ======================================================================

    def is_common_ending_marker(self, value):
        if not value:
            return False

        normalized = (
            self.normalize_for_match(value)
            .strip()
            .lower()
        )

        patterns = (
            r'^достойно есть\b',
            r'^достойно есть яко\b',
            r'^честнейшую херувим\b',
            r'^честнейшую херувимов\b',
            r'^трисвятое\b',
            r'^пресвятая троице\b',
            r'^отче наш\b',
            r'^по отче наш\b',
            r'^слава[,.:]?\s*(и ныне|отцу)\b',
            r'^и ныне и присно\b',
            r'^господи[,.:]?\s*помилуй\b',
            r'^благослови\b',
            r'^молитвами святых отец\b',
        )

        return any(
            re.search(pattern, normalized)
            for pattern in patterns
        )

    def is_page_tail_marker(self, value):
        if not value:
            return False

        normalized = (
            self.normalize_for_match(value)
            .strip()
            .lower()
        )

        patterns = (
            r'^православные молитвы\b',
            r'^другие молитвы\b',
            r'^другие акафисты\b',
            r'^акафисты пресвятой\b',
            r'^иконы богородицы\b',
            r'^иконы пресвятой\b',
            r'^молитвы пресвятой\b',
            r'^смотрите также\b',
            r'^похожие материалы\b',
            r'^рекомендуем\b',
            r'^литература\b',
            r'^источники\b',
            r'^комментарии\b',
            r'^поделиться\b',
            r'^содержание\b',
            r'^наверх\b',
        )

        return any(
            re.search(pattern, normalized)
            for pattern in patterns
        )

    # ======================================================================
    # ПОМЕТКИ
    # ======================================================================

    def is_three_times_note(self, value):
        if not value:
            return False

        normalized = (
            self.normalize_for_match(value)
            .lower()
        )

        return (
                'трижды' in normalized
                or bool(
            re.search(
                r'\(\s*3\s*\)',
                normalized,
            )
        )
        )

    def is_repeat_instruction(self, value):
        if not value:
            return False

        normalized = (
            self.normalize_for_match(value)
            .lower()
        )

        return (
                (
                        'повтор' in normalized
                        and (
                                'икос' in normalized
                                or 'кондак' in normalized
                        )
                )
                or 'затем икос' in normalized
                or 'и затем икос' in normalized
                or 'таже икос' in normalized
        )

    def is_service_annotation(self, value):
        if not value:
            return False

        stripped = value.strip()

        return (
                stripped.startswith('[')
                and stripped.endswith(']')
        )

    # ======================================================================
    # ТРОПАРЬ / КОНДАК ПЕРЕД АКАФИСТОМ
    # ======================================================================

    def parse_preface_hymns(self, root):
        headings = list(
            root.find_all(SECTION_TAGS)
        )

        first_akathist_heading = None

        for heading in headings:
            info = self.parse_section_heading(
                self.clean_text(
                    heading.get_text(' ', strip=True)
                )
            )

            if (
                    info
                    and info['type'] == 'kontakion'
                    and info['number'] == 1
            ):
                first_akathist_heading = heading
                break

        if first_akathist_heading is None:
            return None, None

        troparion = None
        kontakion = None

        for heading in headings:
            if heading is first_akathist_heading:
                break

            heading_text = self.clean_text(
                heading.get_text(' ', strip=True)
            )

            normalized = (
                self.normalize_for_match(heading_text)
                .strip()
                .lower()
            )

            hymn_type = None

            if normalized.startswith('тропарь'):
                hymn_type = 'troparion'

            elif (
                    normalized.startswith('кондак')
                    and not re.match(
                r'^кондак\s*\d+',
                normalized,
            )
            ):
                hymn_type = 'kontakion'

            if hymn_type is None:
                continue

            elements = self.collect_elements_after_heading(
                heading,
                stop_at_any_heading=True,
            )

            content, translation = self.parse_element_group(
                elements,
                section_type='hymn',
            )

            if not content:
                continue

            data = {
                'content': content,
                'translation': translation,
            }

            if hymn_type == 'troparion':
                troparion = data
            else:
                kontakion = data

        return troparion, kontakion

    # ======================================================================
    # ОСНОВНЫЕ СЕКЦИИ
    # ======================================================================

    def parse_sections(self, root):
        table_sections = self.parse_table_format(root)

        if self.looks_like_full_akathist(table_sections):
            self.stdout.write(
                'Формат страницы: таблица.'
            )
            return table_sections

        heading_sections = self.parse_heading_format(root)

        if self.looks_like_full_akathist(heading_sections):
            self.stdout.write(
                'Формат страницы: заголовки/paint/translate.'
            )
            return heading_sections

        kontakions = sorted({
            section['number']
            for section in heading_sections
            if section['type'] == 'kontakion'
        })

        ikoses = sorted({
            section['number']
            for section in heading_sections
            if section['type'] == 'ikos'
        })

        raise CommandError(
            'Не удалось получить полный акафист.\n'
            f'Кондаки: {kontakions}\n'
            f'Икосы: {ikoses}'
        )

    def looks_like_full_akathist(self, sections):
        kontakions = {
            section['number']
            for section in sections
            if section['type'] == 'kontakion'
        }

        ikoses = {
            section['number']
            for section in sections
            if section['type'] == 'ikos'
        }

        return (
                set(range(1, 14)).issubset(kontakions)
                and set(range(1, 13)).issubset(ikoses)
        )

    # ======================================================================
    # HEADING FORMAT
    # ======================================================================

    def parse_heading_format(self, root):
        section_headings = []

        for heading in root.find_all(SECTION_TAGS):
            text = self.clean_text(
                heading.get_text(' ', strip=True)
            )

            info = self.parse_section_heading(text)

            if info:
                section_headings.append(
                    (heading, info)
                )

        if not section_headings:
            return []

        sections = []
        prayer_number = 0

        for index, (heading, info) in enumerate(section_headings):
            next_heading = (
                section_headings[index + 1][0]
                if index + 1 < len(section_headings)
                else None
            )

            section_type = info['type']
            number = info.get('number')

            if section_type == 'prayer':
                prayer_number += 1
                number = prayer_number

            elements = self.collect_elements_after_heading(
                heading,
                stop_heading=next_heading,
            )

            if not elements:
                continue

            content, translation = self.parse_element_group(
                elements,
                section_type=section_type,
            )

            if not content:
                continue

            note = ''

            if (
                    section_type == 'kontakion'
                    and number == 13
            ):
                note = 'Читается трижды'

            sections.append({
                'type': section_type,
                'number': number,
                'content': content,
                'translation': translation,
                'note': note,
            })

        return sections

    def collect_elements_after_heading(
            self,
            heading,
            stop_heading=None,
            stop_at_any_heading=False,
    ):
        elements = []
        seen = set()

        for element in heading.next_elements:
            if stop_heading is not None and element is stop_heading:
                break

            if not isinstance(element, Tag):
                continue

            if element is heading:
                continue

            if element.name in SECTION_TAGS:
                if stop_at_any_heading:
                    break

                heading_text = self.clean_text(
                    element.get_text(' ', strip=True)
                )

                if self.is_page_tail_marker(heading_text):
                    break

                if self.parse_section_heading(heading_text):
                    break

            if element.name != 'p':
                continue

            if element.find_parent('p'):
                continue

            element_id = id(element)

            if element_id in seen:
                continue

            seen.add(element_id)

            text = self.clean_text(
                element.get_text('\n', strip=True)
            )

            if not text:
                continue

            if self.is_page_tail_marker(text):
                break

            elements.append({
                'text': text,
                'classes': set(
                    element.get('class') or []
                ),
            })

        return elements

    # ======================================================================
    # РАЗБОР ГРУППЫ <p>
    # ======================================================================

    def parse_element_group(self, elements, section_type):
        filtered = []

        for item in elements:
            text = item['text']

            if self.is_three_times_note(text):
                continue

            if self.is_repeat_instruction(text):
                continue

            if self.is_service_annotation(text):
                continue

            if self.is_page_tail_marker(text):
                break

            if (
                    section_type == 'prayer'
                    and self.is_common_ending_marker(text)
            ):
                break

            filtered.append(item)

        if not filtered:
            return '', ''

        content_parts = []
        translation_parts = []
        unknown_parts = []

        has_language_classes = False

        for item in filtered:
            text = item['text']
            classes = {
                cls.lower()
                for cls in item['classes']
            }

            if classes & CONTENT_CLASSES:
                has_language_classes = True
                content_parts.append(text)
                continue

            if classes & TRANSLATION_CLASSES:
                has_language_classes = True
                translation_parts.append(text)
                continue

            unknown_parts.append(text)

        if has_language_classes:
            if not content_parts and unknown_parts:
                content_parts.extend(unknown_parts)

            return (
                self.join_parts(content_parts),
                self.join_parts(translation_parts),
            )

        blocks = [
            item['text']
            for item in filtered
        ]

        if self.has_numbered_translations(blocks):
            return self.parse_numbered_translation_blocks(
                blocks
            )

        if section_type == 'prayer':
            return self.parse_unclassified_prayer(blocks)

        return self.parse_parallel_akathist_blocks(blocks)

    # ======================================================================
    # КОНДАКИ / ИКОСЫ БЕЗ CSS-МАРКЕРОВ
    # ======================================================================

    def parse_parallel_akathist_blocks(self, blocks):
        if not blocks:
            return '', ''

        if len(blocks) == 1:
            return blocks[0], ''

        content = []
        translation = []

        for index, block in enumerate(blocks):
            if index % 2 == 0:
                content.append(block)
            else:
                translation.append(block)

        return (
            self.join_parts(content),
            self.join_parts(translation),
        )

    # ======================================================================
    # МОЛИТВЫ БЕЗ CSS-МАРКЕРОВ
    # ======================================================================

    def parse_unclassified_prayer(self, blocks):
        """
        ВАЖНО:

        Для молитвы НИКОГДА не используем схему
        ЦС / RU / ЦС / RU по каждому абзацу.

        Ищем границу между цельным церковнославянским текстом
        и цельным русским переводом.
        """
        if not blocks:
            return '', ''

        if len(blocks) == 1:
            return blocks[0], ''

        if len(blocks) == 2:
            first_score = self.church_slavonic_score(blocks[0])
            second_score = self.church_slavonic_score(blocks[1])

            if first_score >= second_score:
                return blocks[0], blocks[1]

            return self.join_parts(blocks), ''

        best_split = None
        best_score = None

        for split_at in range(1, len(blocks)):
            left = blocks[:split_at]
            right = blocks[split_at:]

            left_score = self.average_church_score(left)
            right_score = self.average_church_score(right)

            score = left_score - right_score

            if best_score is None or score > best_score:
                best_score = score
                best_split = split_at

        if (
                best_split is not None
                and best_score is not None
                and best_score >= 1.5
        ):
            return (
                self.join_parts(
                    blocks[:best_split]
                ),
                self.join_parts(
                    blocks[best_split:]
                ),
            )

        # Если язык надёжно определить нельзя, НЕ угадываем перевод.
        # Лучше сохранить молитву целиком как source, чем снова перемешать
        # разные абзацы и получить неверный перевод.
        return self.join_parts(blocks), ''

    def average_church_score(self, blocks):
        if not blocks:
            return 0

        return sum(
            self.church_slavonic_score(block)
            for block in blocks
        ) / len(blocks)

    def church_slavonic_score(self, value):
        if not value:
            return 0

        normalized = (
            self.normalize_for_match(value)
            .lower()
        )

        score = 0

        score += len(
            re.findall(
                r'[ѣѳѵі]',
                value.lower(),
            )
        ) * 2

        score += len(
            re.findall(
                r'\u0301',
                value,
            )
        )

        church_words = (
            'яко',
            'еси',
            'тя',
            'тебе',
            'твоего',
            'твоея',
            'аще',
            'бо',
            'сего ради',
            'вопием',
            'вопиющих',
            'радуйся',
            'пресвятая',
            'владычице',
            'чудотворче',
            'угодниче',
            'блаженне',
            'молися',
            'даруй ми',
        )

        russian_words = (
            'потому',
            'который',
            'которая',
            'которые',
            'тебя',
            'твоей',
            'чтобы',
            'потому что',
            'являющийся',
            'даруй мне',
            'мы просим',
        )

        for word in church_words:
            if word in normalized:
                score += 1

        for word in russian_words:
            if word in normalized:
                score -= 2

        return score

    # ======================================================================
    # ПЕРЕВОД 1 / ПЕРЕВОД 2 / ...
    # ======================================================================

    def has_numbered_translations(self, blocks):
        return any(
            self.parse_translation_label(block)
            for block in blocks
        )

    def parse_translation_label(self, value):
        if not value:
            return None

        normalized = self.normalize_for_match(value)

        match = re.match(
            r'^\s*Перевод\s+(\d+)\s*:\s*(.*)$',
            normalized,
            flags=re.IGNORECASE | re.DOTALL,
        )

        if not match:
            return None

        original = re.match(
            r'^\s*Перевод\s+\d+\s*:\s*(.*)$',
            value,
            flags=re.IGNORECASE | re.DOTALL,
        )

        return {
            'number': int(match.group(1)),
            'text': (
                original.group(1).strip()
                if original
                else ''
            ),
        }

    def parse_numbered_translation_blocks(self, blocks):
        source = []
        translations = {}

        current_translation = None

        for block in blocks:
            info = self.parse_translation_label(block)

            if info:
                current_translation = info['number']
                translations.setdefault(
                    current_translation,
                    [],
                )

                if info['text']:
                    translations[
                        current_translation
                    ].append(info['text'])

                continue

            if current_translation is None:
                source.append(block)
            else:
                translations[
                    current_translation
                ].append(block)

        chosen = ''

        for number in (4, 3, 2, 1):
            parts = translations.get(number)

            if parts:
                chosen = self.join_parts(parts)
                break

        return (
            self.join_parts(source),
            chosen,
        )

    # ======================================================================
    # TABLE FORMAT
    # ======================================================================

    def parse_table_format(self, root):
        tables = root.find_all('table')

        if not tables:
            return []

        best_table = None
        best_score = 0

        for table in tables:
            score = 0

            for row in table.find_all('tr'):
                cells = row.find_all(
                    ['td', 'th'],
                    recursive=False,
                )

                if not cells:
                    continue

                left = self.clean_text(
                    cells[0].get_text(
                        '\n',
                        strip=True,
                    )
                )

                if (
                        self.match_section_heading_prefix(left)
                        or self.is_prayer_heading(left)
                ):
                    score += 1

            if score > best_score:
                best_score = score
                best_table = table

        if best_table is None or best_score < 20:
            return []

        sections = []
        current = None
        prayer_number = 0

        def finish_current():
            nonlocal current

            if not current:
                return

            content = self.join_parts(
                current['content_parts']
            )

            translation = self.join_parts(
                current['translation_parts']
            )

            if content:
                sections.append({
                    'type': current['type'],
                    'number': current['number'],
                    'content': content,
                    'translation': translation,
                    'note': current.get('note', ''),
                })

            current = None

        for row in best_table.find_all('tr'):
            cells = row.find_all(
                ['td', 'th'],
                recursive=False,
            )

            if not cells:
                continue

            left = (
                self.clean_text(
                    cells[0].get_text(
                        '\n',
                        strip=True,
                    )
                )
                if len(cells) >= 1
                else ''
            )

            right = (
                self.clean_text(
                    cells[1].get_text(
                        '\n',
                        strip=True,
                    )
                )
                if len(cells) >= 2
                else ''
            )

            if self.is_page_tail_marker(left):
                finish_current()
                break

            if (
                    current
                    and current['type'] == 'prayer'
                    and self.is_common_ending_marker(left)
            ):
                finish_current()
                break

            section = self.match_section_heading_prefix(left)

            if section:
                finish_current()

                current = {
                    'type': section['type'],
                    'number': section['number'],
                    'content_parts': [],
                    'translation_parts': [],
                    'note': (
                        'Читается трижды'
                        if (
                                section['type'] == 'kontakion'
                                and section['number'] == 13
                        )
                        else ''
                    ),
                }

                left = self.remove_section_heading(
                    left,
                    section['type'],
                    section['number'],
                )

                right = self.remove_section_heading(
                    right,
                    section['type'],
                    section['number'],
                )

                if left:
                    current['content_parts'].append(left)

                if right:
                    current['translation_parts'].append(right)

                continue

            if self.is_prayer_heading(left):
                finish_current()

                prayer_number += 1

                current = {
                    'type': 'prayer',
                    'number': prayer_number,
                    'content_parts': [],
                    'translation_parts': [],
                    'note': '',
                }

                left = self.remove_prayer_heading(left)

                if left:
                    current['content_parts'].append(left)

                if right:
                    current['translation_parts'].append(right)

                continue

            if not current:
                continue

            if left:
                current['content_parts'].append(left)

            if right:
                current['translation_parts'].append(right)

        finish_current()

        return sections

    # ======================================================================
    # НОРМАЛИЗАЦИЯ ФИНАЛЬНЫХ СЕКЦИЙ
    # ======================================================================

    def normalize_sections(self, sections):
        normalized = []

        seen_kontakions = set()
        seen_ikoses = set()

        prayer_number = 0
        kontakion_13_seen = False

        for original in sections:
            section = original.copy()

            section_type = section['type']
            number = section.get('number')

            section['content'] = self.clean_text(
                section.get('content', '')
            )

            section['translation'] = self.clean_text(
                section.get('translation', '')
            )

            if section_type == 'prayer':
                prayer_number += 1
                section['number'] = prayer_number

                section['content'] = self.trim_prayer_text(
                    section['content']
                )

                section['translation'] = self.trim_prayer_text(
                    section['translation']
                )

                if section['content']:
                    normalized.append(section)

                continue

            if section_type == 'kontakion':
                if number not in range(1, 14):
                    continue

                if kontakion_13_seen:
                    continue

                if number in seen_kontakions:
                    continue

                if number == 13:
                    kontakion_13_seen = True
                    section['note'] = 'Читается трижды'

                seen_kontakions.add(number)
                normalized.append(section)

                continue

            if section_type == 'ikos':
                if number not in range(1, 13):
                    continue

                if kontakion_13_seen:
                    continue

                if number in seen_ikoses:
                    continue

                seen_ikoses.add(number)
                normalized.append(section)

        return normalized

    def trim_prayer_text(self, value):
        if not value:
            return ''

        blocks = re.split(
            r'\n\s*\n',
            self.clean_text(value),
        )

        result = []

        for block in blocks:
            block = self.clean_text(block)

            if not block:
                continue

            if self.is_common_ending_marker(block):
                break

            if self.is_page_tail_marker(block):
                break

            result.append(block)

        return self.join_parts(result)

    # ======================================================================
    # ВАЛИДАЦИЯ
    # ======================================================================

    def validate_sections(self, sections):
        kontakions = [
            section
            for section in sections
            if section['type'] == 'kontakion'
        ]

        ikoses = [
            section
            for section in sections
            if section['type'] == 'ikos'
        ]

        prayers = [
            section
            for section in sections
            if section['type'] == 'prayer'
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

        if kontakion_numbers != expected_kontakions:
            raise CommandError(
                'Неверно разобраны Кондаки.\n'
                f'Получено: {kontakion_numbers}\n'
                f'Ожидалось: {expected_kontakions}'
            )

        if ikos_numbers != expected_ikoses:
            raise CommandError(
                'Неверно разобраны Икосы.\n'
                f'Получено: {ikos_numbers}\n'
                f'Ожидалось: {expected_ikoses}'
            )

        for section in kontakions + ikoses + prayers:
            if not section.get('content'):
                raise CommandError(
                    f'Пустой текст: '
                    f'{section["type"]} '
                    f'{section["number"]}.'
                )

        for prayer in prayers:
            combined = (
                    prayer.get('content', '')
                    + '\n'
                    + prayer.get('translation', '')
            )

            if self.contains_forbidden_tail(combined):
                raise CommandError(
                    f'В Молитву {prayer["number"]} '
                    f'попало общее окончание или мусор страницы.'
                )

        self.stdout.write(
            self.style.SUCCESS(
                'Проверка структуры пройдена.'
            )
        )

        self.stdout.write(
            f'Кондаков: {len(kontakions)}'
        )

        self.stdout.write(
            f'Икосов: {len(ikoses)}'
        )

        self.stdout.write(
            f'Молитв: {len(prayers)}'
        )

    def contains_forbidden_tail(self, value):
        if not value:
            return False

        blocks = re.split(
            r'\n\s*\n',
            value,
        )

        return any(
            self.is_common_ending_marker(block)
            or self.is_page_tail_marker(block)
            for block in blocks
        )

    def print_check_result(self, sections):
        self.stdout.write(
            self.style.SUCCESS(
                '\nCHECK-ONLY: запись в БД не выполнялась.'
            )
        )

        self.stdout.write('\nФинальная структура:')

        for section in sections:
            translation = (
                'RU'
                if section.get('translation')
                else '--'
            )

            self.stdout.write(
                f'{section["type"]:10} '
                f'{str(section["number"]):>2} | '
                f'{translation} | '
                f'ЦС {len(section["content"])} симв.'
            )

    # ======================================================================
    # СОХРАНЕНИЕ
    # ======================================================================

    def save_akathist(
            self,
            sections,
            troparion=None,
            kontakion_before=None,
    ):
        akathist, _ = Akathist.objects.update_or_create(
            slug=self.akathist_slug,
            defaults={
                'title': self.akathist_title,
                'description': self.akathist_title,
                'is_visible': True,
            },
        )

        troparion_object = self.save_special_text(
            data=troparion,
            slug=f'{self.akathist_slug}-troparion',
            title='Тропарь',
        )

        kontakion_object = self.save_special_text(
            data=kontakion_before,
            slug=f'{self.akathist_slug}-kontakion-before',
            title='Кондак',
        )

        if hasattr(akathist, 'troparion_id'):
            akathist.troparion = troparion_object

        if hasattr(akathist, 'kontakion_before_id'):
            akathist.kontakion_before = kontakion_object

        akathist.save()

        text_objects = {}

        for section in sections:
            section_type = section['type']
            number = section['number']

            key = (
                section_type,
                number,
            )

            text_slug = (
                f'{self.akathist_slug}-'
                f'{section_type}-'
                f'{number}'
            )

            text_object, _ = Text.objects.update_or_create(
                slug=text_slug,
                defaults={
                    'title': self.make_title(
                        section_type,
                        number,
                    ),
                    'description': '',
                    'content': section['content'],
                    'translation': section.get(
                        'translation',
                        '',
                    ),
                    'language': 'cu',
                    'description_position': 'before',
                    'is_visible': True,
                },
            )

            text_objects[key] = text_object

        desired_sections = []

        for section in sections:
            if section['type'] == 'prayer':
                continue

            key = (
                section['type'],
                section['number'],
            )

            desired_sections.append({
                'section_type': section['type'],
                'number': section['number'],
                'text': text_objects[key],
                'note': section.get('note', ''),
            })

        ikos_1 = text_objects.get(
            ('ikos', 1)
        )

        kontakion_1 = text_objects.get(
            ('kontakion', 1)
        )

        if not ikos_1 or not kontakion_1:
            raise CommandError(
                'Не найдены Икос 1 / Кондак 1 '
                'для финального повторения.'
            )

        desired_sections.append({
            'section_type': 'ikos',
            'number': 1,
            'text': ikos_1,
            'note': '',
        })

        desired_sections.append({
            'section_type': 'kontakion',
            'number': 1,
            'text': kontakion_1,
            'note': '',
        })

        prayers = [
            section
            for section in sections
            if section['type'] == 'prayer'
        ]

        for prayer in prayers:
            key = (
                'prayer',
                prayer['number'],
            )

            desired_sections.append({
                'section_type': 'prayer',
                'number': prayer['number'],
                'text': text_objects[key],
                'note': prayer.get('note', ''),
            })

        used_orders = []

        for order, section in enumerate(
                desired_sections,
                start=1,
        ):
            used_orders.append(order)

            AkathistSection.objects.update_or_create(
                akathist=akathist,
                order=order,
                defaults={
                    'section_type': section['section_type'],
                    'number': section['number'],
                    'text': section['text'],
                    'note': section['note'],
                },
            )

        (
            AkathistSection.objects
            .filter(akathist=akathist)
            .exclude(order__in=used_orders)
            .delete()
        )

        return akathist

    def save_special_text(self, data, slug, title):
        if not data or not data.get('content'):
            existing = Text.objects.filter(
                slug=slug
            ).first()

            if existing:
                existing.delete()

            return None

        text, _ = Text.objects.update_or_create(
            slug=slug,
            defaults={
                'title': title,
                'description': '',
                'content': data['content'],
                'translation': data.get(
                    'translation',
                    '',
                ),
                'language': 'cu',
                'description_position': 'before',
                'is_visible': True,
            },
        )

        return text

    def make_title(self, section_type, number):
        if section_type == 'kontakion':
            return f'Кондак {number}'

        if section_type == 'ikos':
            return f'Икос {number}'

        return f'Молитва {number}'