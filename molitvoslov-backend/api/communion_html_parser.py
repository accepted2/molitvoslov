import html as html_lib
import re
from dataclasses import dataclass

from bs4 import BeautifulSoup, Tag


class CommunionParseError(Exception):
    pass


ACCENT_MARKS_RE = re.compile(
    r"[\u0300-\u036f\u0483-\u0489]"
)


def clean_text(value):
    value = html_lib.unescape(
        value or ""
    )

    value = value.replace(
        "\xa0",
        " ",
    )

    value = value.replace(
        "\r\n",
        "\n",
    )

    value = value.replace(
        "\r",
        "\n",
    )

    lines = []

    for line in value.split(
            "\n"
    ):
        line = re.sub(
            r"[ \t]+",
            " ",
            line,
        ).strip()

        if line:
            lines.append(
                line
            )

    return "\n".join(
        lines
    ).strip()


def normalize(value):
    value = clean_text(
        value
    )

    import unicodedata

    value = unicodedata.normalize(
        "NFD",
        value,
    )

    value = ACCENT_MARKS_RE.sub(
        "",
        value,
    )

    value = unicodedata.normalize(
        "NFC",
        value,
    )

    value = value.lower()

    value = value.replace(
        "ё",
        "е",
    )

    value = value.replace(
        "і",
        "и",
    )

    value = value.replace(
        "ѣ",
        "е",
    )

    value = re.sub(
        r"[^а-я0-9]+",
        " ",
        value,
    )

    return value.strip()


def _unwrap_markdown_table_source(
        raw,
):
    """
    Поддерживает два варианта входа:

    1. Обычный сохранённый HTML страницы.
    2. HTML, вставленный в ChatGPT/Markdown-таблицу:
      | <h2>...</h2> |
    """

    if (
            "\\<" not in raw
            and
            not re.search(
                r"^\s*\|\s*\\?<",
                raw,
                re.MULTILINE,
            )
    ):
        return raw

    result = []

    for raw_line in raw.splitlines():
        line = raw_line.strip()

        if (
                not line
                or
                re.fullmatch(
                    r"\|?\s*-{3,}.*",
                    line,
                )
        ):
            continue

        if line.startswith(
                "|"
        ):
            line = line[1:]

        if line.endswith(
                "|"
        ):
            line = line[:-1]

        line = line.strip()

        line = (
            line
            .replace(
                r"\<",
                "<",
            )
            .replace(
                r"\>",
                ">",
            )
        )

        result.append(
            line
        )

    return "\n".join(
        result
    )


def _text_with_breaks(
        element,
):
    clone = BeautifulSoup(
        str(element),
        "html.parser",
    )

    root = clone.find(
        element.name
    )

    if not root:
        return ""

    for br in root.find_all(
            "br"
    ):
        br.replace_with(
            "\n"
        )

    return clean_text(
        root.get_text(
            "",
            strip=False,
        )
    )


def _is_translation(
        element,
):
    return (
            element.name == "p"
            and
            "translate"
            in (
                    element.get(
                        "class"
                    )
                    or []
            )
    )


def _is_leaf_paragraph(
        element,
):
    if element.name != "p":
        return False

    return (
            element.find(
                [
                    "p",
                    "h2",
                    "h3",
                ]
            )
            is None
    )


def _iter_content_blocks(
        section,
):
    """
    Страница содержит неидеальную HTML-разметку:
    после одного из <p> вложены следующие <p>/<h2>.
    Поэтому не полагаемся только на direct children.

    При этом внешний <p>-контейнер не отдаём,
    а его вложенные реальные блоки — отдаём.
    """

    for element in section.find_all(
            [
                "h2",
                "h3",
                "p",
            ]
    ):
        if (
                element.name == "p"
                and
                not _is_leaf_paragraph(
                    element
                )
        ):
            continue

        yield element


SECTION_PARAGRAPHS = {
    "тропари покаянные",
}


