import hashlib
import json
import re
from pathlib import Path
from urllib.request import Request, urlopen
from xml.etree import ElementTree

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from api.models import (
    BibleBook,
    BibleChapter,
    BibleTranslation,
    BibleVerse,
)


SOURCE_REPOSITORY = 'https://github.com/bibleonline/rst'
SOURCE_REVISION = '2de3062388a2c067bc602399bda7149eec918ceb'
SOURCE_BASE_URL = (
    'https://raw.githubusercontent.com/'
    f'bibleonline/rst/{SOURCE_REVISION}/usfm/rst78'
)
TRANSLATION_CODE = 'rst'
TRANSLATION_NAME = 'Синодальный перевод'
LICENSE_NAME = 'Public Domain'

SOURCE_FILES = (
    '01-genesis.usfm',
    '02-exodus.usfm',
    '03-leviticus.usfm',
    '04-numbers.usfm',
    '05-deuteronomy.usfm',
    '06-joshua.usfm',
    '07-judges.usfm',
    '08-ruth.usfm',
    '09-1samuel.usfm',
    '10-2samuel.usfm',
    '11-1kings.usfm',
    '12-2kings.usfm',
    '13-1chronicles.usfm',
    '14-2chronicles.usfm',
    '15-prayerofmanasseh.usfm',
    '16-ezra.usfm',
    '17-nehemiah.usfm',
    '18-1esdras.usfm',
    '19-tobit.usfm',
    '20-judith.usfm',
    '21-esther.usfm',
    '22-job.usfm',
    '23-psalms.usfm',
    '24-proverbs.usfm',
    '25-ecclesiastes.usfm',
    '26-songofsolomon.usfm',
    '27-wisdomofsolomon.usfm',
    '28-sirach.usfm',
    '29-isaiah.usfm',
    '30-jeremiah.usfm',
    '31-lamentations.usfm',
    '32-letterofjeremiah.usfm',
    '33-baruch.usfm',
    '34-ezekiel.usfm',
    '35-daniel.usfm',
    '36-hosea.usfm',
    '37-joel.usfm',
    '38-amos.usfm',
    '39-obadiah.usfm',
    '40-jonah.usfm',
    '41-micah.usfm',
    '42-nahum.usfm',
    '43-habakkuk.usfm',
    '44-zephaniah.usfm',
    '45-haggai.usfm',
    '46-zechariah.usfm',
    '47-malachi.usfm',
    '48-1maccabees.usfm',
    '49-2maccabees.usfm',
    '50-3maccabees.usfm',
    '51-2esdras.usfm',
    '52-matthew.usfm',
    '53-mark.usfm',
    '54-luke.usfm',
    '55-john.usfm',
    '56-acts.usfm',
    '57-james.usfm',
    '58-1peter.usfm',
    '59-2peter.usfm',
    '60-1john.usfm',
    '61-2john.usfm',
    '62-3john.usfm',
    '63-jude.usfm',
    '64-romans.usfm',
    '65-1corinthians.usfm',
    '66-2corinthians.usfm',
    '67-galatians.usfm',
    '68-ephesians.usfm',
    '69-philippians.usfm',
    '70-colossians.usfm',
    '71-1thessalonians.usfm',
    '72-2thessalonians.usfm',
    '73-1timothy.usfm',
    '74-2timothy.usfm',
    '75-titus.usfm',
    '76-philemon.usfm',
    '77-hebrews.usfm',
    '78-revelation.usfm',
)

NOTE_RE = re.compile(
    r'\\(?:f|x)\b.*?\\(?:f|x)\*',
    flags=re.DOTALL,
)
WORD_RE = re.compile(
    r'\\\+?w\s+([^|\\]+)\|[^\\]*\\\+?w\*'
)
MARKER_RE = re.compile(
    r'\\\+?[A-Za-z][A-Za-z0-9-]*\*?'
)
CHAPTER_RE = re.compile(r'^\\c\s+(\d+)\b')
VERSE_RE = re.compile(r'\\v\s+(\d+)\s*(.*)$')
ID_RE = re.compile(
    r'^\\id\s+([A-Z0-9]+)\b',
    flags=re.MULTILINE,
)

