import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db.models import Prefetch

from api.models import (
    BibleBook,
    BibleChapter,
    BibleTranslation,
    BibleVerse,
)


class Command(BaseCommand):
    help = (
        'Экспортирует Библию в отдельный bundled JSON '
        'для мобильного приложения.'
    )

    def add_arguments(self, parser):
        default_output = (
            settings.BASE_DIR.parent
            / 'molitvoslov-app'
            / 'src'
            / 'data'
            / 'offlineBible.json'
        )
        parser.add_argument(
            '--translation',
            default='rst',
            help='Код перевода. По умолчанию: rst.',
        )
        parser.add_argument(
            '--output',
            default=str(default_output),
            help='Куда сохранить offlineBible.json.',
        )

    def handle(self, *args, **options):
        translation_code = options['translation']
        output_path = Path(options['output']).resolve()

        translation = (
            BibleTranslation.objects
            .filter(
                code=translation_code,
                is_visible=True,
            )
            .first()
        )
        if translation is None:
            raise CommandError(
                f'Перевод {translation_code!r} не найден. '
                'Сначала выполните import_bible_synodal.'
            )

        verses = (
            BibleVerse.objects
            .all()
            .order_by('number', 'id')
        )
        chapters = (
            BibleChapter.objects
            .all()
            .order_by('number', 'id')
            .prefetch_related(
                Prefetch(
                    'verses',
                    queryset=verses,
                )
            )
        )
        books = (
            BibleBook.objects
            .filter(translation=translation)
            .order_by('canonical_order', 'id')
            .prefetch_related(
                Prefetch(
                    'chapters',
                    queryset=chapters,
                )
            )
        )

        data = {
            'schema_version': 1,
            'translation': {
                'id': translation.id,
                'code': translation.code,
                'name': translation.name,
                'language': translation.language,
                'source_url': translation.source_url,
                'source_revision': translation.source_revision,
                'license': translation.license_name,
            },
            'books': [],
        }

        total_chapters = 0
        total_verses = 0

        for book in books:
            book_data = {
                'id': book.id,
                'code': book.code,
                'testament': book.testament,
                'section': book.section,
                'name': book.name,
                'short_name': book.short_name,
                'slug': book.slug,
                'canonical_order': book.canonical_order,
                'is_appendix': book.is_appendix,
                'chapters': [],
            }

            for chapter in book.chapters.all():
                chapter_data = {
                    'id': chapter.id,
                    'number': chapter.number,
                    'verses': [],
                }

                for verse in chapter.verses.all():
                    chapter_data['verses'].append({
                        'id': verse.id,
                        'number': verse.number,
                        'text': verse.text,
                    })
                    total_verses += 1

                book_data['chapters'].append(chapter_data)
                total_chapters += 1

            data['books'].append(book_data)

        if len(data['books']) != 78:
            raise CommandError(
                'Ожидалось 78 машинных книг/единиц, '
                f'получено {len(data["books"])}.'
            )

        output_path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )
        output_path.write_text(
            json.dumps(
                data,
                ensure_ascii=False,
                indent=2,
            ) + '\n',
            encoding='utf-8',
        )

        self.stdout.write(
            self.style.SUCCESS(
                f'Библия экспортирована: {output_path}\n'
                f'78 книг/единиц, {total_chapters} глав, '
                f'{total_verses} стихов.'
            )
        )
