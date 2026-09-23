import requests

from bs4 import BeautifulSoup, Tag

from django.core.management.base import (
    BaseCommand,
    CommandError,
)


class Command(BaseCommand):
    help = (
        'Показывает HTML вокруг первой '
        'секции акафиста.'
    )

    def add_arguments(
            self,
            parser,
    ):
        parser.add_argument(
            '--url',
            required=True,
            help='URL страницы',
        )

    def handle(
            self,
            *args,
            **options,
    ):
        url = options['url'].strip()

        try:
            response = requests.get(
                url,
                headers={
                    'User-Agent': (
                        'Mozilla/5.0 '
                        '(Windows NT 10.0; Win64; x64) '
                        'AppleWebKit/537.36 '
                        '(KHTML, like Gecko) '
                        'Chrome/153.0.0.0 '
                        'Safari/537.36'
                    ),
                    'Accept-Language': (
                        'ru-RU,ru;q=0.9,en;q=0.8'
                    ),
                },
                timeout=30,
            )

            response.raise_for_status()

        except requests.RequestException as error:
            raise CommandError(
                str(error)
            ) from error

        soup = BeautifulSoup(
            response.text,
            'html.parser',
        )

        kontakion = None

        for heading in soup.find_all(
                [
                    'h1',
                    'h2',
                    'h3',
                    'h4',
                    'h5',
                    'h6',
                ]
        ):
            text = (
                heading.get_text(
                    ' ',
                    strip=True,
                )
            )

            if text == 'Кондак 1':
                kontakion = heading
                break

        if kontakion is None:
            raise CommandError(
                'Кондак 1 не найден.'
            )

        self.stdout.write(
            '\n========================================'
        )

        self.stdout.write(
            'ЗАГОЛОВОК'
        )

        self.stdout.write(
            '========================================'
        )

        self.stdout.write(
            str(kontakion)
        )

        parent = kontakion.parent

        self.stdout.write(
            '\n\n========================================'
        )

        self.stdout.write(
            'РОДИТЕЛЬ ЗАГОЛОВКА'
        )

        self.stdout.write(
            '========================================'
        )

        self.stdout.write(
            f'Tag: <{parent.name}>'
        )

        self.stdout.write(
            f'Class: {parent.get("class")}'
        )

        self.stdout.write(
            f'ID: {parent.get("id")}'
        )

        parent_html = str(parent)

        self.stdout.write(
            '\nHTML родителя '
            '(первые 12000 символов):\n'
        )

        self.stdout.write(
            parent_html[:12000]
        )

        self.stdout.write(
            '\n\n========================================'
        )

        self.stdout.write(
            'СОСЕДИ ПОСЛЕ <h3> КОНДАК 1'
        )

        self.stdout.write(
            '========================================'
        )

        index = 0

        for sibling in kontakion.next_siblings:
            if isinstance(
                    sibling,
                    Tag,
            ):
                text = (
                    sibling.get_text(
                        ' ',
                        strip=True,
                    )
                )

                if (
                        sibling.name
                        in [
                    'h1',
                    'h2',
                    'h3',
                    'h4',
                    'h5',
                    'h6',
                ]
                        and
                        text == 'Икос 1'
                ):
                    self.stdout.write(
                        '\n--- ДОШЛИ ДО ИКОСА 1 ---'
                    )

                    break

                index += 1

                self.stdout.write(
                    '\n----------------------------------------'
                )

                self.stdout.write(
                    f'#{index}'
                )

                self.stdout.write(
                    f'Tag: <{sibling.name}>'
                )

                self.stdout.write(
                    f'Class: {sibling.get("class")}'
                )

                self.stdout.write(
                    f'ID: {sibling.get("id")}'
                )

                self.stdout.write(
                    f'Text: {text[:1000]!r}'
                )

                html = str(sibling)

                self.stdout.write(
                    'HTML:'
                )

                self.stdout.write(
                    html[:3000]
                )

            else:
                text = str(
                    sibling
                ).strip()

                if not text:
                    continue

                index += 1

                self.stdout.write(
                    '\n----------------------------------------'
                )

                self.stdout.write(
                    f'#{index} TEXT NODE'
                )

                self.stdout.write(
                    repr(
                        text[:1500]
                    )
                )

        self.stdout.write(
            '\n\n========================================'
        )

        self.stdout.write(
            'ВСЕ ЭЛЕМЕНТЫ МЕЖДУ '
            'КОНДАКОМ 1 И ИКОСОМ 1'
        )

        self.stdout.write(
            '========================================'
        )

        index = 0

        for element in kontakion.next_elements:
            if not isinstance(
                    element,
                    Tag,
            ):
                continue

            if (
                    element.name
                    in [
                'h1',
                'h2',
                'h3',
                'h4',
                'h5',
                'h6',
            ]
                    and
                    element is not kontakion
                    and
                    element.get_text(
                        ' ',
                        strip=True,
                    )
                    == 'Икос 1'
            ):
                break

            if element is kontakion:
                continue

            if kontakion in element.parents:
                continue

            index += 1

            text = (
                element.get_text(
                    ' ',
                    strip=True,
                )
            )

            self.stdout.write(
                f'\n#{index} '
                f'<{element.name}> '
                f'class={element.get("class")} '
                f'text={text[:500]!r}'
            )

            if index >= 50:
                break