CONTINUATION_MARKERS = {
    'p', 'm', 'q', 'q1', 'q2', 'q3', 'q4',
    'qr', 'qc', 'qm', 'qm1', 'qm2', 'qm3',
    'pi', 'pi1', 'pi2', 'pi3', 'mi', 'nb',
    'li', 'li1', 'li2', 'li3', 'li4',
    'add', 'em', 'bd', 'it', 'wj', 'nd', 'sc', 'qt',
}


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def clean_usfm_text(value):
    value = WORD_RE.sub(
        lambda match: match.group(1),
        value,
    )
    value = MARKER_RE.sub('', value)
    value = re.sub(r'\s+', ' ', value)
    return value.strip()


def parse_book_names(path):
    root = ElementTree.parse(path).getroot()
    books = {}

    for node in root.findall('book'):
        code = node.attrib.get('code', '').strip()
        if not code:
            continue

        books[code] = {
            'abbr': node.attrib.get('abbr', '').strip(),
            'short': node.attrib.get('short', '').strip(),
            'long': node.attrib.get('long', '').strip(),
        }

    return books


def parse_usfm(path):
    source = path.read_text(encoding='utf-8-sig')
    source = NOTE_RE.sub(' ', source)

    id_match = ID_RE.search(source)
    if not id_match:
        raise CommandError(
            f'В {path.name} не найден USFM-маркер \\\\id.'
        )

    book_code = id_match.group(1)
    chapters = {}
    current_chapter = None
    current_verse = None

    for raw_line in source.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        chapter_match = CHAPTER_RE.match(line)
        if chapter_match:
            current_chapter = int(chapter_match.group(1))
            current_verse = None
            chapters.setdefault(current_chapter, {})
            continue

        verse_match = VERSE_RE.search(line)
        if verse_match:
            if current_chapter is None:
                raise CommandError(
                    f'Стих до главы в {path.name}: {line[:80]}'
                )

            current_verse = int(verse_match.group(1))
            verse_text = clean_usfm_text(
                verse_match.group(2)
            )
            verse_map = chapters[current_chapter]

            if current_verse in verse_map:
                if verse_text:
                    verse_map[current_verse] = (
                        f'{verse_map[current_verse]} {verse_text}'
                    ).strip()
            else:
                verse_map[current_verse] = verse_text
            continue

        if current_chapter is None or current_verse is None:
            continue

        leading_marker = re.match(
            r'^\\([A-Za-z0-9]+)\b',
            line,
        )
        if (
            leading_marker
            and leading_marker.group(1)
            not in CONTINUATION_MARKERS
        ):
            continue

        continuation = clean_usfm_text(line)
        if continuation:
            previous = chapters[current_chapter][current_verse]
            chapters[current_chapter][current_verse] = (
                f'{previous} {continuation}'
            ).strip()

    if not chapters:
        raise CommandError(
            f'В {path.name} не найдено ни одной главы.'
        )

    for chapter_number, verses in chapters.items():
        if not verses:
            raise CommandError(
                f'{path.name}, глава {chapter_number}: нет стихов.'
            )

        for verse_number, text in verses.items():
            if verse_number <= 0:
                raise CommandError(
                    f'{path.name}: некорректный номер стиха '
                    f'{verse_number}.'
                )
            if not text:
                raise CommandError(
                    f'{path.name}, {chapter_number}:{verse_number}: '
                    'пустой стих.'
                )

    return book_code, chapters


def source_slug(filename):
    return Path(filename).stem.split('-', 1)[1]


def source_section(order):
    if order <= 51:
        return BibleBook.SECTION_OLD
    if order <= 55:
        return BibleBook.SECTION_GOSPELS
    if order == 56:
        return BibleBook.SECTION_ACTS
    if order <= 77:
        return BibleBook.SECTION_EPISTLES
    return BibleBook.SECTION_REVELATION


def source_testament(order):
    if order <= 51:
        return BibleBook.TESTAMENT_OLD
    return BibleBook.TESTAMENT_NEW


