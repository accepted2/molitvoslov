import re
import unicodedata
import zipfile
from collections import Counter
from pathlib import Path, PurePosixPath

from bs4 import BeautifulSoup, Tag
from django.core.management.base import (
    BaseCommand,
    CommandError,
)
from django.db import transaction

from api.models import (
    Canon,
    CanonSection,
    Text,
)


HEADING_TAGS = {
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
}

# Те же языковые классы уже встречались
# в EPUB акафистов Азбуки веры.
CHURCH_CLASSES = {
    'paint',
    'gprayer',
}

TRANSLATION_CLASSES = {
    'translate',
}


SECTION_LABELS = {
    CanonSection.TYPE_IRMOS:
        'Ирмос',

    CanonSection.TYPE_REFRAIN:
        'Припев',

    CanonSection.TYPE_TROPARION:
        'Тропарь',

    CanonSection.TYPE_THEOTOKION:
        'Богородичен',

    CanonSection.TYPE_GLORY:
        'Слава',

    CanonSection.TYPE_NOW:
        'И ныне',

    CanonSection.TYPE_SEDALEN:
        'Седален',

    CanonSection.TYPE_KONTAKION:
        'Кондак',

    CanonSection.TYPE_IKOS:
        'Икос',

    CanonSection.TYPE_SVETILEN:
        'Светилен',

    CanonSection.TYPE_PRAYER:
        'Молитва',

    CanonSection.TYPE_OTHER:
        'Текст',
}


