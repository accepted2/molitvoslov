from django.core.management import call_command
from django.core.management.base import BaseCommand


AKATHISTS = [
    {
        'url': (
            'https://azbyka.ru/bogosluzhenie/'
            'kanon-s-akafistom-svyatitelyu-i-chudotvorczu-nikolayu/'
        ),
        'slug': (
            'akafist-svyatitelyu-nikolayu'
        ),
        'title': (
            'Акафист святителю Николаю Чудотворцу'
        ),
    },

    {
        'url': (
            'https://azbyka.ru/molitvoslov/'
            'akafist-svjatoj-pravednoj-matrone-moskovskoj.html'
        ),
        'slug': (
            'akafist-svyatoj-pravednoj-matrone-moskovskoj'
        ),
        'title': (
            'Акафист святой праведной Матроне Московской'
        ),
    },

    {
        'url': (
            'https://azbyka.ru/molitvoslov/'
            'akafist-svjatomu-velikomucheniku-i-celitelju-panteleimonu.html'
        ),
        'slug': (
            'akafist-svyatomu-velikomucheniku-i-celitelyu-panteleimonu'
        ),
        'title': (
            'Акафист святому великомученику '
            'и целителю Пантелеимону'
        ),
    },

    {
        'url': (
            'https://azbyka.ru/molitvoslov/'
            'akafist-iisusu-sladchajshemu.html'
        ),
        'slug': (
            'akafist-iisusu-sladchajshemu'
        ),
        'title': (
            'Акафист Иисусу Сладчайшему'
        ),
    },

    {
        'url': (
            'https://azbyka.ru/molitvoslov/'
            'akafist-presvjatoj-bogorodice-pred-ikonoj-kazanskaja.html'
        ),
        'slug': (
            'akafist-presvyatoy-bogorodice-pred-ikonoy-kazanskaya'
        ),
        'title': (
            'Акафист Пресвятой Богородице '
            'пред иконой «Казанская»'
        ),
    },

    {
        'url': (
            'https://azbyka.ru/molitvoslov/'
            'akafist-presvjatoj-bogorodice-pred-ikonoj-vsecarica.html'
        ),
        'slug': (
            'akafist-presvyatoy-bogorodice-pred-ikonoy-vsecarica'
        ),
        'title': (
            'Акафист Пресвятой Богородице '
            'пред иконой «Всецарица»'
        ),
    },

    {
        'url': (
            'https://azbyka.ru/molitvoslov/'
            'akafist-svjatitelju-spiridonu-trimifuntskomu-chudotvorcu.html'
        ),
        'slug': (
            'akafist-svyatitelyu-spiridonu-trimifuntskomu'
        ),
        'title': (
            'Акафист святителю Спиридону '
            'Тримифунтскому, чудотворцу'
        ),
    },

    {
        'url': (
            'https://azbyka.ru/molitvoslov/'
            'akafist-presvjatoj-bogorodice-'
            'velikij-akafist-chitaemyj-v-subbotu-akafista.html'
        ),
        'slug': (
            'velikiy-akafist-presvyatoy-bogorodice'
        ),
        'title': (
            'Акафист Пресвятой Богородице '
            '(Великий акафист)'
        ),
    },
]


