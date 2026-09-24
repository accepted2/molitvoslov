import re
import unicodedata

from bs4 import BeautifulSoup, Tag


LITURGICAL_ACCENT_MARKS = {
    "\u0300",
    "\u0301",
    "\u0340",
    "\u0341",
    "\u0483",
    "\u0484",
    "\u0485",
    "\u0486",
    "\u0487",
}

TYPE_IRMOS = "irmos"
TYPE_REFRAIN = "refrain"
TYPE_TROPARION = "troparion"
TYPE_THEOTOKION = "theotokion"
TYPE_GLORY = "glory"
TYPE_NOW = "now"
TYPE_SEDALEN = "sedalen"
TYPE_KONTAKION = "kontakion"
TYPE_IKOS = "ikos"
TYPE_SVETILEN = "svetilen"
TYPE_PRAYER = "prayer"
TYPE_OTHER = "other"

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


class CanonParseError(ValueError):
    pass


def clean_text(value):
    if value is None:
        return ""

    value = (
        str(value)
        .replace("\xa0", " ")
        .replace("\u200b", "")
        .replace("\u00ad", "")
    )

    return re.sub(
        r"\s+",
        " ",
        value,
    ).strip()


def strip_liturgical_accents(value):
    decomposed = unicodedata.normalize(
        "NFD",
        value or "",
        )

    stripped = "".join(
        char
        for char in decomposed
        if char not in LITURGICAL_ACCENT_MARKS
    )

    return unicodedata.normalize(
        "NFC",
        stripped,
    )


def normalize(value):
    value = (
        strip_liturgical_accents(
            clean_text(value)
        )
        .lower()
        .replace(
            "ё",
            "е",
        )
    )

    # В исходниках Азбуки изредка встречается латинская a
    # внутри русского заголовка: "Тропaрь".
    value = value.replace(
        "a",
        "а",
    )

    return re.sub(
        r"\s+",
        " ",
        value,
    ).strip()


def signature(value):
    return re.sub(
        r"[^а-я0-9]+",
        " ",
        normalize(value),
        flags=re.IGNORECASE,
    ).strip()


def liturgical_accent_ratio(value):
    decomposed = unicodedata.normalize(
        "NFD",
        value or "",
        )

    accents = sum(
        1
        for char in decomposed
        if char in LITURGICAL_ACCENT_MARKS
    )

    letters = sum(
        1
        for char in (
                value
                or ""
        )
        if char.isalpha()
    )

    return accents / max(
        letters,
        1,
    )


