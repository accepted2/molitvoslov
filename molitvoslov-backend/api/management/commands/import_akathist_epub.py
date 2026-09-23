import re
import unicodedata
import zipfile
from pathlib import Path

from bs4 import BeautifulSoup, Tag
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from api.models import Akathist, AkathistSection, Text


HEADING_TAGS = {"h1", "h2", "h3", "h4", "h5", "h6"}

# В EPUB Азбуки уже встретились оба варианта:
#
# Иисус Сладчайший:
#   <p class="paint">...</p>
#
# Николай Чудотворец:
#   <p class="gprayer">...</p>
#
CHURCH_CLASSES = {"paint", "gprayer"}
TRANSLATION_CLASSES = {"translate"}


class Command(BaseCommand):
    help = (
        "Импортирует акафист из EPUB Азбуки веры. "
        "Церковнославянский текст и русский перевод "
        "извлекаются из Book.html."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--epub",
            required=True,
            help="Путь к EPUB-файлу.",
        )

        parser.add_argument(
            "--slug",
            required=True,
            help="Slug акафиста в базе.",
        )

        parser.add_argument(
            "--title",
            required=False,
            default="",
            help=(
                "Название акафиста. Если не указано, "
                "попытаемся взять его из EPUB."
            ),
        )

        parser.add_argument(
            "--check-only",
            action="store_true",
            help=(
                "Только разобрать и проверить EPUB. "
                "Ничего не записывать в БД."
            ),
        )

    def handle(self, *args, **options):
        epub_path = Path(options["epub"])
        slug = options["slug"].strip()
        title = options["title"].strip()
        check_only = options["check_only"]

        if not epub_path.exists():
            raise CommandError(
                f"EPUB-файл не найден: {epub_path}"
            )

        if epub_path.suffix.lower() != ".epub":
            self.stdout.write(
                self.style.WARNING(
                    "Предупреждение: файл не имеет расширения .epub."
                )
            )

        self.stdout.write("")
        self.stdout.write("=" * 72)
        self.stdout.write("ИМПОРТ АКАФИСТА ИЗ EPUB")
        self.stdout.write("=" * 72)
        self.stdout.write(f"Файл: {epub_path}")
        self.stdout.write(f"Slug: {slug}")

        html, html_name = self.read_book_html(epub_path)

        self.stdout.write(
            f"HTML внутри EPUB: {html_name}"
        )

        soup = BeautifulSoup(
            html,
            "html.parser",
        )

        epub_title = self.extract_title(soup)

        if not title:
            title = epub_title

        if not title:
            raise CommandError(
                "Не удалось определить название акафиста. "
                "Передай --title."
            )

        self.stdout.write(
            f"Название: {title}"
        )

        parsed = self.parse_akathist(soup)

        self.validate_parsed(parsed)
        self.print_report(parsed)

        if check_only:
            self.stdout.write("")
            self.stdout.write(
                self.style.SUCCESS(
                    "CHECK-ONLY: структура корректна. "
                    "База данных не изменялась."
                )
            )
            return

        self.save_akathist(
            slug=slug,
            title=title,
            parsed=parsed,
        )

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                "Импорт EPUB завершён успешно."
            )
        )

    # ============================================================
    # ЧТЕНИЕ EPUB
    # ============================================================

    def read_book_html(self, epub_path):
        try:
            archive = zipfile.ZipFile(
                epub_path,
                "r",
            )
        except zipfile.BadZipFile as exc:
            raise CommandError(
                "Файл не является корректным EPUB/ZIP."
            ) from exc

        with archive:
            names = archive.namelist()

            html_name = self.find_book_html(
                archive,
                names,
            )

            if not html_name:
                raise CommandError(
                    "Не удалось найти HTML-файл "
                    "с текстом акафиста внутри EPUB."
                )

            raw = archive.read(html_name)

        try:
            html = raw.decode("utf-8-sig")
        except UnicodeDecodeError:
            html = raw.decode(
                "utf-8",
                errors="replace",
            )

        return html, html_name

    def find_book_html(self, archive, names):
        # На Азбуке основной файл обычно называется Book.html.
        for name in names:
            if Path(name).name.lower() == "book.html":
                return name

        # Fallback для EPUB с другой внутренней структурой.
        candidates = []

        for name in names:
            lower = name.lower()

            if not lower.endswith(
                    (".html", ".xhtml", ".htm")
            ):
                continue

            basename = Path(name).name.lower()

            if basename in {
                "coverpage.xhtml",
                "cover.xhtml",
                "nav.xhtml",
                "toc.xhtml",
            }:
                continue

            try:
                raw = archive.read(name)
            except KeyError:
                continue

            text = raw.decode(
                "utf-8-sig",
                errors="ignore",
            )

            normalized = self.normalize_heading(text)

            score = 0

            if "кондак 1" in normalized:
                score += 5

            if "икос 1" in normalized:
                score += 5

            if "кондак 13" in normalized:
                score += 10

            if "молитва" in normalized:
                score += 2

            candidates.append(
                (
                    score,
                    len(raw),
                    name,
                )
            )

        if not candidates:
            return None

        candidates.sort(reverse=True)

        best_score, _, best_name = candidates[0]

        if best_score <= 0:
            return None

        return best_name

    # ============================================================
    # НАЗВАНИЕ
    # ============================================================

    def extract_title(self, soup):
        h1 = soup.find("h1")

        if h1:
            value = self.clean_text(
                h1.get_text(
                    " ",
                    strip=True,
                )
            )

            if value:
                return value

        title_tag = soup.find("title")

        if title_tag:
            value = self.clean_text(
                title_tag.get_text(
                    " ",
                    strip=True,
                )
            )

            if value:
                return value

        return ""

    # ============================================================
    # ОСНОВНОЙ ПАРСЕР
    # ============================================================

    def parse_akathist(self, soup):
        headings = [
            tag
            for tag in soup.find_all(
                list(HEADING_TAGS)
            )
            if isinstance(tag, Tag)
        ]

        if not headings:
            raise CommandError(
                "В EPUB не найдено заголовков."
            )

        first_kontakion_index = self.find_first_kontakion(
            headings
        )

        if first_kontakion_index is None:
            raise CommandError(
                "Не найден «Кондак 1»."
            )

        preface = self.parse_preface(
            headings,
            first_kontakion_index,
        )

        main_sections = []
        explicit_repeats = []
        prayers = []

        main_complete = False
        repeat_ikos_found = False
        repeat_kontakion_found = False
        prayer_started = False
        main_end_heading = None

        for index in range(
                first_kontakion_index,
                len(headings),
        ):
            heading = headings[index]

            raw_heading = self.clean_text(
                heading.get_text(
                    " ",
                    strip=True,
                )
            )

            normalized = self.normalize_heading(
                raw_heading
            )

            parsed_heading = self.parse_section_heading(
                normalized
            )

            if not parsed_heading:
                continue

            section_type = parsed_heading["section_type"]
            number = parsed_heading["number"]

            # ----------------------------------------------------
            # ОСНОВНОЙ АКАФИСТ
            # ----------------------------------------------------

            if not main_complete:
                if section_type not in {
                    "kontakion",
                    "ikos",
                }:
                    continue

                language_nodes = self.collect_language_nodes(
                    heading,
                    stop_at_paragraph_prayer=(
                            section_type == "kontakion"
                            and number == 13
                    ),
                )

                content, translation = self.build_aligned_text(
                    language_nodes
                )

                if not content:
                    raise CommandError(
                        "Не найден церковнославянский "
                        f"текст раздела: {raw_heading}"
                    )

                section = {
                    "section_type": section_type,
                    "number": number,
                    "content": content,
                    "translation": translation,
                    "heading": raw_heading,
                    "note": "",
                }

                if (
                        section_type == "kontakion"
                        and number == 13
                ):
                    section["note"] = "Читается трижды"

                main_sections.append(section)

                if (
                        section_type == "kontakion"
                        and number == 13
                ):
                    main_complete = True
                    main_end_heading = heading

                continue

            # ----------------------------------------------------
            # ПОСЛЕ КОНДАКА 13
            # ----------------------------------------------------

            if section_type == "prayer":
                # Сами молитвы собираются отдельным проходом ниже.
                # Здесь только отмечаем, что после основного акафиста
                # уже начался молитвенный блок.
                prayer_started = True
                continue

            # После молитв новый Кондак/Икос означает,
            # что началась следующая редакция текста.
            #
            # Например, у Иисуса Сладчайшего после
            # первой версии начинается вариант
            # для молящейся женщины.
            if prayer_started:
                if section_type in {
                    "kontakion",
                    "ikos",
                }:
                    break

                continue

            # ----------------------------------------------------
            # ЯВНЫЙ ПОВТОР ИКОСА 1
            # ----------------------------------------------------

            if (
                    section_type == "ikos"
                    and number == 1
                    and not repeat_ikos_found
            ):
                language_nodes = self.collect_language_nodes(
                    heading
                )

                content, translation = self.build_aligned_text(
                    language_nodes
                )

                explicit_repeats.append(
                    {
                        "section_type": "ikos",
                        "number": 1,
                        "content": content,
                        "translation": translation,
                        "heading": raw_heading,
                        "note": "Повтор после Кондака 13",
                    }
                )

                repeat_ikos_found = True
                continue

            # ----------------------------------------------------
            # ЯВНЫЙ ПОВТОР КОНДАКА 1
            # ----------------------------------------------------

            if (
                    section_type == "kontakion"
                    and number == 1
                    and repeat_ikos_found
                    and not repeat_kontakion_found
            ):
                language_nodes = self.collect_language_nodes(
                    heading
                )

                content, translation = self.build_aligned_text(
                    language_nodes
                )

                explicit_repeats.append(
                    {
                        "section_type": "kontakion",
                        "number": 1,
                        "content": content,
                        "translation": translation,
                        "heading": raw_heading,
                        "note": "Повтор после Кондака 13",
                    }
                )

                repeat_kontakion_found = True
                continue

            # Если после Кондака 13 неожиданно появился
            # другой Кондак/Икос, прекращаем разбор.
            if section_type in {
                "kontakion",
                "ikos",
            }:
                break

        repeats = self.prepare_repeats(
            main_sections,
            explicit_repeats,
        )

        prayers = self.parse_prayers_after_kontakion13(
            main_end_heading
        )

        return {
            "preface": preface,
            "main_sections": main_sections,
            "repeats": repeats,
            "prayers": prayers,
        }

    # ============================================================
    # ТРОПАРЬ / КОНДАК ПЕРЕД АКАФИСТОМ
    # ============================================================

    def parse_preface(
            self,
            headings,
            first_kontakion_index,
    ):
        result = {
            "troparion": None,
            "kontakion_before": None,
        }

        for index in range(first_kontakion_index):
            heading = headings[index]

            text = self.clean_text(
                heading.get_text(
                    " ",
                    strip=True,
                )
            )

            normalized = self.normalize_heading(text)

            if self.is_troparion_heading(normalized):
                nodes = self.collect_language_nodes(
                    heading
                )

                content, translation = self.build_whole_text(
                    nodes
                )

                if content:
                    result["troparion"] = {
                        "content": content,
                        "translation": translation,
                        "heading": text,
                    }

            elif self.is_unnumbered_kontakion(normalized):
                nodes = self.collect_language_nodes(
                    heading
                )

                content, translation = self.build_whole_text(
                    nodes
                )

                if content:
                    result["kontakion_before"] = {
                        "content": content,
                        "translation": translation,
                        "heading": text,
                    }

        return result

    # ============================================================
    # ЗАГОЛОВКИ
    # ============================================================

    def find_first_kontakion(self, headings):
        for index, heading in enumerate(headings):
            normalized = self.normalize_heading(
                heading.get_text(
                    " ",
                    strip=True,
                )
            )

            parsed = self.parse_section_heading(
                normalized
            )

            if not parsed:
                continue

            if (
                    parsed["section_type"] == "kontakion"
                    and parsed["number"] == 1
            ):
                return index

        return None

    def parse_section_heading(self, normalized):
        kontakion_match = re.match(
            r"^кондак\s+(\d+)\b",
            normalized,
        )

        if kontakion_match:
            return {
                "section_type": "kontakion",
                "number": int(
                    kontakion_match.group(1)
                ),
            }

        ikos_match = re.match(
            r"^икос\s+(\d+)\b",
            normalized,
        )

        if ikos_match:
            return {
                "section_type": "ikos",
                "number": int(
                    ikos_match.group(1)
                ),
            }

        if re.match(
                r"^молитва(?:\s+\d+)?",
                normalized,
        ):
            return {
                "section_type": "prayer",
                "number": None,
            }

        return None

    def is_troparion_heading(self, normalized):
        return normalized.startswith("тропарь")

    def is_prayer_paragraph_heading(
            self,
            element,
    ):
        """
        Определяет заголовок молитвы, который в EPUB
        размечен обычным <p>, а не <h1>-<h6>.

        Проверяем именно отдельное слово «молитва»,
        чтобы не спутать заголовок с фразами вроде
        «молитвами твоими...».
        """

        if not isinstance(element, Tag):
            return False

        if element.name != "p":
            return False

        text = self.clean_text(
            element.get_text(
                " ",
                strip=True,
            )
        )

        if not text:
            return False

        if len(text) > 250:
            return False

        # Абзацы основного текста с языковыми классами не считаем
        # заголовками молитв, даже если они начинаются словом
        # «молитва». У найденного нами варианта Азбуки заголовок
        # молитвы идёт обычным <p> без gprayer/paint/translate.
        classes = set(
            element.get(
                "class",
                [],
            )
        )

        if classes & (
                CHURCH_CLASSES
                | TRANSLATION_CLASSES
        ):
            return False

        # Дополнительная защита от длинного обычного предложения.
        if len(text.split()) > 24:
            return False

        normalized = self.normalize_heading(
            text
        )

        return (
                re.match(
                    r"^молитва(?:\s|$|[:.])",
                    normalized,
                )
                is not None
        )

    def parse_prayers_after_kontakion13(
            self,
            kontakion13_heading,
    ):
        """
        Собирает молитвы после Кондака 13 в порядке документа.

        Азбука использует как минимум два варианта разметки:

            <h2>Молитва</h2>
            <p class="gprayer">...</p>

        и:

            <p>Молитва ко святому...</p>
            <p>...</p>

        При этом между Кондаком 13 и молитвами могут находиться
        явные повторы Икоса 1 и Кондака 1. Их здесь пропускаем.
        Если начинается новая редакция акафиста, прекращаем сбор.
        """

        if kontakion13_heading is None:
            return []

        prayers = []
        repeat_ikos_found = False
        repeat_kontakion_found = False

        interesting_tags = list(HEADING_TAGS) + ["p"]

        for element in kontakion13_heading.find_all_next(
                interesting_tags
        ):
            if not isinstance(element, Tag):
                continue

            if element.name in HEADING_TAGS:
                raw_heading = self.clean_text(
                    element.get_text(
                        " ",
                        strip=True,
                    )
                )

                normalized = self.normalize_heading(
                    raw_heading
                )

                parsed_heading = self.parse_section_heading(
                    normalized
                )

                if not parsed_heading:
                    continue

                section_type = parsed_heading["section_type"]
                number = parsed_heading["number"]

                # Явный повтор Икоса 1 после Кондака 13.
                if (
                        section_type == "ikos"
                        and number == 1
                        and not repeat_ikos_found
                ):
                    repeat_ikos_found = True
                    continue

                # Явный повтор Кондака 1 после Икоса 1.
                if (
                        section_type == "kontakion"
                        and number == 1
                        and repeat_ikos_found
                        and not repeat_kontakion_found
                ):
                    repeat_kontakion_found = True
                    continue

                # Любой другой Кондак/Икос после основной части
                # означает начало другой редакции текста.
                if section_type in {
                    "kontakion",
                    "ikos",
                }:
                    break

                if section_type == "prayer":
                    language_nodes = self.collect_language_nodes(
                        element,
                        stop_at_paragraph_prayer=True,
                    )

                    content, translation = self.build_whole_text(
                        language_nodes
                    )

                    if content:
                        prayers.append(
                            {
                                "section_type": "prayer",
                                "number": len(prayers) + 1,
                                "content": content,
                                "translation": translation,
                                "heading": raw_heading,
                                "note": "",
                            }
                        )

                continue

            if not self.is_prayer_paragraph_heading(
                    element
            ):
                continue

            language_nodes = (
                self.collect_language_nodes_from_paragraph_heading(
                    element
                )
            )

            content, translation = self.build_whole_text(
                language_nodes
            )

            if not content:
                continue

            prayers.append(
                {
                    "section_type": "prayer",
                    "number": len(prayers) + 1,
                    "content": content,
                    "translation": translation,
                    "heading": self.clean_text(
                        element.get_text(
                            " ",
                            strip=True,
                        )
                    ),
                    "note": "",
                }
            )

        return prayers

    def collect_language_nodes_from_paragraph_heading(
            self,
            heading,
    ):
        """
        Собирает текст молитвы, если её заголовок является <p>.
        Останавливается на следующем h1-h6 или следующем
        абзаце-заголовке молитвы.
        """

        result = []
        fallback_paragraphs = []

        for element in heading.next_elements:
            if element is heading:
                continue

            if not isinstance(element, Tag):
                continue

            if element.name in HEADING_TAGS:
                break

            if (
                    element is not heading
                    and self.is_prayer_paragraph_heading(
                element
            )
            ):
                break

            if element.name != "p":
                continue

            classes = set(
                element.get(
                    "class",
                    [],
                )
            )

            text = self.extract_element_text(
                element
            )

            if not text:
                continue

            language = None

            if classes & CHURCH_CLASSES:
                language = "cu"

            elif classes & TRANSLATION_CLASSES:
                language = "ru"

            if language:
                result.append(
                    (
                        language,
                        text,
                    )
                )
            else:
                fallback_paragraphs.append(
                    text
                )

        if not result and fallback_paragraphs:
            return [
                (
                    "cu",
                    text,
                )
                for text in fallback_paragraphs
            ]

        return result

    def is_unnumbered_kontakion(self, normalized):
        if not normalized.startswith("кондак"):
            return False

        return (
                re.match(
                    r"^кондак\s+\d+\b",
                    normalized,
                )
                is None
        )

    # ============================================================
    # ИЗВЛЕЧЕНИЕ ЦС / RU
    # ============================================================

    def collect_language_nodes(
            self,
            heading,
            stop_at_paragraph_prayer=False,
    ):
        result = []
        fallback_paragraphs = []

        for element in heading.next_elements:
            if element is heading:
                continue

            if not isinstance(element, Tag):
                continue

            if element.name in HEADING_TAGS:
                break

            # В некоторых EPUB Азбуки после Кондака 13
            # заголовок молитвы размечен обычным <p>.
            # Останавливаемся на нём только там, где это
            # явно разрешено вызывающим кодом.
            if (
                    stop_at_paragraph_prayer
                    and self.is_prayer_paragraph_heading(
                element
            )
            ):
                break

            if element.name != "p":
                continue

            classes = set(
                element.get(
                    "class",
                    [],
                )
            )

            text = self.extract_element_text(
                element
            )

            if not text:
                continue

            language = None

            if classes & CHURCH_CLASSES:
                language = "cu"

            elif classes & TRANSLATION_CLASSES:
                language = "ru"

            if language:
                result.append(
                    (
                        language,
                        text,
                    )
                )
            else:
                fallback_paragraphs.append(
                    text
                )

        # Если в секции вообще нет размеченных языковых блоков,
        # считаем обычные <p> церковнославянским текстом.
        #
        # Это нужно для EPUB, где вся книга идёт как:
        #
        # <h2>Кондак 1</h2>
        # <p>...</p>
        # <p>...</p>
        #
        # без class="paint", class="gprayer" и class="translate".
        if not result and fallback_paragraphs:
            return [
                (
                    "cu",
                    text,
                )
                for text in fallback_paragraphs
            ]

        return result

    def extract_element_text(
            self,
            element,
    ):
        """
        Извлекает текст из <p> с сохранением настоящих <br>.

        Вложенные теги вроде:

            <a>верных</a>
            <em>Аллилуиа</em>

        не создают лишних переносов.

        А:

            строка 1<br/>
            строка 2

        остаётся двумя строками.
        """

        parts = []

        for node in element.descendants:
            if isinstance(node, Tag):
                if node.name == "br":
                    parts.append("\n")

                continue

            text = str(node)

            if not text:
                continue

            parts.append(text)

        text = "".join(parts)

        text = text.replace(
            "\xa0",
            " ",
        )

        text = text.replace(
            "\u200b",
            "",
        )

        lines = []

        for line in text.splitlines():
            line = re.sub(
                r"\s+",
                " ",
                line,
            ).strip()

            if line:
                lines.append(line)

        return "\n".join(lines)

    # ============================================================
    # ЦС + RU ДЛЯ КОНДАКОВ И ИКОСОВ
    # ============================================================

    def build_aligned_text(
            self,
            language_nodes,
    ):
        """
        Формирует соответствующие друг другу блоки ЦС и RU.

        Возможны варианты:

            CU
            RU

        или:

            CU
            CU
            RU

        Например, в EPUB Иисуса Сладчайшего
        два ЦС <p> иногда соответствуют одному
        русскому <p>.
        """

        groups = []

        pending_cu = []
        pending_ru = []

        def flush():
            nonlocal pending_cu
            nonlocal pending_ru

            if not pending_cu and not pending_ru:
                return

            groups.append(
                {
                    "cu": "\n".join(
                        pending_cu
                    ).strip(),
                    "ru": "\n".join(
                        pending_ru
                    ).strip(),
                }
            )

            pending_cu = []
            pending_ru = []

        for language, text in language_nodes:
            if language == "cu":
                # Новый ЦС после русского означает,
                # что предыдущая языковая пара закончилась.
                if pending_ru:
                    flush()

                pending_cu.append(text)

            elif language == "ru":
                pending_ru.append(text)

        flush()

        church_parts = []
        russian_parts = []

        for group in groups:
            church = group["cu"]
            russian = group["ru"]

            if not church:
                continue

            church_parts.append(church)
            russian_parts.append(russian)

        content = "\n\n".join(
            church_parts
        ).strip()

        translation = "\n\n".join(
            russian_parts
        ).strip()

        return content, translation

    # ============================================================
    # МОЛИТВЫ
    # ============================================================

    def build_whole_text(
            self,
            language_nodes,
    ):
        """
        Молитвы сохраняются иначе, чем Кондаки/Икосы:

        сначала весь церковнославянский текст,
        отдельно весь русский перевод.

        На frontend молитва выводится:
        весь ЦС -> весь RU.
        """

        church_parts = []
        russian_parts = []

        for language, text in language_nodes:
            if language == "cu":
                church_parts.append(text)

            elif language == "ru":
                russian_parts.append(text)

        content = "\n\n".join(
            church_parts
        ).strip()

        translation = "\n\n".join(
            russian_parts
        ).strip()

        return content, translation

    # ============================================================
    # ПОВТОР ИКОСА 1 И КОНДАКА 1
    # ============================================================

    def prepare_repeats(
            self,
            main_sections,
            explicit_repeats,
    ):
        explicit_ikos = next(
            (
                section
                for section in explicit_repeats
                if (
                    section["section_type"] == "ikos"
                    and section["number"] == 1
            )
            ),
            None,
        )

        explicit_kontakion = next(
            (
                section
                for section in explicit_repeats
                if (
                    section["section_type"] == "kontakion"
                    and section["number"] == 1
            )
            ),
            None,
        )

        original_ikos = self.find_main_section(
            main_sections,
            "ikos",
            1,
        )

        original_kontakion = self.find_main_section(
            main_sections,
            "kontakion",
            1,
        )

        if not original_ikos:
            raise CommandError(
                "Не найден основной Икос 1."
            )

        if not original_kontakion:
            raise CommandError(
                "Не найден основной Кондак 1."
            )

        return [
            explicit_ikos
            or {
                **original_ikos,
                "note": "Повтор после Кондака 13",
            },
            explicit_kontakion
            or {
                **original_kontakion,
                "note": "Повтор после Кондака 13",
            },
            ]

    def find_main_section(
            self,
            sections,
            section_type,
            number,
    ):
        for section in sections:
            if (
                    section["section_type"] == section_type
                    and section["number"] == number
            ):
                return section

        return None

    # ============================================================
    # ВАЛИДАЦИЯ
    # ============================================================

    def validate_parsed(self, parsed):
        main_sections = parsed["main_sections"]

        kontakions = [
            section
            for section in main_sections
            if section["section_type"] == "kontakion"
        ]

        ikoses = [
            section
            for section in main_sections
            if section["section_type"] == "ikos"
        ]

        kontakion_numbers = [
            section["number"]
            for section in kontakions
        ]

        ikos_numbers = [
            section["number"]
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
                "Неверная последовательность кондаков.\n"
                f"Найдено: {kontakion_numbers}\n"
                f"Ожидалось: {expected_kontakions}"
            )

        if ikos_numbers != expected_ikoses:
            raise CommandError(
                "Неверная последовательность икосов.\n"
                f"Найдено: {ikos_numbers}\n"
                f"Ожидалось: {expected_ikoses}"
            )

        expected_order = []

        for number in range(1, 13):
            expected_order.append(
                ("kontakion", number)
            )

            expected_order.append(
                ("ikos", number)
            )

        expected_order.append(
            ("kontakion", 13)
        )

        actual_order = [
            (
                section["section_type"],
                section["number"],
            )
            for section in main_sections
        ]

        if actual_order != expected_order:
            raise CommandError(
                "Нарушено чередование Кондаков и Икосов.\n"
                f"Получено: {actual_order}"
            )

        if len(parsed["repeats"]) != 2:
            raise CommandError(
                "После Кондака 13 должны повторяться "
                "Икос 1 и Кондак 1."
            )

        for section in main_sections:
            if not section["content"]:
                raise CommandError(
                    "Пустой церковнославянский текст: "
                    f"{section['heading']}"
                )

        self.validate_alignment(
            main_sections
        )

    def validate_alignment(
            self,
            sections,
    ):
        for section in sections:
            translation = section["translation"]

            if not translation:
                continue

            content_parts = self.split_paragraphs(
                section["content"]
            )

            translation_parts = self.split_paragraphs(
                translation
            )

            if len(content_parts) != len(translation_parts):
                raise CommandError(
                    "Нарушено соответствие ЦС/RU блоков "
                    f"в разделе {section['heading']}.\n"
                    f"ЦС: {len(content_parts)}, "
                    f"RU: {len(translation_parts)}"
                )

    # ============================================================
    # ОТЧЁТ
    # ============================================================

    def print_report(self, parsed):
        main_sections = parsed["main_sections"]

        kontakion_count = sum(
            1
            for section in main_sections
            if section["section_type"] == "kontakion"
        )

        ikos_count = sum(
            1
            for section in main_sections
            if section["section_type"] == "ikos"
        )

        prayers = parsed["prayers"]
        preface = parsed["preface"]

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                "Проверка структуры пройдена."
            )
        )

        self.stdout.write(
            f"Кондаков: {kontakion_count}"
        )

        self.stdout.write(
            f"Икосов: {ikos_count}"
        )

        self.stdout.write(
            f"Молитв после акафиста: {len(prayers)}"
        )

        self.stdout.write(
            "Тропарь перед акафистом: "
            + (
                "ДА"
                if preface["troparion"]
                else "НЕТ"
            )
        )

        self.stdout.write(
            "Кондак перед акафистом: "
            + (
                "ДА"
                if preface["kontakion_before"]
                else "НЕТ"
            )
        )

        self.stdout.write(
            "Повтор после Кондака 13: "
            "Икос 1 → Кондак 1"
        )

        self.stdout.write("")
        self.stdout.write(
            "Основная структура:"
        )

        for section in main_sections:
            translation_status = (
                "RU"
                if section["translation"]
                else "--"
            )

            paragraph_count = len(
                self.split_paragraphs(
                    section["content"]
                )
            )

            self.stdout.write(
                f"{section['section_type']:10} "
                f"{section['number']:>2} | "
                f"{translation_status} | "
                f"ЦС {len(section['content'])} симв. | "
                f"пар: {paragraph_count}"
            )

        if prayers:
            self.stdout.write("")
            self.stdout.write(
                "Молитвы:"
            )

            for prayer in prayers:
                translation_status = (
                    "RU"
                    if prayer["translation"]
                    else "--"
                )

                self.stdout.write(
                    f"prayer {prayer['number']:>2} | "
                    f"{translation_status} | "
                    f"ЦС {len(prayer['content'])} симв. | "
                    f"RU {len(prayer['translation'])} симв."
                )

    # ============================================================
    # СОХРАНЕНИЕ В БД
    # ============================================================

    @transaction.atomic
    def save_akathist(
            self,
            slug,
            title,
            parsed,
    ):
        akathist, created = Akathist.objects.update_or_create(
            slug=slug,
            defaults={
                "title": title,
                "is_visible": True,
            },
        )

        if created:
            self.stdout.write(
                "Создан новый Akathist."
            )
        else:
            self.stdout.write(
                "Обновлён существующий Akathist."
            )

        self.save_preface(
            akathist,
            slug,
            parsed["preface"],
        )

        desired_orders = []
        main_text_map = {}

        order = 1

        # --------------------------------------------------------
        # 13 Кондаков + 12 Икосов
        # --------------------------------------------------------

        for section in parsed["main_sections"]:
            text_object = self.save_main_text(
                slug,
                section,
            )

            key = (
                section["section_type"],
                section["number"],
            )

            main_text_map[key] = text_object

            self.save_section(
                akathist=akathist,
                order=order,
                section_type=section["section_type"],
                number=section["number"],
                text_object=text_object,
                note=section["note"],
            )

            desired_orders.append(order)
            order += 1

        # --------------------------------------------------------
        # Повтор Икоса 1 и Кондака 1
        # --------------------------------------------------------

        for repeat in parsed["repeats"]:
            key = (
                repeat["section_type"],
                repeat["number"],
            )

            text_object = main_text_map.get(key)

            if not text_object:
                raise CommandError(
                    "Не удалось найти Text "
                    "для повторного раздела."
                )

            self.save_section(
                akathist=akathist,
                order=order,
                section_type=repeat["section_type"],
                number=repeat["number"],
                text_object=text_object,
                note="Повтор после Кондака 13",
            )

            desired_orders.append(order)
            order += 1

        # --------------------------------------------------------
        # Молитвы
        # --------------------------------------------------------

        for prayer in parsed["prayers"]:
            text_object = self.save_prayer_text(
                slug,
                prayer,
            )

            self.save_section(
                akathist=akathist,
                order=order,
                section_type="prayer",
                number=prayer["number"],
                text_object=text_object,
                note="",
            )

            desired_orders.append(order)
            order += 1

        # Удаляем старые секции предыдущего импорта,
        # которых уже нет в актуальной структуре.
        AkathistSection.objects.filter(
            akathist=akathist
        ).exclude(
            order__in=desired_orders
        ).delete()

        count = AkathistSection.objects.filter(
            akathist=akathist
        ).count()

        self.stdout.write(
            f"Разделов в БД: {count}"
        )

    def save_main_text(
            self,
            akathist_slug,
            section,
    ):
        section_type = section["section_type"]
        number = section["number"]

        text_slug = (
            f"{akathist_slug}-"
            f"{section_type}-"
            f"{number}"
        )

        title = self.make_title(
            section_type,
            number,
        )

        text_object, _ = Text.objects.update_or_create(
            slug=text_slug,
            defaults={
                "title": title,
                "content": section["content"],
                "translation": section["translation"],
                "language": "cu",
                "is_visible": True,
            },
        )

        return text_object

    def save_prayer_text(
            self,
            akathist_slug,
            prayer,
    ):
        number = prayer["number"]

        text_slug = (
            f"{akathist_slug}-prayer-{number}"
        )

        text_object, _ = Text.objects.update_or_create(
            slug=text_slug,
            defaults={
                "title": f"Молитва {number}",
                "content": prayer["content"],
                "translation": prayer["translation"],
                "language": "cu",
                "is_visible": True,
            },
        )

        return text_object

    def save_section(
            self,
            akathist,
            order,
            section_type,
            number,
            text_object,
            note,
    ):
        AkathistSection.objects.update_or_create(
            akathist=akathist,
            order=order,
            defaults={
                "section_type": section_type,
                "number": number,
                "text": text_object,
                "note": note,
            },
        )

    # ============================================================
    # ТРОПАРЬ / КОНДАК ПЕРЕД АКАФИСТОМ
    # ============================================================

    def save_preface(
            self,
            akathist,
            akathist_slug,
            preface,
    ):
        troparion = preface.get(
            "troparion"
        )

        kontakion_before = preface.get(
            "kontakion_before"
        )

        # Поля поддерживаются только если они
        # действительно присутствуют в модели Akathist.
        if hasattr(
                akathist,
                "troparion_id",
        ):
            if troparion:
                text_object = self.save_preface_text(
                    slug=(
                        f"{akathist_slug}-troparion"
                    ),
                    title="Тропарь",
                    data=troparion,
                )

                akathist.troparion = text_object

            else:
                akathist.troparion = None

        if hasattr(
                akathist,
                "kontakion_before_id",
        ):
            if kontakion_before:
                text_object = self.save_preface_text(
                    slug=(
                        f"{akathist_slug}-"
                        "kontakion-before"
                    ),
                    title="Кондак перед акафистом",
                    data=kontakion_before,
                )

                akathist.kontakion_before = text_object

            else:
                akathist.kontakion_before = None

        update_fields = []

        if hasattr(
                akathist,
                "troparion_id",
        ):
            update_fields.append(
                "troparion"
            )

        if hasattr(
                akathist,
                "kontakion_before_id",
        ):
            update_fields.append(
                "kontakion_before"
            )

        if update_fields:
            akathist.save(
                update_fields=update_fields
            )

    def save_preface_text(
            self,
            slug,
            title,
            data,
    ):
        text_object, _ = Text.objects.update_or_create(
            slug=slug,
            defaults={
                "title": title,
                "content": data["content"],
                "translation": data["translation"],
                "language": "cu",
                "is_visible": True,
            },
        )

        return text_object

    # ============================================================
    # ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
    # ============================================================

    def make_title(
            self,
            section_type,
            number,
    ):
        if section_type == "kontakion":
            return f"Кондак {number}"

        if section_type == "ikos":
            return f"Икос {number}"

        if section_type == "prayer":
            return f"Молитва {number}"

        return f"{section_type} {number}"

    def normalize_heading(
            self,
            value,
    ):
        value = self.clean_text(value)

        value = unicodedata.normalize(
            "NFD",
            value,
        )

        value = "".join(
            char
            for char in value
            if unicodedata.category(char) != "Mn"
        )

        value = value.lower()

        value = value.replace(
            "ё",
            "е",
        )

        value = re.sub(
            r"\s+",
            " ",
            value,
        )

        return value.strip()

    def clean_text(
            self,
            value,
            preserve_newlines=False,
    ):
        if value is None:
            return ""

        value = value.replace(
            "\xa0",
            " ",
        )

        value = value.replace(
            "\u200b",
            "",
        )

        if preserve_newlines:
            lines = []

            for line in value.splitlines():
                line = re.sub(
                    r"[ \t]+",
                    " ",
                    line,
                ).strip()

                if line:
                    lines.append(line)

            return "\n".join(lines).strip()

        value = re.sub(
            r"\s+",
            " ",
            value,
        )

        return value.strip()

    def split_paragraphs(
            self,
            value,
    ):
        if not value:
            return []

        return [
            part.strip()
            for part in re.split(
                r"\n\s*\n",
                value,
            )
            if part.strip()
        ]