INSTRUCTION_PARAGRAPHS = {
    "и стихи",
    "затем",
    "потом тропари",
    "также молитву",
    "и еще",
}


STANDALONE_FORMULA_PREFIXES = (
    "слава отцу и сыну и святому духу",
    "и ныне и присно и во веки веков",
    "господи помилуй",
    "святый боже святый крепкий",
    "пресвятая троице помилуй нас",
)


EXPECTED_ODES = [
    1,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
]


@dataclass
class ParsedItem:
    item_type: str
    title: str = ""
    content: str = ""
    translation: str = ""
    note: str = ""

    def as_dict(
            self,
    ):
        return {
            "item_type":
                self.item_type,

            "title":
                self.title,

            "content":
                self.content,

            "translation":
                self.translation,

            "note":
                self.note,
        }


class CommunionHtmlParser:
    def __init__(
            self,
            raw_html,
    ):
        html = (
            _unwrap_markdown_table_source(
                raw_html
            )
        )

        self.soup = BeautifulSoup(
            html,
            "html.parser",
        )

        self.title = ""
        self.items = []

        self.pending_source = []

    def parse(
            self,
    ):
        self._extract_title()

        main = (
            self.soup.select_one(
                ".main-page-content"
            )
        )

        if not main:
            raise CommunionParseError(
                "Не найден контейнер "
                ".main-page-content."
            )

        male = main.select_one(
            "section.type-male"
        )

        if not male:
            raise CommunionParseError(
                "Не найден мужской вариант "
                "section.type-male."
            )

        blocks = list(
            _iter_content_blocks(
                male
            )
        )

        started = False

        for element in blocks:
            text = _text_with_breaks(
                element
            )

            normalized = normalize(
                text
            )

            if not text:
                continue

            if not started:
                if (
                        element.name
                        in {
                    "h2",
                    "h3",
                }
                        and
                        normalized.startswith(
                            "начало обычное"
                        )
                ):
                    started = True
                else:
                    continue

            if normalized.startswith(
                    "примечания"
            ):
                self._flush_pending()
                break

            if element.name in {
                "h2",
                "h3",
            }:
                self._flush_pending()

                self.items.append(
                    ParsedItem(
                        item_type=
                        "section",

                        title=text,
                    )
                )

                continue

            if _is_translation(
                    element
            ):
                self._consume_translation(
                    text
                )
                continue

            if normalized in (
                    SECTION_PARAGRAPHS
            ):
                self._flush_pending()

                self.items.append(
                    ParsedItem(
                        item_type=
                        "section",

                        title=text,
                    )
                )

                continue

            if normalized in (
                    INSTRUCTION_PARAGRAPHS
            ):
                self._flush_pending()

                self.items.append(
                    ParsedItem(
                        item_type=
                        "instruction",

                        content=text,
                    )
                )

                continue

            # Короткие литургические формулы на странице
            # иногда идут без отдельного русского перевода.
            # Не даём им случайно приклеиться к следующей
            # большой молитве, перевод которой идёт ниже.
            if (
                    self.pending_source
                    and
                    self._is_standalone_formula(
                        self.pending_source[-1]
                    )
            ):
                self._flush_pending()

            self.pending_source.append(
                text
            )

        self._flush_pending()

        if not started:
            raise CommunionParseError(
                "Не найдено начало текста: "
                "'Начало обычное'."
            )

        self._validate()

        return {
            "title":
                self.title,

            "variant":
                "male",

            "items": [
                item.as_dict()
                for item
                in self.items
            ],
        }

    def _extract_title(
            self,
    ):
        article = self.soup.select_one(
            "article"
        )

        heading = (
            article.find(
                "h1"
            )
            if article
            else self.soup.find(
                "h1"
            )
        )

        if not heading:
            raise CommunionParseError(
                "Не найден <h1> "
                "с названием Последования."
            )

        self.title = (
            _text_with_breaks(
                heading
            )
        )

        if (
                "последование"
                not in normalize(
            self.title
        )
                or
                "причащ"
                not in normalize(
            self.title
        )
        ):
            raise CommunionParseError(
                "Найден неожиданный заголовок: "
                f"{self.title}"
            )

    def _consume_translation(
            self,
            translation,
    ):
        if not self.pending_source:
            raise CommunionParseError(
                "Найден русский перевод без "
                "предшествующего церковнославянского "
                "текста: "
                f"{translation[:120]}"
            )

        translation = re.sub(
            r"^\s*Перевод\s*:\s*",
            "",
            translation,
            flags=re.IGNORECASE,
        ).strip()

        # На странице большие молитвы разбиты на
        # несколько церковнославянских <p>, а их
        # русский перевод дан одним <p class="translate">.
        #
        # Поэтому если накоплено несколько абзацев,
        # перевод относится ко всему накопленному
        # молитвенному блоку.
        content = "\n\n".join(
            self.pending_source
        )

        self.items.append(
            ParsedItem(
                item_type=
                "text",

                content=
                content,

                translation=
                translation,
            )
        )

        self.pending_source = []

    def _flush_pending(
            self,
    ):
        if not self.pending_source:
            return

        content = "\n\n".join(
            self.pending_source
        )

        self.items.append(
            ParsedItem(
                item_type=
                "text",

                content=
                content,
            )
        )

        self.pending_source = []

    def _is_standalone_formula(
            self,
            value,
    ):
        normalized = normalize(
            value
        )

        return any(
            normalized.startswith(
                prefix
            )
            for prefix
            in STANDALONE_FORMULA_PREFIXES
        )

    def _validate(
            self,
    ):
        if not self.items:
            raise CommunionParseError(
                "Парсер не получил ни одного элемента."
            )

        section_titles = [
            item.title
            for item
            in self.items
            if item.item_type
               == "section"
        ]

        normalized_sections = [
            normalize(
                title
            )
            for title
            in section_titles
        ]

        required_sections = [
            "начало обычное",
            "псалом 22",
            "псалом 23",
            "псалом 115",
            "псалом 50",
        ]

        for required in required_sections:
            if not any(
                    title.startswith(
                        required
                    )
                    for title
                    in normalized_sections
            ):
                raise CommunionParseError(
                    "Не найден обязательный "
                    f"раздел: {required}"
                )

        ode_numbers = []

        for title in normalized_sections:
            match = re.fullmatch(
                r"песнь\s+(\d+)",
                title,
            )

            if match:
                ode_numbers.append(
                    int(
                        match.group(
                            1
                        )
                    )
                )

        if ode_numbers != EXPECTED_ODES:
            raise CommunionParseError(
                "Неожиданный набор песней канона: "
                f"{ode_numbers}; "
                f"ожидалось {EXPECTED_ODES}."
            )

        prayer_headings = [
            title
            for title
            in normalized_sections
            if (
                    title.startswith(
                        "молитва "
                    )
                    or
                    title.startswith(
                        "его же"
                    )
            )
        ]

        if len(
                prayer_headings
        ) < 10:
            raise CommunionParseError(
                "После канона найдено слишком мало "
                "молитвенных разделов: "
                f"{len(prayer_headings)}."
            )

        text_items = [
            item
            for item
            in self.items
            if item.item_type
               == "text"
        ]

        translated = [
            item
            for item
            in text_items
            if item.translation
        ]

        if len(
                translated
        ) < 40:
            raise CommunionParseError(
                "Слишком мало церковнославянско-русских "
                "пар: "
                f"{len(translated)}."
            )

        if any(
                normalize(
                    item.content
                ).startswith(
                    "примечания"
                )
                for item
                in text_items
        ):
            raise CommunionParseError(
                "В основной текст попали примечания "
                "со страницы."
            )


def parse_communion_html(
        raw_html,
):
    return CommunionHtmlParser(
        raw_html
    ).parse()