class CanonHtmlParser:
    """
    Парсер Book.html канонов Азбуки веры.

    На данный момент проверен на двух реальных структурах:
    1. Канон покаянный ко Господу нашему Иисусу Христу.
    2. Канон молебный ко Пресвятой Богородице,
       поемый во всякой скорби душевной и обстоянии.

    Главный принцип:
    если структура неизвестна или ломает обязательную схему канона,
    импорт должен упасть с ошибкой, а не угадывать.
    """

    def __init__(
            self,
            html,
    ):
        self.soup = BeautifulSoup(
            html,
            "html.parser",
        )

        self.title = (
            self._extract_title()
        )

        self.tone = ""

        self.sections = []

        self.order = 0

        self.current_ode = None

        self.seen_odes = []

        self.canonical_refrain = ""

        self.canonical_refrain_signature = ""

    def parse(
            self,
    ):
        tags = (
            self._direct_content_tags()
        )

        index = 0

        while index < len(
                tags
        ):
            element = tags[
                index
            ]

            text = (
                self._element_text(
                    element
                )
            )

            if element.name == "h1":
                index += 1
                continue

            if element.name == "h2":
                normalized = normalize(
                    text
                )

                # Если внутри страницы есть отдельный h2 "Канон... Глас N",
                # именно этот глас относится к канону.
                # Сам h2 тоже сохраняем как отображаемый заголовок
                # непосредственно перед Песнью 1.
                if normalized.startswith(
                        "канон"
                ):
                    heading_text = (
                        self._heading_text_without_footnotes(
                            element
                        )
                    )

                    tone = (
                        self._extract_tone(
                            heading_text
                        )
                    )

                    if tone:
                        self.tone = (
                            tone
                        )

                    if heading_text:
                        self._add_heading_section(
                            heading_text
                        )

                index += 1
                continue

            if element.name in {
                "h3",
                "h4",
            }:
                ode_number = (
                    self._ode_number(
                        text
                    )
                )

                if ode_number is not None:
                    if (
                            ode_number
                            in self.seen_odes
                    ):
                        raise CanonParseError(
                            "Повтор заголовка "
                            f"Песнь {ode_number} "
                            "в основном варианте."
                        )

                    self.current_ode = (
                        ode_number
                    )

                    self.seen_odes.append(
                        ode_number
                    )

                    index += 1
                    continue

                index = (
                    self._parse_heading_block(
                        tags,
                        index,
                    )
                )

                continue

            if element.name != "p":
                index += 1
                continue

            tone = self._extract_tone(
                text
            )

            if (
                    tone
                    and
                    self.current_ode is None
                    and
                    not self.tone
            ):
                self.tone = (
                    tone
                )

                index += 1
                continue

            if self.current_ode is None:
                index = (
                    self._parse_unheaded_paragraph(
                        tags,
                        index,
                        ode_number=None,
                    )
                )

                continue

            index = (
                self._parse_song_paragraph(
                    tags,
                    index,
                )
            )

        self._validate()

        return {
            "title":
                self.title,

            "tone":
                self.tone,

            "sections":
                self.sections,

            "seen_odes":
                self.seen_odes,
        }

    # =========================================================
    # ОСНОВНАЯ ПОСЛЕДОВАТЕЛЬНОСТЬ HTML
    # =========================================================

    def _extract_title(
            self,
    ):
        h1 = self.soup.find(
            "h1"
        )

        if h1:
            value = clean_text(
                h1.get_text(
                    " ",
                    strip=True,
                )
            )

            if value:
                return value

        title = self.soup.find(
            "title"
        )

        if title:
            return clean_text(
                title.get_text(
                    " ",
                    strip=True,
                )
            )

        return ""

    def _direct_content_tags(
            self,
    ):
        body = (
                self.soup.body
                or self.soup
        )

        result = []

        for element in body.children:
            if not isinstance(
                    element,
                    Tag,
            ):
                continue

            if element.name not in {
                "h1",
                "h2",
                "h3",
                "h4",
                "p",
                "hr",
            }:
                continue

            # В некоторых Book.html <hr> отделяет
            # основной вариант от следующего.
            if element.name == "hr":
                break

            result.append(
                element
            )

        song_one_indexes = [
            index
            for index, element
            in enumerate(result)
            if (
                    element.name == "h3"
                    and
                    self._ode_number(
                        self._element_text(
                            element
                        )
                    ) == 1
            )
        ]

        # Если Песнь 1 встречается второй раз,
        # значит в одном Book.html лежит ещё один
        # грамматический вариант канона.
        if len(song_one_indexes) > 1:
            second_song_one = (
                song_one_indexes[1]
            )

            # Ищем молитву после Песни 9.
            # Всё, что начинается следующим заголовком
            # после этой молитвы и ведёт ко второй Песни 1,
            # уже относится ко второму варианту.
            prayer_index = None
            song_nine_seen = False

            for index, element in enumerate(
                    result[
                        :second_song_one
                    ]
            ):
                if element.name == "h3":
                    text = self._element_text(
                        element
                    )

                    ode_number = (
                        self._ode_number(
                            text
                        )
                    )

                    if ode_number == 9:
                        song_nine_seen = True
                        continue

                    if (
                            song_nine_seen
                            and
                            normalize(
                                text
                            ).startswith(
                                "молитва"
                            )
                    ):
                        prayer_index = (
                            index
                        )

            if prayer_index is not None:
                for index in range(
                        prayer_index + 1,
                        second_song_one + 1,
                ):
                    element = result[
                        index
                    ]

                    if element.name in {
                        "h2",
                        "h3",
                        "h4",
                    }:
                        return result[
                            :index
                        ]

            return result[
                :second_song_one
            ]

        return result

    def _element_text(
            self,
            element,
    ):
        return clean_text(
            element.get_text(
                " ",
                strip=True,
            )
        )

    def _heading_text_without_footnotes(
            self,
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
            return self._element_text(
                element
            )

        for link in root.find_all(
                "a"
        ):
            href = (
                    link.get(
                        "href"
                    )
                    or ""
            )

            name = (
                    link.get(
                        "name"
                    )
                    or ""
            )

            if (
                    href.startswith(
                        "#_ftn"
                    )
                    or
                    name.startswith(
                        "_ftnref"
                    )
            ):
                link.decompose()

        value = clean_text(
            root.get_text(
                " ",
                strip=True,
            )
        )

        # BeautifulSoup может дать "Канон .";
        # возвращаем нормальную пунктуацию.
        value = re.sub(
            r"\s+([.,;:])",
            r"\1",
            value,
        )

        return value

    def _ode_number(
            self,
            value,
    ):
        match = re.fullmatch(
            r"песнь\s+([0-9]+)",
            normalize(value),
        )

        if not match:
            return None

        return int(
            match.group(
                1
            )
        )

    def _extract_tone(
            self,
            value,
    ):
        match = re.search(
            r"\bглас\s+([0-9]+)\b",
            normalize(value),
        )

        if not match:
            return ""

        return (
            f"Глас "
            f"{match.group(1)}"
        )

    # =========================================================
    # ЗАГОЛОВКИ МЕЖДУ ПЕСНЯМИ
    # =========================================================

    def _heading_kind(
            self,
            value,
    ):
        normalized = normalize(
            value
        )

        if normalized.startswith(
                "седален"
        ):
            return (
                TYPE_SEDALEN,
                "Седален",
            )

        if normalized.startswith(
                "богородичен"
        ):
            return (
                TYPE_THEOTOKION,
                "Богородичен",
            )

        if normalized.startswith(
                "тропарь"
        ):
            return (
                TYPE_TROPARION,
                clean_text(
                    value
                ),
            )

        if normalized.startswith(
                "другой кондак"
        ):
            return (
                TYPE_KONTAKION,
                clean_text(
                    value
                ),
            )

        if normalized.startswith(
                "кондак"
        ):
            return (
                TYPE_KONTAKION,
                clean_text(
                    value
                ),
            )

        if normalized.startswith(
                "икос"
        ):
            return (
                TYPE_IKOS,
                clean_text(
                    value
                ),
            )

        if (
                normalized.startswith(
                    "светилен"
                )
                or
                normalized.startswith(
                    "эксапостилар"
                )
        ):
            return (
                TYPE_SVETILEN,
                clean_text(
                    value
                ),
            )

        if normalized.startswith(
                "молитва"
        ):
            return (
                TYPE_PRAYER,
                clean_text(
                    value
                ),
            )

        if normalized.startswith(
                "псалом"
        ):
            return (
                TYPE_OTHER,
                clean_text(
                    value
                ),
            )

        if (
                normalized.startswith(
                    "стихиры"
                )
                or
                normalized.startswith(
                    "стихира"
                )
        ):
            return (
                TYPE_OTHER,
                clean_text(
                    value
                ),
            )

        # Пока не выдумываем семантику незнакомого заголовка.
        # Сохраняем его как OTHER и увидим его в check-only.
        return (
            TYPE_OTHER,
            clean_text(
                value
            ),
        )

    def _parse_heading_block(
            self,
            tags,
            heading_index,
    ):
        heading_element = (
            tags[
                heading_index
            ]
        )

        heading_text = (
            self._element_text(
                heading_element
            )
        )

        (
            section_type,
            heading,
        ) = self._heading_kind(
            heading_text
        )

        paragraph_tags = []

        index = (
                heading_index + 1
        )

        while (
                index < len(
            tags
        )
                and
                tags[
                    index
                ].name == "p"
        ):
            paragraph_tags.append(
                tags[
                    index
                ]
            )

            index += 1

        if not paragraph_tags:
            return index

        # Новый образец явно маркирует переводы class="translate".
        # Там возможны несколько ЦС-абзацев подряд, затем несколько
        # переводов подряд, поэтому сопоставляем их по индексу.
        if any(
                self._is_explicit_translation(
                    paragraph
                )
                for paragraph
                in paragraph_tags
        ):
            church_paragraphs = [
                paragraph
                for paragraph
                in paragraph_tags
                if not
                self._is_explicit_translation(
                    paragraph
                )
            ]

            translations = [
                paragraph
                for paragraph
                in paragraph_tags
                if self._is_explicit_translation(
                    paragraph
                )
            ]

            for position, source in enumerate(
                    church_paragraphs
            ):
                source_text = (
                    self._element_text(
                        source
                    )
                )

                translation = ""

                if position < len(
                        translations
                ):
                    translation = (
                        self._strip_translation_label(
                            self._element_text(
                                translations[
                                    position
                                ]
                            )
                        )
                    )

                resolved_type = (
                    section_type
                )

                resolved_heading = (
                    heading
                    if position == 0
                    else ""
                )

                (
                    cue_type,
                    _cue_prefix,
                    cue_remainder,
                ) = (
                    self._split_liturgical_prefix(
                        source_text
                    )
                )

                # Например отдельное:
                # "Слава Отцу..., и ныне..., аминь."
                # между тропарём и Богородичном.
                if (
                        cue_type
                        and
                        not cue_remainder
                ):
                    resolved_type = (
                        cue_type
                    )

                    resolved_heading = ""

                self._add_section(
                    resolved_type,
                    source_text,
                    translation=translation,
                    heading=resolved_heading,
                    ode_number=None,
                )

            return index

        # В покаянном Book.html class="translate" нет.
        # Там ЦС-текст с ударениями идёт перед обычным русским переводом.
        position = 0

        emitted_main = False

        while position < len(
                paragraph_tags
        ):
            source = (
                paragraph_tags[
                    position
                ]
            )

            source_text = (
                self._element_text(
                    source
                )
            )

            translation = ""

            if (
                    position + 1
                    <
                    len(
                        paragraph_tags
                    )
                    and
                    self._looks_like_translation(
                        source_text,
                        paragraph_tags[
                            position + 1
                        ],
                    )
            ):
                translation = (
                    self._strip_translation_label(
                        self._element_text(
                            paragraph_tags[
                                position + 1
                                ]
                        )
                    )
                )

                position += 1

            resolved_type = (
                section_type
            )

            resolved_heading = (
                heading
                if not emitted_main
                else ""
            )

            (
                cue_type,
                _cue_prefix,
                cue_remainder,
            ) = (
                self._split_liturgical_prefix(
                    source_text
                )
            )

            if (
                    cue_type
                    and
                    not cue_remainder
            ):
                resolved_type = (
                    cue_type
                )

                resolved_heading = ""

            self._add_section(
                resolved_type,
                source_text,
                translation=translation,
                heading=resolved_heading,
                ode_number=None,
            )

            emitted_main = True

            position += 1

        return index

    # =========================================================
    # ОБЫЧНЫЙ ТЕКСТ
    # =========================================================

    def _parse_unheaded_paragraph(
            self,
            tags,
            index,
            ode_number,
    ):
        source = tags[
            index
        ]

        source_text = (
            self._element_text(
                source
            )
        )

        translation = ""

        if (
                index + 1
                < len(
            tags
        )
                and
                tags[
                    index + 1
                ].name == "p"
                and
                self._looks_like_translation(
                    source_text,
                    tags[
                        index + 1
                    ],
                )
        ):
            translation = (
                self._strip_translation_label(
                    self._element_text(
                        tags[
                            index + 1
                            ]
                    )
                )
            )

            index += 1

        (
            cue_type,
            _cue_prefix,
            _cue_remainder,
        ) = (
            self._split_liturgical_prefix(
                source_text
            )
        )

        self._add_section(
            cue_type
            or TYPE_OTHER,
            source_text,
            translation=translation,
            heading="",
            ode_number=ode_number,
            )

        return (
                index + 1
        )

    # =========================================================
    # ТЕКСТ ВНУТРИ ПЕСНИ
    # =========================================================

    def _parse_song_paragraph(
            self,
            tags,
            index,
    ):
        element = tags[
            index
        ]

        text = self._element_text(
            element
        )

        strong = element.find(
            "strong"
        )

        strong_text = (
            clean_text(
                strong.get_text(
                    " ",
                    strip=True,
                )
            )
            if strong
            else ""
        )

        normalized_strong = (
            normalize(
                strong_text
            )
        )

        # -------------------------
        # Ирмос
        # -------------------------

        if normalized_strong.startswith(
                "ирмос"
        ):
            church = (
                self._extract_irmos_text(
                    element
                )
            )

            translation = ""

            if (
                    index + 1
                    < len(
                tags
            )
                    and
                    tags[
                        index + 1
                    ].name == "p"
                    and
                    self._looks_like_translation(
                        church,
                        tags[
                            index + 1
                        ],
                    )
            ):
                translation = (
                    self._strip_translation_label(
                        self._element_text(
                            tags[
                                index + 1
                                ]
                        )
                    )
                )

                index += 1

            self._add_section(
                TYPE_IRMOS,
                church,
                translation=translation,
                heading="Ирмос",
                ode_number=(
                    self.current_ode
                ),
            )

            return (
                    index + 1
            )

        # -------------------------
        # Особый припев "Иисусу:"
        # -------------------------

        if normalized_strong.startswith(
                "иисусу"
        ):
            refrain = (
                self._remove_strong_prefix(
                    element
                )
            )

            if not refrain:
                raise CanonParseError(
                    "Песнь "
                    f"{self.current_ode}: "
                    "найден пустой припев Иисусу."
                )

            translation = ""

            if (
                    index + 1
                    < len(
                tags
            )
                    and
                    tags[
                        index + 1
                    ].name == "p"
                    and
                    self._is_explicit_translation(
                        tags[
                            index + 1
                        ]
                    )
            ):
                translation = (
                    self._strip_translation_label(
                        self._element_text(
                            tags[
                                index + 1
                                ]
                        )
                    )
                )

                index += 1

            self._add_section(
                TYPE_REFRAIN,
                refrain,
                translation=translation,
                heading="Иисусу",
                ode_number=(
                    self.current_ode
                ),
            )

            return (
                    index + 1
            )

        # -------------------------
        # Первый явный припев
        # -------------------------

        if normalized_strong.startswith(
                "припев"
        ):
            refrain = (
                self._remove_strong_prefix(
                    element
                )
            )

            if not refrain:
                raise CanonParseError(
                    "Песнь "
                    f"{self.current_ode}: "
                    "найден пустой Припев."
                )

            self.canonical_refrain = (
                refrain
            )

            self.canonical_refrain_signature = (
                signature(
                    refrain
                )
            )

            translation = ""

            if (
                    index + 1
                    < len(
                tags
            )
                    and
                    tags[
                        index + 1
                    ].name == "p"
                    and
                    self._is_explicit_translation(
                        tags[
                            index + 1
                        ]
                    )
            ):
                translation = (
                    self._strip_translation_label(
                        self._element_text(
                            tags[
                                index + 1
                                ]
                        )
                    )
                )

                index += 1

            self._add_section(
                TYPE_REFRAIN,
                refrain,
                translation=translation,
                heading="Припев",
                ode_number=(
                    self.current_ode
                ),
            )

            return (
                    index + 1
            )

        # -------------------------
        # Повтор припева без подписи
        # -------------------------

        current_signature = (
            signature(
                text
            )
        )

        if (
                self.canonical_refrain_signature
                and
                current_signature
                ==
                self.canonical_refrain_signature
        ):
            self._add_section(
                TYPE_REFRAIN,
                self.canonical_refrain,
                heading="Припев",
                ode_number=(
                    self.current_ode
                ),
            )

            return (
                    index + 1
            )

        # -------------------------
        # Слава / И ныне
        # -------------------------

        (
            cue_type,
            _cue_prefix,
            cue_remainder,
        ) = (
            self._split_liturgical_prefix(
                text
            )
        )

        if cue_type:
            # "Слава Отцу... <текст тропаря>"
            if cue_remainder:
                translation = ""

                if (
                        index + 1
                        < len(
                    tags
                )
                        and
                        tags[
                            index + 1
                        ].name == "p"
                        and
                        self._looks_like_translation(
                            text,
                            tags[
                                index + 1
                            ],
                        )
                ):
                    translation = (
                        self._strip_translation_label(
                            self._element_text(
                                tags[
                                    index + 1
                                    ]
                            )
                        )
                    )

                    index += 1

                self._add_section(
                    cue_type,
                    text,
                    translation=translation,
                    heading="",
                    ode_number=(
                        self.current_ode
                    ),
                )

                return (
                        index + 1
                )

            # Отдельная строка "Слава..." может иметь
            # отдельный русский перевод.
            if (
                    index + 1
                    < len(
                tags
            )
                    and
                    tags[
                        index + 1
                    ].name == "p"
                    and
                    self._looks_like_translation(
                        text,
                        tags[
                            index + 1
                        ],
                    )
            ):
                translation = (
                    self._strip_translation_label(
                        self._element_text(
                            tags[
                                index + 1
                                ]
                        )
                    )
                )

                index += 1

                self._add_section(
                    cue_type,
                    text,
                    translation=translation,
                    heading="",
                    ode_number=(
                        self.current_ode
                    ),
                )

                return (
                        index + 1
                )

            # Во втором образце в Песни 5:
            # <p>Слава Отцу...</p>
            # <p>сам тропарь...</p>
            # <p class="translate">перевод тропаря...</p>
            if (
                    index + 1
                    < len(
                tags
            )
                    and
                    tags[
                        index + 1
                    ].name == "p"
            ):
                body_text = (
                    self._element_text(
                        tags[
                            index + 1
                            ]
                    )
                )

                is_refrain = (
                        self.canonical_refrain_signature
                        and
                        signature(
                            body_text
                        )
                        ==
                        self.canonical_refrain_signature
                )

                if not is_refrain:
                    combined = (
                        f"{text} "
                        f"{body_text}"
                    ).strip()

                    index += 1

                    translation = ""

                    if (
                            index + 1
                            < len(
                        tags
                    )
                            and
                            tags[
                                index + 1
                            ].name == "p"
                            and
                            self._looks_like_translation(
                                body_text,
                                tags[
                                    index + 1
                                ],
                            )
                    ):
                        translation = (
                            self._strip_translation_label(
                                self._element_text(
                                    tags[
                                        index + 1
                                        ]
                                )
                            )
                        )

                        index += 1

                    self._add_section(
                        cue_type,
                        combined,
                        translation=translation,
                        heading="",
                        ode_number=(
                            self.current_ode
                        ),
                    )

                    return (
                            index + 1
                    )

            self._add_section(
                cue_type,
                text,
                heading="",
                ode_number=(
                    self.current_ode
                ),
            )

            return (
                    index + 1
            )

        # -------------------------
        # Обычный тропарь
        # -------------------------

        translation = ""

        if (
                index + 1
                < len(
            tags
        )
                and
                tags[
                    index + 1
                ].name == "p"
                and
                self._looks_like_translation(
                    text,
                    tags[
                        index + 1
                    ],
                )
        ):
            translation = (
                self._strip_translation_label(
                    self._element_text(
                        tags[
                            index + 1
                            ]
                    )
                )
            )

            index += 1

        self._add_section(
            TYPE_TROPARION,
            text,
            translation=translation,
            heading="",
            ode_number=(
                self.current_ode
            ),
        )

        return (
                index + 1
        )

    # =========================================================
    # ТЕКСТ / ПЕРЕВОД
    # =========================================================

    def _extract_irmos_text(
            self,
            paragraph,
    ):
        em_nodes = paragraph.find_all(
            "em"
        )

        if em_nodes:
            # Бывает:
            # <em>Н</em><em>ебеснаго...</em>
            # Между ними нельзя вставлять пробел.
            return clean_text(
                "".join(
                    node.get_text(
                        "",
                        strip=True,
                    )
                    for node
                    in em_nodes
                )
            )

        return (
            self._remove_strong_prefix(
                paragraph
            )
        )

    def _remove_strong_prefix(
            self,
            paragraph,
    ):
        full = self._element_text(
            paragraph
        )

        strong = paragraph.find(
            "strong"
        )

        if not strong:
            return full

        prefix = clean_text(
            strong.get_text(
                " ",
                strip=True,
            )
        )

        if full.startswith(
                prefix
        ):
            return full[
                len(
                    prefix
                ):
            ].lstrip(
                " :;,.—–-"
            )

        return re.sub(
            rf"^\s*"
            rf"{re.escape(prefix)}"
            rf"\s*[:;,.—–-]?\s*",
            "",
            full,
            count=1,
        ).strip()

    def _is_explicit_translation(
            self,
            paragraph,
    ):
        classes = set(
            paragraph.get(
                "class"
            )
            or []
        )

        if "translate" in classes:
            return True

        return normalize(
            self._element_text(
                paragraph
            )
        ).startswith(
            "перевод:"
        )

    def _looks_like_translation(
            self,
            source_text,
            candidate,
    ):
        if self._is_explicit_translation(
                candidate
        ):
            return True

        candidate_text = (
            self._element_text(
                candidate
            )
        )

        # Для старого HTML без class="translate":
        # ЦС почти всегда имеет реальные знаки ударения,
        # русский перевод — нет.
        return (
                liturgical_accent_ratio(
                    source_text
                ) >= 0.03
                and
                liturgical_accent_ratio(
                    candidate_text
                ) < 0.005
        )

    def _strip_translation_label(
            self,
            value,
    ):
        return re.sub(
            r"^\s*перевод\s*:\s*",
            "",
            value
            or "",
            count=1,
            flags=re.IGNORECASE,
            ).strip()

    # =========================================================
    # СЛАВА / И НЫНЕ
    # =========================================================

    def _split_liturgical_prefix(
            self,
            value,
    ):
        # Полное "Слава... и ныне..." сначала проверяем целиком,
        # чтобы не принять вторую половину за текст тропаря.
        combined_signature = (
            signature(
                value
            )
        )

        if combined_signature == (
                "слава отцу и сыну и святому духу "
                "и ныне и присно и во веки веков аминь"
        ):
            return (
                TYPE_GLORY,
                value.strip(),
                "",
            )

        normalized_chars = []

        original_indices = []

        for index, char in enumerate(
                value
                or ""
        ):
            decomposed = (
                unicodedata.normalize(
                    "NFD",
                    char,
                )
            )

            for normalized_char in decomposed:
                if (
                        normalized_char
                        in
                        LITURGICAL_ACCENT_MARKS
                ):
                    continue

                normalized_chars.append(
                    normalized_char.lower()
                )

                original_indices.append(
                    index
                )

        normalized = (
            "".join(
                normalized_chars
            )
            .replace(
                "ё",
                "е",
            )
        )

        patterns = (
            (
                TYPE_GLORY,
                re.compile(
                    r"^\s*слава\s+отцу\s*,?\s*"
                    r"и\s+сыну\s*,?\s*"
                    r"и\s+святому\s+духу"
                    r"\s*[.,;:]?",
                    re.IGNORECASE,
                ),
            ),
            (
                TYPE_NOW,
                re.compile(
                    r"^\s*и\s+ныне\s*,?\s*"
                    r"и\s+присно\s*,?\s*"
                    r"и\s+во\s+веки\s+веков"
                    r"\s*,?\s*аминь"
                    r"\s*[.,;:]?",
                    re.IGNORECASE,
                ),
            ),
        )

        for (
                section_type,
                pattern,
        ) in patterns:
            match = pattern.match(
                normalized
            )

            if not match:
                continue

            end_normalized = (
                    match.end() - 1
            )

            if (
                    end_normalized
                    >=
                    len(
                        original_indices
                    )
            ):
                end = len(
                    value
                )
            else:
                end = (
                        original_indices[
                            end_normalized
                        ]
                        + 1
                )

            prefix = (
                value[
                    :end
                ].strip()
            )

            remainder = (
                value[
                    end:
                ].strip()
            )

            return (
                section_type,
                prefix,
                remainder,
            )

        return (
            None,
            "",
            value,
        )

    # =========================================================
    # РЕЗУЛЬТАТ
    # =========================================================

    def _add_heading_section(
            self,
            heading,
    ):
        heading = clean_text(
            heading
        )

        if not heading:
            return

        self.order += 1

        self.sections.append(
            {
                "variant":
                    1,

                "order":
                    self.order,

                "section_type":
                    TYPE_OTHER,

                "ode_number":
                    None,

                "heading":
                    heading,

                "content":
                    "",

                "translation":
                    "",
            }
        )

    def _add_section(
            self,
            section_type,
            content,
            translation="",
            heading="",
            ode_number=None,
    ):
        content = clean_text(
            content
        )

        translation = clean_text(
            translation
        )

        heading = clean_text(
            heading
        )

        if not content:
            raise CanonParseError(
                "Пустой элемент "
                f"{section_type}, "
                f"heading={heading!r}"
            )

        self.order += 1

        self.sections.append(
            {
                "variant":
                    1,

                "order":
                    self.order,

                "section_type":
                    section_type,

                "ode_number":
                    ode_number,

                "heading":
                    heading,

                "content":
                    content,

                "translation":
                    translation,
            }
        )

    def _validate(
            self,
    ):
        if self.seen_odes != EXPECTED_ODES:
            raise CanonParseError(
                "Неверная последовательность "
                f"песен: {self.seen_odes}; "
                f"ожидалось {EXPECTED_ODES}."
            )

        for ode_number in EXPECTED_ODES:
            items = [
                item
                for item
                in self.sections
                if item[
                       "ode_number"
                   ] == ode_number
            ]

            irmos_count = sum(
                item[
                    "section_type"
                ] == TYPE_IRMOS
                for item
                in items
            )

            refrain_count = sum(
                item[
                    "section_type"
                ] == TYPE_REFRAIN
                for item
                in items
            )

            if irmos_count != 1:
                raise CanonParseError(
                    f"Песнь {ode_number}: "
                    f"Ирмосов {irmos_count}, "
                    "ожидался 1."
                )

            if refrain_count < 1:
                raise CanonParseError(
                    f"Песнь {ode_number}: "
                    "не найден ни один припев."
                )

        for item in self.sections:
            normalized = normalize(
                item[
                    "content"
                ]
            )

            if re.match(
                    r"^ирмос\s*:\s*ирмос\b",
                    normalized,
            ):
                raise CanonParseError(
                    "Дублирован Ирмос: "
                    + item[
                        "content"
                    ][
                        :120
                    ]
                )

            if re.match(
                    r"^припев\s*:\s*припев\b",
                    normalized,
            ):
                raise CanonParseError(
                    "Дублирован Припев: "
                    + item[
                        "content"
                    ][
                        :120
                    ]
                )

            if re.fullmatch(
                    r"песнь\s+[0-9]+",
                    normalized,
            ):
                raise CanonParseError(
                    "Заголовок песни "
                    "попал в content: "
                    + item[
                        "content"
                    ]
                )


def parse_canon_html(
        html,
):
    return CanonHtmlParser(
        html
    ).parse()