class Command(BaseCommand):
    help = (
        'Импортирует канон из EPUB Азбуки веры. '
        'Поддерживает песни, ирмосы, припевы, '
        'тропари, Богородичны, седальны, '
        'кондаки, икосы, светильны и молитвы.'
    )

    def add_arguments(
            self,
            parser,
    ):
        parser.add_argument(
            '--epub',
            required=True,
            help='Путь к EPUB-файлу.',
        )

        parser.add_argument(
            '--slug',
            required=True,
            help='Slug канона в базе.',
        )

        parser.add_argument(
            '--title',
            default='',
            help=(
                'Название канона. Если не указано, '
                'берётся из EPUB.'
            ),
        )

        parser.add_argument(
            '--check-only',
            action='store_true',
            help=(
                'Только разобрать и проверить EPUB. '
                'База данных не изменяется.'
            ),
        )

    def handle(
            self,
            *args,
            **options,
    ):
        epub_path = Path(
            options['epub']
        )

        slug = (
            options['slug']
            .strip()
        )

        title = (
            options['title']
            .strip()
        )

        check_only = (
            options['check_only']
        )

        if not epub_path.exists():
            raise CommandError(
                f'EPUB-файл не найден: '
                f'{epub_path}'
            )

        self.stdout.write('')
        self.stdout.write(
            '=' * 72
        )

        self.stdout.write(
            'ИМПОРТ КАНОНА ИЗ EPUB'
        )

        self.stdout.write(
            '=' * 72
        )

        self.stdout.write(
            f'Файл: {epub_path}'
        )

        self.stdout.write(
            f'Slug: {slug}'
        )

        documents, epub_title = (
            self.read_epub_documents(
                epub_path
            )
        )

        self.stdout.write(
            'HTML/XHTML в spine: '
            + ', '.join(
                name
                for name, _soup
                in documents
            )
        )

        if not title:
            title = (
                epub_title
                or self.extract_title(
                    documents
                )
            )

        if not title:
            raise CommandError(
                'Не удалось определить '
                'название канона. '
                'Передай --title.'
            )

        self.stdout.write(
            f'Название: {title}'
        )

        parsed = self.parse_canon(
            documents
        )

        self.validate_parsed(
            parsed
        )

        self.print_report(
            parsed
        )

        if check_only:
            self.stdout.write('')
            self.stdout.write(
                self.style.SUCCESS(
                    'CHECK-ONLY: структура '
                    'канона распознана. '
                    'База данных не изменялась.'
                )
            )

            return

        self.save_canon(
            slug=slug,
            title=title,
            parsed=parsed,
        )

        self.stdout.write('')
        self.stdout.write(
            self.style.SUCCESS(
                'Импорт канона '
                'завершён успешно.'
            )
        )

    # =========================================================
    # EPUB
    # =========================================================

    def read_epub_documents(
            self,
            epub_path,
    ):
        try:
            archive = zipfile.ZipFile(
                epub_path
            )
        except zipfile.BadZipFile as exc:
            raise CommandError(
                'Файл не является '
                'корректным EPUB/ZIP.'
            ) from exc

        with archive:
            names = set(
                archive.namelist()
            )

            opf_path = (
                self.find_opf_path(
                    archive,
                    names,
                )
            )

            epub_title = ''

            document_names = []

            if opf_path:
                (
                    document_names,
                    epub_title,
                ) = (
                    self.read_spine(
                        archive,
                        opf_path,
                        names,
                    )
                )

            if not document_names:
                document_names = [
                    name
                    for name
                    in archive.namelist()
                    if (
                        name.lower().endswith(
                            (
                                '.html',
                                '.xhtml',
                                '.htm',
                            )
                        )
                        and
                        'toc.' not in
                        name.lower()
                        and
                        'nav.' not in
                        name.lower()
                    )
                ]

            if not document_names:
                raise CommandError(
                    'В EPUB не найден '
                    'HTML/XHTML с текстом.'
                )

            documents = []

            for name in document_names:
                if name not in names:
                    continue

                raw = archive.read(
                    name
                )

                html = self.decode_html(
                    raw,
                    name,
                )

                soup = BeautifulSoup(
                    html,
                    'html.parser',
                )

                documents.append(
                    (
                        name,
                        soup,
                    )
                )

            if not documents:
                raise CommandError(
                    'Не удалось прочитать '
                    'текстовые документы EPUB.'
                )

            return (
                documents,
                epub_title,
            )

    def find_opf_path(
            self,
            archive,
            names,
    ):
        container_name = (
            'META-INF/container.xml'
        )

        if container_name in names:
            try:
                soup = BeautifulSoup(
                    archive.read(
                        container_name
                    ),
                    'xml',
                )

                rootfile = soup.find(
                    'rootfile'
                )

                if (
                    rootfile
                    and
                    rootfile.get(
                        'full-path'
                    )
                ):
                    candidate = (
                        rootfile[
                            'full-path'
                        ]
                    )

                    if candidate in names:
                        return candidate
            except Exception:
                pass

        for name in names:
            if name.lower().endswith(
                    '.opf'
            ):
                return name

        return None

    def read_spine(
            self,
            archive,
            opf_path,
            names,
    ):
        try:
            opf = BeautifulSoup(
                archive.read(
                    opf_path
                ),
                'xml',
            )
        except Exception:
            return (
                [],
                '',
            )

        title = ''

        title_tag = (
            opf.find(
                'dc:title'
            )
            or opf.find(
                'title'
            )
        )

        if title_tag:
            title = self.clean_text(
                title_tag.get_text(
                    ' ',
                    strip=True,
                )
            )

        manifest = {}

        for item in opf.find_all(
                'item'
        ):
            item_id = item.get(
                'id'
            )

            href = item.get(
                'href'
            )

            media_type = (
                item.get(
                    'media-type',
                    ''
                )
                .lower()
            )

            if (
                not item_id
                or not href
            ):
                continue

            if (
                'html' not in
                media_type
                and
                not href.lower()
                .endswith(
                    (
                        '.html',
                        '.xhtml',
                        '.htm',
                    )
                )
            ):
                continue

            manifest[
                item_id
            ] = href

        base = PurePosixPath(
            opf_path
        ).parent

        result = []

        for itemref in opf.find_all(
                'itemref'
        ):
            idref = itemref.get(
                'idref'
            )

            href = manifest.get(
                idref
            )

            if not href:
                continue

            path = str(
                base / href
            )

            if path in names:
                result.append(
                    path
                )

        return (
            result,
            title,
        )

    def decode_html(
            self,
            raw,
            name,
    ):
        for encoding in (
            'utf-8-sig',
            'utf-8',
            'cp1251',
        ):
            try:
                return raw.decode(
                    encoding
                )
            except UnicodeDecodeError:
                continue

        raise CommandError(
            'Не удалось определить '
            f'кодировку {name}.'
        )

    def extract_title(
            self,
            documents,
    ):
        for _name, soup in documents:
            heading = soup.find(
                'h1'
            )

            if heading:
                value = self.clean_text(
                    heading.get_text(
                        ' ',
                        strip=True,
                    )
                )

                if value:
                    return value

        return ''

    # =========================================================
    # РАЗБОР
    # =========================================================

    def parse_canon(
            self,
            documents,
    ):
        sections = []

        variant = 1

        orders = {
            1: 0,
        }

        current_ode = None

        seen_odes = {
            1: [],
        }

        pending_heading = None

        open_standalone = None

        last_section = None

        tone = ''

        tone_from_canon = ''

        class_counter = Counter()

        heading_counter = Counter()

        def start_variant():
            nonlocal variant
            nonlocal current_ode
            nonlocal pending_heading
            nonlocal open_standalone
            nonlocal last_section

            variant += 1

            orders.setdefault(
                variant,
                0,
            )

            seen_odes.setdefault(
                variant,
                [],
            )

            current_ode = None

            pending_heading = None

            open_standalone = None

            last_section = None

        def add_section(
                section_type,
                content,
                heading='',
                ode_number=None,
        ):
            nonlocal last_section
            nonlocal open_standalone

            content = self.clean_text(
                content,
                preserve_newlines=True,
            )

            if not content:
                return None

            orders[
                variant
            ] += 1

            item = {
                'variant':
                    variant,

                'order':
                    orders[
                        variant
                    ],

                'section_type':
                    section_type,

                'ode_number':
                    ode_number,

                'heading':
                    self.clean_text(
                        heading
                    ),

                'content':
                    content,

                'translation':
                    '',
            }

            sections.append(
                item
            )

            last_section = item

            return item

        for _name, soup in documents:
            body = (
                soup.body
                or soup
            )

            elements = (
                body.find_all(
                    list(
                        HEADING_TAGS
                    ) + [
                        'p',
                    ]
                )
            )

            for element in elements:
                if not isinstance(
                        element,
                        Tag,
                ):
                    continue

                text = self.clean_text(
                    element.get_text(
                        ' ',
                        strip=True,
                    )
                )

                if not text:
                    continue

                classes = {
                    value.lower()
                    for value
                    in element.get(
                        'class',
                        [],
                    )
                }

                for value in classes:
                    class_counter[
                        value
                    ] += 1

                if element.name in HEADING_TAGS:
                    heading = (
                        self.parse_heading(
                            text
                        )
                    )

                    if not heading:
                        # Главный H1 с названием
                        # канона не превращаем
                        # в элемент текста.
                        normalized = (
                            self.normalize_heading(
                                text
                            )
                        )

                        if (
                            element.name == 'h1'
                            and
                            normalized.startswith(
                                'канон '
                            )
                        ):
                            continue

                        pending_heading = {
                            'section_type':
                                CanonSection
                                .TYPE_OTHER,

                            'heading':
                                text,

                            'ode_number':
                                None,
                        }

                        open_standalone = None

                        continue

                    heading_counter[
                        heading[
                            'kind'
                        ]
                    ] += 1

                    if (
                        heading[
                            'kind'
                        ] ==
                        'canon'
                    ):
                        extracted_tone = (
                            self.extract_tone(
                                text
                            )
                        )

                        if extracted_tone:
                            tone_from_canon = (
                                extracted_tone
                            )

                        # Повтор полного канона
                        # после уже законченного
                        # варианта (например,
                        # мужская/женская форма).
                        if (
                            9 in
                            seen_odes[
                                variant
                            ]
                            and
                            orders[
                                variant
                            ] > 0
                            and
                            pending_heading
                            is None
                        ):
                            # Если новый вариант
                            # уже был начат повторным
                            # тропарём перед заголовком,
                            # здесь второй раз не
                            # переключаем.
                            if not (
                                orders[
                                    variant
                                ] == 0
                            ):
                                pass

                        pending_heading = None

                        open_standalone = None

                        current_ode = None

                        continue

                    if (
                        heading[
                            'kind'
                        ] ==
                        'ode'
                    ):
                        ode_number = (
                            heading[
                                'number'
                            ]
                        )

                        if (
                            ode_number == 1
                            and
                            1 in
                            seen_odes[
                                variant
                            ]
                        ):
                            start_variant()

                        if (
                            ode_number in
                            seen_odes[
                                variant
                            ]
                        ):
                            raise CommandError(
                                'Повтор Песни '
                                f'{ode_number} '
                                f'в варианте '
                                f'{variant}.'
                            )

                        current_ode = (
                            ode_number
                        )

                        seen_odes[
                            variant
                        ].append(
                            ode_number
                        )

                        pending_heading = None

                        open_standalone = None

                        continue

                    section_type = (
                        heading[
                            'section_type'
                        ]
                    )

                    # После полной девятой песни
                    # повторный Тропарь часто
                    # означает начало второго
                    # грамматического варианта.
                    if (
                        section_type ==
                        CanonSection
                        .TYPE_TROPARION
                        and
                        9 in
                        seen_odes[
                            variant
                        ]
                    ):
                        start_variant()

                    belongs_to_ode = (
                        current_ode
                        if section_type
                        in {
                            CanonSection
                            .TYPE_TROPARION,
                            CanonSection
                            .TYPE_THEOTOKION,
                        }
                        else None
                    )

                    pending_heading = {
                        'section_type':
                            section_type,

                        'heading':
                            text,

                        'ode_number':
                            belongs_to_ode,
                    }

                    open_standalone = None

                    continue

                # ---------------------------------------------
                # Обычный <p>
                # ---------------------------------------------

                if (
                    classes &
                    TRANSLATION_CLASSES
                ):
                    if last_section:
                        translation = (
                            self.clean_translation(
                                text
                            )
                        )

                        if translation:
                            if (
                                last_section[
                                    'translation'
                                ]
                            ):
                                last_section[
                                    'translation'
                                ] += (
                                    '\n\n'
                                    + translation
                                )
                            else:
                                last_section[
                                    'translation'
                                ] = (
                                    translation
                                )

                    continue

                # Иногда заголовки в EPUB
                # размечены обычным <p>.
                paragraph_heading = None

                if len(
                    text
                ) <= 180:
                    paragraph_heading = (
                        self.parse_heading(
                            text
                        )
                    )

                if paragraph_heading:
                    heading_counter[
                        paragraph_heading[
                            'kind'
                        ]
                    ] += 1

                    if (
                        paragraph_heading[
                            'kind'
                        ] ==
                        'ode'
                    ):
                        ode_number = (
                            paragraph_heading[
                                'number'
                            ]
                        )

                        if (
                            ode_number == 1
                            and
                            1 in
                            seen_odes[
                                variant
                            ]
                        ):
                            start_variant()

                        current_ode = (
                            ode_number
                        )

                        if (
                            ode_number not in
                            seen_odes[
                                variant
                            ]
                        ):
                            seen_odes[
                                variant
                            ].append(
                                ode_number
                            )

                        pending_heading = None

                        open_standalone = None

                        continue

                    if (
                        paragraph_heading[
                            'kind'
                        ] ==
                        'canon'
                    ):
                        extracted_tone = (
                            self.extract_tone(
                                text
                            )
                        )

                        if extracted_tone:
                            tone_from_canon = (
                                extracted_tone
                            )

                        current_ode = None

                        pending_heading = None

                        open_standalone = None

                        continue

                    pending_heading = {
                        'section_type':
                            paragraph_heading[
                                'section_type'
                            ],

                        'heading':
                            text,

                        'ode_number':
                            (
                                current_ode
                                if paragraph_heading[
                                    'section_type'
                                ]
                                in {
                                    CanonSection
                                    .TYPE_TROPARION,
                                    CanonSection
                                    .TYPE_THEOTOKION,
                                }
                                else None
                            ),
                    }

                    open_standalone = None

                    continue

                extracted_tone = (
                    self.extract_tone(
                        text
                    )
                )

                if (
                    extracted_tone
                    and
                    len(
                        text.split()
                    ) <= 8
                ):
                    if not tone:
                        tone = (
                            extracted_tone
                        )

                    # Строка "Глас 2"
                    # является метаданными,
                    # а не текстом канона.
                    if (
                        self.normalize_heading(
                            text
                        )
                        .startswith(
                            'глас '
                        )
                    ):
                        continue

                # Если перед абзацем был
                # явный заголовок.
                if pending_heading:
                    item = add_section(
                        section_type=(
                            pending_heading[
                                'section_type'
                            ]
                        ),

                        content=text,

                        heading=(
                            pending_heading[
                                'heading'
                            ]
                        ),

                        ode_number=(
                            pending_heading[
                                'ode_number'
                            ]
                        ),
                    )

                    open_standalone = (
                        item
                        if item
                        and
                        item[
                            'section_type'
                        ]
                        in {
                            CanonSection
                            .TYPE_SEDALEN,
                            CanonSection
                            .TYPE_KONTAKION,
                            CanonSection
                            .TYPE_IKOS,
                            CanonSection
                            .TYPE_SVETILEN,
                            CanonSection
                            .TYPE_PRAYER,
                            CanonSection
                            .TYPE_OTHER,
                        }
                        else None
                    )

                    pending_heading = None

                    continue

                (
                    paragraph_type,
                    paragraph_label,
                ) = (
                    self.classify_paragraph(
                        text
                    )
                )

                if paragraph_type:
                    open_standalone = None

                    add_section(
                        section_type=(
                            paragraph_type
                        ),

                        content=text,

                        heading=(
                            paragraph_label
                        ),

                        ode_number=(
                            current_ode
                        ),
                    )

                    continue

                # Несколько абзацев одной
                # молитвы/седальна и т.п.
                if open_standalone:
                    open_standalone[
                        'content'
                    ] += (
                        '\n\n'
                        + self.clean_text(
                            text,
                            preserve_newlines=True,
                        )
                    )

                    last_section = (
                        open_standalone
                    )

                    continue

                if current_ode:
                    add_section(
                        section_type=(
                            CanonSection
                            .TYPE_TROPARION
                        ),

                        content=text,

                        heading='',

                        ode_number=(
                            current_ode
                        ),
                    )

                    continue

                # Текст до начала первой
                # песни (например тропарь,
                # если EPUB потерял heading)
                # сохраняем, но не выдаём
                # за тропарь автоматически.
                add_section(
                    section_type=(
                        CanonSection
                        .TYPE_OTHER
                    ),

                    content=text,

                    heading='',

                    ode_number=None,
                )

        return {
            'tone':
                (
                    tone_from_canon
                    or tone
                ),

            'sections':
                sections,

            'seen_odes':
                seen_odes,

            'classes':
                class_counter,

            'headings':
                heading_counter,

            'variant_count':
                max(
                    (
                        section[
                            'variant'
                        ]
                        for section
                        in sections
                    ),
                    default=1,
                ),
        }

    def parse_heading(
            self,
            value,
    ):
        normalized = (
            self.normalize_heading(
                value
            )
        )

        ode_match = re.match(
            r'^песнь\s+'
            r'([0-9]+|[ivx]+)'
            r'(?:\s|$)',
            normalized,
        )

        if ode_match:
            number = (
                self.parse_number(
                    ode_match.group(
                        1
                    )
                )
            )

            if (
                number
                and
                1 <= number <= 9
            ):
                return {
                    'kind':
                        'ode',

                    'number':
                        number,
                }

        if normalized.startswith(
                'канон'
        ):
            return {
                'kind':
                    'canon',
            }

        patterns = [
            (
                r'^седален(?:\s|,|:|$)',
                CanonSection
                .TYPE_SEDALEN,
                'sedalen',
            ),
            (
                r'^кондак(?:\s|,|:|$)',
                CanonSection
                .TYPE_KONTAKION,
                'kontakion',
            ),
            (
                r'^икос(?:\s|,|:|$)',
                CanonSection
                .TYPE_IKOS,
                'ikos',
            ),
            (
                r'^светилен(?:\s|,|:|$)',
                CanonSection
                .TYPE_SVETILEN,
                'svetilen',
            ),
            (
                r'^эксапостилар(?:\s|,|:|$)',
                CanonSection
                .TYPE_SVETILEN,
                'svetilen',
            ),
            (
                r'^тропар(?:ь|и|я)?(?:\s|,|:|$)',
                CanonSection
                .TYPE_TROPARION,
                'troparion',
            ),
            (
                r'^(?:кресто)?богородичен(?:\s|,|:|$)',
                CanonSection
                .TYPE_THEOTOKION,
                'theotokion',
            ),
            (
                r'^молитва(?:\s|,|:|$)',
                CanonSection
                .TYPE_PRAYER,
                'prayer',
            ),
        ]

        for (
            pattern,
            section_type,
            kind,
        ) in patterns:
            if re.match(
                    pattern,
                    normalized,
            ):
                return {
                    'kind':
                        kind,

                    'section_type':
                        section_type,
                }

        return None

    def classify_paragraph(
            self,
            value,
    ):
        normalized = (
            self.normalize_heading(
                value
            )
        )

        tests = [
            (
                r'^ирмос\s*:',
                CanonSection
                .TYPE_IRMOS,
                'Ирмос',
            ),
            (
                r'^припев(?:\s+[^:]*)?\s*:',
                CanonSection
                .TYPE_REFRAIN,
                'Припев',
            ),
            (
                r'^иисусу\s*:',
                CanonSection
                .TYPE_REFRAIN,
                'Иисусу',
            ),
            (
                r'^слава(?:\s+отцу|\s*:)',
                CanonSection
                .TYPE_GLORY,
                'Слава',
            ),
            (
                r'^и\s+ныне(?:\s|,|:)',
                CanonSection
                .TYPE_NOW,
                'И ныне',
            ),
            (
                r'^(?:кресто)?богородичен\s*:',
                CanonSection
                .TYPE_THEOTOKION,
                'Богородичен',
            ),
        ]

        for (
            pattern,
            section_type,
            label,
        ) in tests:
            if re.match(
                    pattern,
                    normalized,
            ):
                return (
                    section_type,
                    label,
                )

        return (
            None,
            '',
        )

    # =========================================================
    # ПРОВЕРКА
    # =========================================================

    def validate_parsed(
            self,
            parsed,
    ):
        sections = (
            parsed[
                'sections'
            ]
        )

        if not sections:
            raise CommandError(
                'В EPUB не найдено '
                'элементов канона.'
            )

        variants = {}

        for section in sections:
            variants.setdefault(
                section[
                    'variant'
                ],
                [],
            ).append(
                section
            )

        for (
            variant,
            items,
        ) in variants.items():
            ode_numbers = []

            for item in items:
                ode = (
                    item[
                        'ode_number'
                    ]
                )

                if (
                    ode
                    and
                    ode not in
                    ode_numbers
                ):
                    ode_numbers.append(
                        ode
                    )

                if not item[
                    'content'
                ]:
                    raise CommandError(
                        'Пустой элемент: '
                        f'вариант {variant}, '
                        f'order={item["order"]}.'
                    )

            if not ode_numbers:
                raise CommandError(
                    'Не найдены песни '
                    f'в варианте {variant}.'
                )

            if ode_numbers[0] != 1:
                raise CommandError(
                    'Канон должен начинаться '
                    'с Песни 1. '
                    f'Вариант {variant}: '
                    f'{ode_numbers}'
                )

            if ode_numbers != sorted(
                    ode_numbers
            ):
                raise CommandError(
                    'Нарушен порядок песен. '
                    f'Вариант {variant}: '
                    f'{ode_numbers}'
                )

            if len(
                ode_numbers
            ) != len(
                set(
                    ode_numbers
                )
            ):
                raise CommandError(
                    'Повторяются номера песен. '
                    f'Вариант {variant}: '
                    f'{ode_numbers}'
                )

            invalid = [
                number
                for number
                in ode_numbers
                if not (
                    1 <= number <= 9
                )
            ]

            if invalid:
                raise CommandError(
                    'Недопустимые номера песен: '
                    f'{invalid}'
                )

            if 9 not in ode_numbers:
                raise CommandError(
                    'Не найдена Песнь 9. '
                    f'Вариант {variant}: '
                    f'{ode_numbers}'
                )

    def print_report(
            self,
            parsed,
    ):
        self.stdout.write('')
        self.stdout.write(
            self.style.SUCCESS(
                'Структура канона '
                'распознана.'
            )
        )

        self.stdout.write(
            'Глас: '
            + (
                parsed[
                    'tone'
                ]
                or 'не указан'
            )
        )

        self.stdout.write(
            'Вариантов текста: '
            f'{parsed["variant_count"]}'
        )

        for variant in range(
                1,
                parsed[
                    'variant_count'
                ] + 1,
        ):
            items = [
                section
                for section
                in parsed[
                    'sections'
                ]
                if section[
                    'variant'
                ] == variant
            ]

            ode_numbers = []

            for section in items:
                ode = (
                    section[
                        'ode_number'
                    ]
                )

                if (
                    ode
                    and
                    ode not in
                    ode_numbers
                ):
                    ode_numbers.append(
                        ode
                    )

            counts = Counter(
                section[
                    'section_type'
                ]
                for section
                in items
            )

            translated = sum(
                1
                for section
                in items
                if section[
                    'translation'
                ]
            )

            self.stdout.write('')
            self.stdout.write(
                f'Вариант {variant}:'
            )

            self.stdout.write(
                '  Песни: '
                + ', '.join(
                    str(
                        number
                    )
                    for number
                    in ode_numbers
                )
            )

            self.stdout.write(
                f'  Элементов: '
                f'{len(items)}'
            )

            self.stdout.write(
                f'  С переводом: '
                f'{translated}'
            )

            for (
                section_type,
                count,
            ) in sorted(
                counts.items()
            ):
                self.stdout.write(
                    '  '
                    f'{section_type:12} '
                    f'{count}'
                )

        if parsed[
            'classes'
        ]:
            self.stdout.write('')
            self.stdout.write(
                'HTML-классы EPUB:'
            )

            for (
                class_name,
                count,
            ) in (
                parsed[
                    'classes'
                ]
                .most_common()
            ):
                self.stdout.write(
                    f'  {class_name}: '
                    f'{count}'
                )

        if parsed[
            'headings'
        ]:
            self.stdout.write('')
            self.stdout.write(
                'Распознанные заголовки:'
            )

            for (
                name,
                count,
            ) in sorted(
                parsed[
                    'headings'
                ].items()
            ):
                self.stdout.write(
                    f'  {name}: '
                    f'{count}'
                )

    # =========================================================
    # СОХРАНЕНИЕ
    # =========================================================

    @transaction.atomic
    def save_canon(
            self,
            slug,
            title,
            parsed,
    ):
        canon, created = (
            Canon.objects
            .update_or_create(
                slug=slug,
                defaults={
                    'title':
                        title,

                    'tone':
                        parsed[
                            'tone'
                        ],

                    'is_visible':
                        True,
                },
            )
        )

        self.stdout.write(
            (
                'Создан новый Canon.'
                if created
                else
                'Обновлён существующий Canon.'
            )
        )

        desired = set()

        for section in parsed[
            'sections'
        ]:
            variant = (
                section[
                    'variant'
                ]
            )

            order = (
                section[
                    'order'
                ]
            )

            desired.add(
                (
                    variant,
                    order,
                )
            )

            text_slug = (
                f'{slug}-'
                f'v{variant}-'
                f'section-{order}'
            )

            text_title = (
                section[
                    'heading'
                ]
                or self.make_text_title(
                    section
                )
            )

            text_object, _created = (
                Text.objects
                .update_or_create(
                    slug=text_slug,
                    defaults={
                        'title':
                            text_title[
                                :255
                            ],

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

                        'is_visible':
                            True,
                    },
                )
            )

            CanonSection.objects.update_or_create(
                canon=canon,
                variant=variant,
                order=order,
                defaults={
                    'section_type':
                        section[
                            'section_type'
                        ],

                    'ode_number':
                        section[
                            'ode_number'
                        ],

                    'heading':
                        section[
                            'heading'
                        ][
                            :255
                        ],

                    'text':
                        text_object,
                },
            )

        for existing in (
            CanonSection.objects
            .filter(
                canon=canon
            )
        ):
            key = (
                existing.variant,
                existing.order,
            )

            if key not in desired:
                existing.delete()

        self.stdout.write(
            'Элементов канона в БД: '
            f'{CanonSection.objects.filter(canon=canon).count()}'
        )

    def make_text_title(
            self,
            section,
    ):
        label = (
            SECTION_LABELS.get(
                section[
                    'section_type'
                ],
                'Текст',
            )
        )

        if section[
            'ode_number'
        ]:
            return (
                f'Песнь '
                f'{section["ode_number"]} — '
                f'{label}'
            )

        return label

    # =========================================================
    # ВСПОМОГАТЕЛЬНОЕ
    # =========================================================

    def extract_tone(
            self,
            value,
    ):
        normalized = (
            self.normalize_heading(
                value
            )
        )

        match = re.search(
            r'глас\s+'
            r'([0-9]+|[ivx]+)',
            normalized,
        )

        if not match:
            return ''

        number = (
            self.parse_number(
                match.group(
                    1
                )
            )
        )

        if not number:
            return ''

        return f'Глас {number}'

    def parse_number(
            self,
            value,
    ):
        value = (
            value
            .strip()
            .lower()
        )

        if value.isdigit():
            return int(
                value
            )

        roman = {
            'i': 1,
            'ii': 2,
            'iii': 3,
            'iv': 4,
            'v': 5,
            'vi': 6,
            'vii': 7,
            'viii': 8,
            'ix': 9,
        }

        return roman.get(
            value
        )

    def clean_translation(
            self,
            value,
    ):
        value = self.clean_text(
            value,
            preserve_newlines=True,
        )

        value = re.sub(
            r'^перевод\s*:\s*',
            '',
            value,
            flags=re.IGNORECASE,
        )

        return value.strip()

    def normalize_heading(
            self,
            value,
    ):
        value = self.clean_text(
            value
        )

        value = (
            unicodedata.normalize(
                'NFD',
                value,
            )
        )

        value = ''.join(
            char
            for char
            in value
            if unicodedata.category(
                char
            ) != 'Mn'
        )

        value = (
            value
            .lower()
            .replace(
                'ё',
                'е',
            )
        )

        value = re.sub(
            r'\s+',
            ' ',
            value,
        )

        return value.strip()

    def clean_text(
            self,
            value,
            preserve_newlines=False,
    ):
        if value is None:
            return ''

        value = (
            value
            .replace(
                '\xa0',
                ' ',
            )
            .replace(
                '\u200b',
                '',
            )
        )

        if preserve_newlines:
            lines = []

            for line in value.splitlines():
                line = re.sub(
                    r'[ \t]+',
                    ' ',
                    line,
                ).strip()

                if line:
                    lines.append(
                        line
                    )

            return '\n'.join(
                lines
            ).strip()

        value = re.sub(
            r'\s+',
            ' ',
            value,
        )

        return value.strip()
