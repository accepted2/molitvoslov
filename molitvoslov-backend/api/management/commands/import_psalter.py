import json

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from api.models import (
    Psalter,
    Kathisma,
    Psalm,
    PsalmVerse,
    KathismaGlory,
)


class Command(BaseCommand):
    help = 'Импортирует Псалтирь из структурированного JSON'

    def add_arguments(self, parser):
        parser.add_argument('json_file', type=str)
        parser.add_argument(
            '--replace',
            action='store_true',
            help='Заменить импортируемые кафизмы, если они уже существуют',
        )

    @transaction.atomic
    def handle(self, *args, **options):
        path = options['json_file']
        replace = options['replace']

        try:
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except (OSError, json.JSONDecodeError) as exc:
            raise CommandError(f'Не удалось прочитать JSON: {exc}')

        psalter_data = data.get('psalter')
        kathismas_data = data.get('kathismas', [])

        if not psalter_data:
            raise CommandError('В JSON отсутствует объект "psalter".')

        psalter, _ = Psalter.objects.update_or_create(
            slug=psalter_data['slug'],
            defaults={
                'name': psalter_data.get('name', 'Псалтирь'),
                'description': psalter_data.get('description', ''),
                "prayers_before": psalter_data.get(
                    "prayers_before",
                    ""
                ),
                "prayers_after": psalter_data.get(
                    "prayers_after",
                    ""
                ),
                'is_visible': psalter_data.get('is_visible', True),
            }
        )

        imported_kathismas = 0
        imported_psalms = 0
        imported_verses = 0
        imported_glories = 0

        for kathisma_data in kathismas_data:
            number = kathisma_data['number']

            existing = Kathisma.objects.filter(
                psalter=psalter,
                number=number,
            ).first()

            if existing and replace:
                existing.delete()
                existing = None

            if existing:
                raise CommandError(
                    f'Кафизма {number} уже существует. '
                    f'Используй --replace для замены.'
                )

            kathisma = Kathisma.objects.create(
                psalter=psalter,
                number=number,
                title=kathisma_data.get('title', ''),
                prayers_after=kathisma_data.get(
                    'prayers_after',
                    ''
                ),
            )
            imported_kathismas += 1

            psalm_map = {}
            verse_map = {}

            for psalm_data in kathisma_data.get('psalms', []):
                psalm_number = psalm_data['number']

                # В текущей модели Psalm.number unique=True, поэтому один
                # номер псалма может существовать только один раз во всей БД.
                old_psalm = Psalm.objects.filter(number=psalm_number).first()
                if old_psalm:
                    if replace:
                        old_psalm.delete()
                    else:
                        raise CommandError(
                            f'Псалом {psalm_number} уже существует. '
                            f'Используй --replace.'
                        )

                psalm = Psalm.objects.create(
                    kathisma=kathisma,
                    number=psalm_number,
                    title_church_slavonic=psalm_data.get(
                        'title_church_slavonic',
                        ''
                    ),
                    title_russian=psalm_data.get(
                        'title_russian',
                        ''
                    ),
                    description=psalm_data.get(
                        'description',
                        ''
                    ),
                )
                psalm_map[psalm_number] = psalm
                imported_psalms += 1

                for verse_data in psalm_data.get('verses', []):
                    verse = PsalmVerse.objects.create(
                        psalm=psalm,
                        number=verse_data['number'],
                        church_slavonic=verse_data.get(
                            'church_slavonic',
                            ''
                        ),
                        russian=verse_data.get(
                            'russian',
                            ''
                        ),
                    )
                    verse_map[
                        (psalm_number, verse.number)
                    ] = verse
                    imported_verses += 1

            for glory_data in kathisma_data.get('glories', []):
                after_psalm_number = glory_data.get('after_psalm')
                after_verse_number = glory_data.get('after_verse')

                if after_psalm_number is not None:
                    after_psalm = psalm_map.get(after_psalm_number)

                    if after_psalm is None:
                        raise CommandError(
                            f'Слава {glory_data["number"]}: '
                            f'псалом {after_psalm_number} не найден.'
                        )

                    KathismaGlory.objects.create(
                        kathisma=kathisma,
                        number=glory_data['number'],
                        after_psalm=after_psalm,
                    )

                elif after_verse_number is not None:
                    # Формат для будущих случаев:
                    # "after_verse": {"psalm": 118, "verse": 72}
                    if not isinstance(after_verse_number, dict):
                        raise CommandError(
                            '"after_verse" должен быть объектом '
                            '{"psalm": N, "verse": N}.'
                        )

                    key = (
                        after_verse_number['psalm'],
                        after_verse_number['verse'],
                    )
                    verse = verse_map.get(key)

                    if verse is None:
                        raise CommandError(
                            f'Слава {glory_data["number"]}: '
                            f'стих {key} не найден.'
                        )

                    KathismaGlory.objects.create(
                        kathisma=kathisma,
                        number=glory_data['number'],
                        after_verse=verse,
                    )

                else:
                    raise CommandError(
                        f'Слава {glory_data["number"]} '
                        'не имеет позиции.'
                    )

                imported_glories += 1

        self.stdout.write(
            self.style.SUCCESS(
                'Импорт завершён: '
                f'кафизм — {imported_kathismas}, '
                f'псалмов — {imported_psalms}, '
                f'стихов — {imported_verses}, '
                f'Слав — {imported_glories}.'
            )
        )
