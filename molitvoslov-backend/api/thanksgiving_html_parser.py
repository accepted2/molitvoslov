import re
import unicodedata

from bs4 import BeautifulSoup, Tag


DEFAULT_SLUG = (
    'blagodarstvennye-molitvy-'
    'po-svyatom-prichashchenii'
)


def _clean_spaces(value):
    value = re.sub(
        r'\s+',
        ' ',
        value or ''
    ).strip()

    value = re.sub(
        r'\s+([,.;:!?])',
        r'\1',
        value
    )

    value = re.sub(
        r'\(\s+',
        '(',
        value
    )

    value = re.sub(
        r'\s+\)',
        ')',
        value
    )

    return value


def _strip_accents(value):
    decomposed = unicodedata.normalize(
        'NFD',
        value or ''
    )

    return ''.join(
        char
        for char in decomposed
        if unicodedata.category(char) != 'Mn'
    ).lower()


def _tag_text(tag):
    return _clean_spaces(
        tag.get_text(
            ' ',
            strip=True
        )
    )


def _class_name(tag):
    value = tag.get('class') or ''

    if isinstance(value, list):
        return ' '.join(value)

    return value


def _is_variant_start(tag):
    if (
        tag.name != 'p'
        or _class_name(tag) != 'paint'
    ):
        return False

    normalized = _strip_accents(
        _tag_text(tag)
    )

    return normalized.startswith(
        'слава тебе, боже. '
        'слава тебе, боже. '
        'слава тебе, боже.'
    )


def _is_notes_heading(tag):
    if tag.name != 'p':
        return False

    return (
        _strip_accents(
            _tag_text(tag)
        )
        == 'примечания'
    )


def _clean_translation(tag):
    value = _tag_text(tag)

    return re.sub(
        r'^\s*Перевод\s*:\s*',
        '',
        value,
        flags=re.IGNORECASE,
    ).strip()


def _extract_paint(tag):
    clone = BeautifulSoup(
        str(tag),
        'lxml-xml'
    ).find(tag.name)

    notes = []

    for note_tag in clone.find_all(
        ['em', 'i']
    ):
        value = _tag_text(
            note_tag
        )

        if value:
            notes.append(
                value
            )

        note_tag.extract()

    for link in clone.find_all('a'):
        href = (
            link.get('href')
            or ''
        )

        name = (
            link.get('name')
            or ''
        )

        value = _tag_text(
            link
        )

        if (
            href.startswith(
                '#_ftn'
            )
            or name.startswith(
                '_ftnref'
            )
            or re.fullmatch(
                r'\(\d+\)',
                value
            )
        ):
            link.extract()

    return (
        _tag_text(clone),
        ' '.join(
            notes
        ).strip(),
    )


def _read_source(path):
    with open(
        path,
        'r',
        encoding='utf-8',
    ) as file:
        return file.read()


def parse_thanksgiving_html(
    path,
    variant='male',
):
    if variant not in {
        'male',
        'female',
    }:
        raise ValueError(
            'variant должен быть male или female'
        )

    raw = _read_source(
        path
    )

    soup = BeautifulSoup(
        raw,
        'lxml-xml'
    )

    body = soup.find('body')

    if body is None:
        raise ValueError(
            'В HTML не найден <body>.'
        )

    title_tag = (
        soup.find('h1')
        or soup.find('title')
    )

    title = (
        _tag_text(title_tag)
        if title_tag
        else (
            'Благодарственные молитвы '
            'по Святом Причащении'
        )
    )

    nodes = [
        node
        for node in body.children
        if isinstance(
            node,
            Tag
        )
    ]

    starts = [
        index
        for index, node
        in enumerate(nodes)
        if _is_variant_start(
            node
        )
    ]

    if not starts:
        raise ValueError(
            'Не найдено начало благодарственных молитв '
            '«Слава Тебе, Боже»'
        )

    variant_index = (
        0
        if variant == 'male'
        else 1
    )

    if variant_index >= len(starts):
        raise ValueError(
            'В HTML не найден женский вариант.'
        )

    start = starts[
        variant_index
    ]

    end = len(nodes)

    for index in range(
        start + 1,
        len(nodes),
    ):
        node = nodes[index]

        if _is_notes_heading(
            node
        ):
            end = index
            break

        if (
            index in starts
            and index > start
        ):
            end = index
            break

    selected = nodes[
        start:end
    ]

    items = []
    pending_title = ''

    index = 0

    while index < len(
        selected
    ):
        node = selected[index]

        class_name = (
            _class_name(node)
        )

        if node.name == 'h3':
            pending_title = (
                _tag_text(node)
            )

        elif node.name == 'p':
            if (
                class_name
                == 'translate'
            ):
                if (
                    items
                    and items[-1][
                        'type'
                    ] == 'text'
                    and not items[-1].get(
                        'translation'
                    )
                ):
                    items[-1][
                        'translation'
                    ] = (
                        _clean_translation(
                            node
                        )
                    )

            elif (
                class_name
                == 'center'
            ):
                content = (
                    _tag_text(node)
                )

                if (
                    index + 1
                    < len(selected)
                ):
                    next_node = (
                        selected[
                            index + 1
                        ]
                    )

                    next_class = (
                        _class_name(
                            next_node
                        )
                    )

                    next_text = (
                        _tag_text(
                            next_node
                        )
                    )

                    if (
                        next_node.name
                        == 'p'
                        and not next_class
                        and next_text.startswith(
                            '('
                        )
                    ):
                        content = (
                            content
                            + '\n'
                            + next_text
                        )

                        index += 1

                if content:
                    items.append({
                        'type':
                            'instruction',

                        'content':
                            content,
                    })

                pending_title = ''

            else:
                if (
                    class_name
                    == 'paint'
                ):
                    (
                        content,
                        note,
                    ) = _extract_paint(
                        node
                    )

                else:
                    content = (
                        _tag_text(node)
                    )

                    note = ''

                if content:
                    items.append({
                        'type':
                            'text',

                        'title':
                            pending_title,

                        'content':
                            content,

                        'translation':
                            '',

                        'note':
                            note,
                    })

                    pending_title = ''

        index += 1

    for order, item in enumerate(
        items,
        start=1,
    ):
        item['order'] = order

    return {
        'name': title,
        'slug': DEFAULT_SLUG,
        'variant': variant,
        'items': items,
    }