class Command(BaseCommand):
    help = (
        'Импортирует все акафисты '
        'из списка AKATHISTS.'
    )

    def add_arguments(
            self,
            parser,
    ):
        parser.add_argument(
            '--stop-on-error',
            action='store_true',
            help=(
                'Остановить импорт '
                'при первой ошибке.'
            ),
        )

    def handle(
            self,
            *args,
            **options,
    ):
        stop_on_error = (
            options['stop_on_error']
        )

        total = len(
            AKATHISTS
        )

        successful = []
        failed = []

        self.stdout.write(
            '\n'
            '========================================'
        )

        self.stdout.write(
            'МАССОВЫЙ ИМПОРТ АКАФИСТОВ'
        )

        self.stdout.write(
            '========================================'
        )

        self.stdout.write(
            f'\nВсего в списке: {total}'
        )

        for index, akathist in enumerate(
                AKATHISTS,
                start=1,
        ):
            title = akathist[
                'title'
            ]

            slug = akathist[
                'slug'
            ]

            url = akathist[
                'url'
            ]

            self.stdout.write(
                '\n'
                '========================================'
            )

            self.stdout.write(
                f'[{index}/{total}]'
            )

            self.stdout.write(
                title
            )

            self.stdout.write(
                f'Slug: {slug}'
            )

            self.stdout.write(
                f'URL: {url}'
            )

            self.stdout.write(
                '========================================'
            )

            try:
                call_command(
                    'import_akathist',
                    url=url,
                    slug=slug,
                    title=title,
                )

                successful.append({
                    'title':
                        title,

                    'slug':
                        slug,

                    'url':
                        url,
                })

                self.stdout.write(
                    self.style.SUCCESS(
                        '\nГОТОВО: '
                        f'{title}'
                    )
                )

            except Exception as error:
                failed.append({
                    'title':
                        title,

                    'slug':
                        slug,

                    'url':
                        url,

                    'error':
                        str(error),
                })

                self.stdout.write(
                    self.style.ERROR(
                        '\nОШИБКА: '
                        f'{title}'
                    )
                )

                self.stdout.write(
                    self.style.ERROR(
                        str(error)
                    )
                )

                if stop_on_error:
                    self.stdout.write(
                        self.style.ERROR(
                            '\nИмпорт остановлен '
                            'из-за --stop-on-error.'
                        )
                    )

                    break

        self.print_summary(
            successful=successful,
            failed=failed,
            total=total,
        )

    def print_summary(
            self,
            successful,
            failed,
            total,
    ):
        self.stdout.write(
            '\n\n'
            '========================================'
        )

        self.stdout.write(
            'ИТОГ'
        )

        self.stdout.write(
            '========================================'
        )

        self.stdout.write(
            f'\nВсего в списке: '
            f'{total}'
        )

        self.stdout.write(
            self.style.SUCCESS(
                f'Успешно: '
                f'{len(successful)}'
            )
        )

        if failed:
            self.stdout.write(
                self.style.ERROR(
                    f'С ошибками: '
                    f'{len(failed)}'
                )
            )

        else:
            self.stdout.write(
                self.style.SUCCESS(
                    'С ошибками: 0'
                )
            )

        if successful:
            self.stdout.write(
                '\nУспешно импортированы:'
            )

            for item in successful:
                self.stdout.write(
                    self.style.SUCCESS(
                        '  ✓ '
                        f'{item["title"]}'
                    )
                )

                self.stdout.write(
                    '    API: '
                    f'/api/akathists/'
                    f'{item["slug"]}/'
                )

        if failed:
            self.stdout.write(
                '\n'
                '========================================'
            )

            self.stdout.write(
                self.style.ERROR(
                    'ТРЕБУЮТ РАЗБОРА'
                )
            )

            self.stdout.write(
                '========================================'
            )

            for item in failed:
                self.stdout.write(
                    self.style.ERROR(
                        '\n  ✗ '
                        f'{item["title"]}'
                    )
                )

                self.stdout.write(
                    f'    Slug: '
                    f'{item["slug"]}'
                )

                self.stdout.write(
                    f'    URL: '
                    f'{item["url"]}'
                )

                self.stdout.write(
                    f'    Ошибка: '
                    f'{item["error"]}'
                )

        self.stdout.write(
            '\n'
            '========================================'
        )

        if failed:
            self.stdout.write(
                self.style.WARNING(
                    'Импорт завершён '
                    'с ошибками.'
                )
            )

        else:
            self.stdout.write(
                self.style.SUCCESS(
                    'Все акафисты '
                    'импортированы успешно.'
                )
            )