class Command(BaseCommand):
    help = (
        'Импортирует полную русскую Синодальную Библию из '
        'закреплённого USFM-источника bibleonline/rst.'
    )

    def add_arguments(self, parser):
        default_source_dir = (
            settings.BASE_DIR / 'files' / 'bible' / 'rst78'
        )
        parser.add_argument(
            '--source-dir',
            default=str(default_source_dir),
            help='Каталог с BookNames.xml и 78 USFM-файлами.',
        )
        parser.add_argument(
            '--download',
            action='store_true',
            help=(
                'Перед импортом скачать исходники из закреплённой '
                'ревизии GitHub.'
            ),
        )
        parser.add_argument(
            '--check-only',
            action='store_true',
            help='Только проверить и распарсить источник, без записи в БД.',
        )

    def handle(self, *args, **options):
        source_dir = Path(options['source_dir']).resolve()

        if options['download']:
            self.download_source(source_dir)

        self.ensure_source_complete(source_dir)

        book_names = parse_book_names(
            source_dir / 'BookNames.xml'
        )
        if len(book_names) != 78:
            raise CommandError(
                'BookNames.xml должен содержать 78 машинных единиц, '
                f'получено: {len(book_names)}.'
            )

        parsed_books = []
        total_chapters = 0
        total_verses = 0

        for order, filename in enumerate(SOURCE_FILES, start=1):
            path = source_dir / filename
            code, chapters = parse_usfm(path)
            metadata = book_names.get(code)

            if not metadata:
                raise CommandError(
                    f'Для {code} нет названия в BookNames.xml.'
                )

            total_chapters += len(chapters)
            total_verses += sum(
                len(verses)
                for verses in chapters.values()
            )
            parsed_books.append({
                'order': order,
                'filename': filename,
                'code': code,
                'slug': source_slug(filename),
                'metadata': metadata,
                'chapters': chapters,
            })

        codes = [item['code'] for item in parsed_books]
        if len(set(codes)) != 78:
            raise CommandError(
                'В источнике обнаружены повторяющиеся USFM-коды книг.'
            )

        if (
            parsed_books[0]['code'] != 'GEN'
            or parsed_books[-1]['code'] != 'REV'
        ):
            raise CommandError(
                'Нарушен ожидаемый порядок: GEN ... REV.'
            )

        self.stdout.write(
            self.style.SUCCESS(
                'Источник проверен: '
                f'78 единиц, {total_chapters} глав, '
                f'{total_verses} стихов.'
            )
        )

        if options['check_only']:
            return

        with transaction.atomic():
            translation, _ = (
                BibleTranslation.objects.update_or_create(
                    code=TRANSLATION_CODE,
                    defaults={
                        'name': TRANSLATION_NAME,
                        'language': 'ru',
                        'source_url': SOURCE_REPOSITORY,
                        'source_revision': SOURCE_REVISION,
                        'license_name': LICENSE_NAME,
                        'is_visible': True,
                    },
                )
            )

            seen_book_codes = []

            for parsed in parsed_books:
                order = parsed['order']
                metadata = parsed['metadata']
                code = parsed['code']

                book, _ = (
                    BibleBook.objects.update_or_create(
                        translation=translation,
                        code=code,
                        defaults={
                            'testament': source_testament(order),
                            'section': source_section(order),
                            'name': (
                                metadata['long']
                                or metadata['short']
                                or code
                            ),
                            'short_name': (
                                metadata['short']
                                or metadata['long']
                                or code
                            ),
                            'slug': parsed['slug'],
                            'canonical_order': order,
                            'is_appendix': code == 'MAN',
                        },
                    )
                )
                seen_book_codes.append(code)
                self.sync_book(
                    book,
                    parsed['chapters'],
                )

            (
                translation.books
                .exclude(code__in=seen_book_codes)
                .delete()
            )

        actual_books = (
            BibleBook.objects
            .filter(translation__code=TRANSLATION_CODE)
            .count()
        )
        actual_chapters = (
            BibleChapter.objects
            .filter(book__translation__code=TRANSLATION_CODE)
            .count()
        )
        actual_verses = (
            BibleVerse.objects
            .filter(
                chapter__book__translation__code=TRANSLATION_CODE
            )
            .count()
        )

        if (
            actual_books != 78
            or actual_chapters != total_chapters
            or actual_verses != total_verses
        ):
            raise CommandError(
                'Контроль количества после импорта не пройден: '
                f'книги {actual_books}/78, '
                f'главы {actual_chapters}/{total_chapters}, '
                f'стихи {actual_verses}/{total_verses}.'
            )

        self.stdout.write(
            self.style.SUCCESS(
                'Импорт завершён: '
                f'{actual_books} книг/единиц '
                '(51 ВЗ + 27 НЗ), '
                f'{actual_chapters} глав, '
                f'{actual_verses} стихов.'
            )
        )

    def ensure_source_complete(self, source_dir):
        expected = [
            source_dir / 'BookNames.xml',
            *(
                source_dir / filename
                for filename in SOURCE_FILES
            ),
        ]
        missing = [
            path.name
            for path in expected
            if not path.exists()
        ]

        if missing:
            preview = ', '.join(missing[:5])
            extra = (
                f' и ещё {len(missing) - 5}'
                if len(missing) > 5
                else ''
            )
            raise CommandError(
                'Не хватает файлов источника: '
                f'{preview}{extra}. '
                'Запустите команду с --download.'
            )

    def download_source(self, source_dir):
        source_dir.mkdir(
            parents=True,
            exist_ok=True,
        )

        names = ('BookNames.xml', *SOURCE_FILES)
        manifest = {
            'repository': SOURCE_REPOSITORY,
            'revision': SOURCE_REVISION,
            'format': 'USFM',
            'source_directory': 'usfm/rst78',
            'files': {},
        }

        for index, filename in enumerate(names, start=1):
            url = f'{SOURCE_BASE_URL}/{filename}'
            request = Request(
                url,
                headers={
                    'User-Agent': (
                        'molitvoslov-bible-importer/1.0'
                    ),
                },
            )

            try:
                with urlopen(request, timeout=60) as response:
                    data = response.read()
            except Exception as error:
                raise CommandError(
                    f'Не удалось скачать {filename}: {error}'
                ) from error

            (source_dir / filename).write_bytes(data)
            manifest['files'][filename] = sha256_bytes(data)
            self.stdout.write(
                f'[{index}/{len(names)}] {filename}'
            )

        (
            source_dir / 'source_manifest.json'
        ).write_text(
            json.dumps(
                manifest,
                ensure_ascii=False,
                indent=2,
                sort_keys=True,
            ) + '\n',
            encoding='utf-8',
        )

        self.stdout.write(
            self.style.SUCCESS(
                'Источник скачан из закреплённой ревизии '
                f'{SOURCE_REVISION}.'
            )
        )

    def sync_book(self, book, parsed_chapters):
        wanted_chapter_numbers = set(parsed_chapters.keys())
        existing_chapters = {
            chapter.number: chapter
            for chapter in book.chapters.all()
        }

        missing_chapters = [
            BibleChapter(
                book=book,
                number=number,
            )
            for number in sorted(wanted_chapter_numbers)
            if number not in existing_chapters
        ]
        if missing_chapters:
            BibleChapter.objects.bulk_create(
                missing_chapters
            )

        chapters = {
            chapter.number: chapter
            for chapter in book.chapters.all()
        }
        existing_verses = {
            (verse.chapter.number, verse.number): verse
            for verse in (
                BibleVerse.objects
                .filter(chapter__book=book)
                .select_related('chapter')
            )
        }

        wanted_keys = set()
        to_create = []
        to_update = []

        for chapter_number, verses in parsed_chapters.items():
            chapter = chapters[chapter_number]

            for verse_number, text in verses.items():
                key = (chapter_number, verse_number)
                wanted_keys.add(key)
                existing = existing_verses.get(key)

                if existing is None:
                    to_create.append(
                        BibleVerse(
                            chapter=chapter,
                            number=verse_number,
                            text=text,
                        )
                    )
                    continue

                if existing.text != text:
                    existing.text = text
                    to_update.append(existing)

        if to_create:
            BibleVerse.objects.bulk_create(
                to_create,
                batch_size=1000,
            )
        if to_update:
            BibleVerse.objects.bulk_update(
                to_update,
                ['text'],
                batch_size=1000,
            )

        stale_verse_ids = [
            verse.id
            for key, verse in existing_verses.items()
            if key not in wanted_keys
        ]
        if stale_verse_ids:
            (
                BibleVerse.objects
                .filter(id__in=stale_verse_ids)
                .delete()
            )

        (
            book.chapters
            .exclude(number__in=wanted_chapter_numbers)
            .delete()
        )
