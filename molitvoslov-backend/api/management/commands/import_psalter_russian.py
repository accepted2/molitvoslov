import json
import re
import unicodedata
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from api.models import Psalm


try:
    from pypdf import PdfReader
except ImportError:
    PdfReader = None


# =========================================================
# ОБЩИЕ ФУНКЦИИ
# =========================================================

def normalize(text):
    text = text.replace("\xa0", " ")
    text = text.replace("\r\n", "\n")
    text = text.replace("\r", "\n")

    text = re.sub(
        r"[ \t]+",
        " ",
        text,
    )

    text = re.sub(
        r"\n[ \t]+",
        "\n",
        text,
    )

    return text.strip()


def normalize_inline(text):
    text = normalize(text)

    text = re.sub(
        r"\s*\n\s*",
        " ",
        text,
    )

    text = re.sub(
        r"\s+",
        " ",
        text,
    )

    return text.strip()


def accent_count(text):
    count = 0

    for char in unicodedata.normalize(
            "NFD",
            text,
    ):
        if unicodedata.category(char) == "Mn":
            count += 1

    return count


def contains_cyrillic(text):
    return bool(
        re.search(
            r"[А-Яа-яЁё]",
            text,
        )
    )


# =========================================================
# ПОИСК ПСАЛМОВ
# =========================================================

def find_psalm_blocks(full_text):
    """
    Разбивает PDF на блоки:

        Псалом 1
        ...
        Псалом 2
        ...

    В PDF присутствует и Псалом 151,
    но ниже мы работаем только с 1–150.
    """

    pattern = re.compile(
        r"(?m)^[ \t]*Псалом\s+(\d{1,3})[ \t]*$"
    )

    matches = list(
        pattern.finditer(full_text)
    )

    blocks = {}

    for index, match in enumerate(matches):
        psalm_number = int(
            match.group(1)
        )

        start = match.end()

        if index + 1 < len(matches):
            end = matches[index + 1].start()
        else:
            end = len(full_text)

        blocks[psalm_number] = (
            full_text[start:end].strip()
        )

    return blocks


# =========================================================
# РАЗБИЕНИЕ БЛОКА ПО НОМЕРАМ СТИХОВ
# =========================================================

def find_number_markers(text):
    """
    Находит номера:

        1 Блажен...
        2 Но в законе...

    и случай, когда PDF склеил пробел:

        11Да...
    """

    return list(
        re.finditer(
            r"(?<!\d)"
            r"(\d{1,3})"
            r"(?=\s|[А-ЯЁA-Z])",
            text,
        )
    )


def clean_piece(text):
    text = normalize_inline(text)

    #
    # Отрезаем литургические вставки,
    # которые могут приклеиться к последнему стиху.
    #
    stop_patterns = [
        r"\s+Сла́ва Отцу́",
        r"\s+Слава Отцу",
        r"\s+Слава:",
        r"\s+Сла́ва:",
        r"\s+По\s+\d+[–-]?[йя]\s+кафисме",
        r"\s+После\s+кафизмы",
        r"\s+Кафи́сма\s+\d+",
        r"\s+Кафисма\s+\d+",
    ]

    for pattern in stop_patterns:
        match = re.search(
            pattern,
            text,
            flags=re.IGNORECASE,
        )

        if match:
            text = text[:match.start()]

    return text.strip()


def build_candidates(block):
    markers = find_number_markers(
        block
    )

    candidates = []

    for index, marker in enumerate(markers):
        number = int(
            marker.group(1)
        )

        start = marker.end()

        if index + 1 < len(markers):
            end = markers[index + 1].start()
        else:
            end = len(block)

        text = clean_piece(
            block[start:end]
        )

        candidates.append({
            "number": number,
            "text": text,
            "position": marker.start(),
            "accents": accent_count(text),
        })

    return candidates


# =========================================================
# ПОИСК ПОСЛЕДОВАТЕЛЬНОСТЕЙ СТИХОВ
# =========================================================

def find_sequence_runs(
        candidates,
        expected_numbers,
):
    """
    В обычном случае PDF содержит:

        1,2,3,...   ЦС
        1,2,3,...   RU

    Поэтому ищем все точные последовательности
    нужных номеров.
    """

    expected_length = len(
        expected_numbers
    )

    runs = []

    for start in range(
            0,
            len(candidates) - expected_length + 1,
    ):
        fragment = candidates[
            start:start + expected_length
        ]

        numbers = [
            item["number"]
            for item in fragment
        ]

        if numbers != expected_numbers:
            continue

        if not all(
                item["text"]
                for item in fragment
        ):
            continue

        accents = sum(
            item["accents"]
            for item in fragment
        )

        runs.append({
            "start": start,
            "items": fragment,
            "accents": accents,
        })

    return runs


def choose_russian_run(
        candidates,
        expected_numbers,
        psalm_number=None,
):
    """
    Выбирает русский блок стихов.

    Русский текст практически не содержит
    церковнославянских ударений, поэтому
    предпочтение отдаётся последовательности
    с минимальным количеством combining accents.

    Псалом 118 обрабатывается отдельно, потому что
    в PDF он разделён Славами и страницами.
    """

    # =====================================================
    # ПСАЛОМ 118
    # =====================================================

    if psalm_number == 118:
        selected_items = []

        previous_position = -1
        total_accents = 0

        for expected_number in expected_numbers:
            possible = [
                item
                for item in candidates
                if (
                        item["number"] == expected_number
                        and item["position"] > previous_position
                        and item["text"]
                        and contains_cyrillic(item["text"])
                )
            ]

            if not possible:
                return None

            possible.sort(
                key=lambda item: (
                    item["accents"],
                    item["position"],
                )
            )

            selected = possible[0]

            selected_items.append(
                selected
            )

            total_accents += (
                selected["accents"]
            )

            previous_position = (
                selected["position"]
            )

        selected_numbers = [
            item["number"]
            for item in selected_items
        ]

        if selected_numbers != expected_numbers:
            return None

        return {
            "start": 0,
            "items": selected_items,
            "accents": total_accents,
        }

    # =====================================================
    # ОСТАЛЬНЫЕ ПСАЛМЫ
    # =====================================================

    runs = find_sequence_runs(
        candidates,
        expected_numbers,
    )

    if not runs:
        return None

    runs.sort(
        key=lambda run: (
            run["accents"],
            run["start"],
        )
    )

    return runs[0]


# =========================================================
# РУССКИЙ ЗАГОЛОВОК
# =========================================================

def clean_title(
        title,
        psalm_number,
):
    title = normalize_inline(
        title
    )

    #
    # Убираем мусор в начале.
    #
    title = title.lstrip(
        " .,:;-"
    )

    #
    # В PDF встречается:
    #
    #   Псалом Давида, 10.
    #   Аллилуия, 105.
    #
    # Номер самого псалма нам в title_russian
    # не нужен.
    #
    title = re.sub(
        rf",\s*{psalm_number}(?=[.!?]|$)",
        "",
        title,
    )

    #
    # Сноски:
    #
    #   у евреев1.
    #
    # превращаем в:
    #
    #   у евреев.
    #
    title = re.sub(
        r"(?<=[А-Яа-яЁё])\d+(?=[.,;:!?]|$)",
        "",
        title,
    )

    title = re.sub(
        r"\s+([.,;:!?])",
        r"\1",
        title,
    )

    title = re.sub(
        r"\s+",
        " ",
        title,
    )

    return title.strip()


def extract_russian_tail(text):
    """
    Из такого текста:

        Аллилу́иа. Аллилуия, 105.

    получает:

        Аллилуия, 105.

    Или:

        Псало́м Дави́ду.
        Псалом Давида.
        Не надписан у евреев1.

    получает:

        Псалом Давида. Не надписан у евреев1.

    Главное отличие:
    церковнославянская часть содержит ударения,
    русский текст — нет.
    """

    text = normalize_inline(
        text
    )

    if not text:
        return ""

    #
    # Разделяем на законченные фразы.
    #
    parts = re.split(
        r"(?<=[.!?])\s+",
        text,
    )

    parts = [
        part.strip()
        for part in parts
        if part.strip()
    ]

    if not parts:
        return ""

    #
    # Берём идущие справа русские предложения,
    # пока не упремся в ЦС с ударениями.
    #
    russian_parts = []

    for part in reversed(parts):
        accents = accent_count(
            part
        )

        if accents == 0:
            russian_parts.append(
                part
            )
            continue

        if russian_parts:
            break

    if russian_parts:
        russian_parts.reverse()

        return " ".join(
            russian_parts
        ).strip()

    #
    # Запасной случай:
    # выбираем фрагмент с минимальным
    # количеством ударений.
    #
    best = min(
        parts,
        key=lambda part: (
            accent_count(part),
            len(part),
        ),
    )

    return best.strip()


def extract_title_russian(
        block,
        psalm,
        candidates,
):
    """
    Получает ТОЛЬКО русский заголовок.

    Здесь принципиально не используется
    весь текст до russian_run, потому что
    именно из-за этого раньше в title_russian
    попадал весь церковнославянский псалом.
    """

    verses = list(
        psalm.verses
        .all()
        .order_by(
            "number"
        )
    )

    expected_numbers = [
        verse.number
        for verse in verses
    ]

    if not expected_numbers:
        return ""

    first_body_number = (
        expected_numbers[0]
    )

    # =====================================================
    # СЛУЧАЙ:
    #
    # надписание имеет собственные номера.
    #
    # Например:
    #
    # Псалом 3:
    #   1 — надписание
    #   2 — первый основной стих
    #
    # Псалом 50:
    #   1–2 — надписание
    #   3 — первый основной стих
    # =====================================================

    if first_body_number > 1:
        title_numbers = list(
            range(
                1,
                first_body_number,
            )
        )

        title_runs = (
            find_sequence_runs(
                candidates,
                title_numbers,
            )
        )

        if title_runs:
            #
            # Русский вариант опять же
            # содержит меньше ударений.
            #
            title_runs.sort(
                key=lambda run: (
                    run["accents"],
                    run["start"],
                )
            )

            selected = (
                title_runs[0]
            )

            title_parts = []

            for item in selected[
                "items"
            ]:
                part = (
                    extract_russian_tail(
                        item["text"]
                    )
                )

                if not part:
                    part = item[
                        "text"
                    ]

                title_parts.append(
                    part
                )

            title = " ".join(
                title_parts
            )

            title = clean_title(
                title,
                psalm.number,
            )

            return title

        return ""

    # =====================================================
    # СЛУЧАЙ:
    #
    # заголовок расположен перед стихом №1
    # и собственного номера не имеет.
    # =====================================================

    if not candidates:
        return ""

    first_marker_position = (
        candidates[0][
            "position"
        ]
    )

    #
    # ВАЖНО:
    #
    # берём текст ТОЛЬКО до первого
    # числового маркера стиха.
    #
    # Таким образом в заголовок физически
    # не может попасть тело псалма.
    #
    header = block[
        :first_marker_position
    ]

    title = extract_russian_tail(
        header
    )

    title = clean_title(
        title,
        psalm.number,
    )

    return title


def validate_title(
        psalm_number,
        title,
):
    """
    Защита от повторения старой ошибки.

    Если парсер снова случайно захватит
    тело псалма, импорт будет остановлен.
    """

    if not title:
        return (
            f"Псалом {psalm_number}: "
            f"русский заголовок пуст."
        )

    if len(title) > 500:
        return (
            f"Псалом {psalm_number}: "
            f"заголовок подозрительно длинный "
            f"({len(title)} символов)."
        )

    #
    # В нормальном русском заголовке не должно
    # быть множества церковнославянских ударений.
    #
    if accent_count(title) > 3:
        return (
            f"Псалом {psalm_number}: "
            f"в русском заголовке слишком много "
            f"знаков ударения: {title!r}"
        )

    #
    # Защита от попадания стихов:
    #
    # "1 Господи..."
    # "2 Блажени..."
    #
    if re.search(
            r"(?:^|\s)\d{1,3}\s+[А-Яа-яЁё]",
            title,
    ):
        return (
            f"Псалом {psalm_number}: "
            f"в заголовок, вероятно, попали стихи: "
            f"{title!r}"
        )

    return None


# =========================================================
# КОМАНДА
# =========================================================

class Command(BaseCommand):
    help = (
        "Импортирует русский перевод Псалтири "
        "из PDF Азбуки веры."
    )

    def add_arguments(
            self,
            parser,
    ):
        parser.add_argument(
            "pdf_file",
            type=str,
        )

        parser.add_argument(
            "--json-output",
            default=(
                "files/"
                "psalter_russian.json"
            ),
        )

        parser.add_argument(
            "--check-only",
            action="store_true",
            help=(
                "Проверить PDF и создать JSON, "
                "но не изменять БД."
            ),
        )

        parser.add_argument(
            "--titles-only",
            action="store_true",
            help=(
                "Обновить только title_russian. "
                "Русские тексты стихов не изменяются."
            ),
        )

        parser.add_argument(
            "--show-titles",
            action="store_true",
            help=(
                "Вывести найденные русские "
                "заголовки в консоль."
            ),
        )

    def handle(
            self,
            *args,
            **options,
    ):
        if PdfReader is None:
            raise CommandError(
                "Не установлен pypdf.\n"
                "Установи:\n"
                "python -m pip install pypdf"
            )

        pdf_path = Path(
            options["pdf_file"]
        )

        json_output = Path(
            options["json_output"]
        )

        check_only = options[
            "check_only"
        ]

        titles_only = options[
            "titles_only"
        ]

        show_titles = options[
            "show_titles"
        ]

        if not pdf_path.exists():
            raise CommandError(
                f"PDF не найден: "
                f"{pdf_path}"
            )

        # =================================================
        # ЧИТАЕМ PDF
        # =================================================

        self.stdout.write(
            f"Читаю PDF: {pdf_path}"
        )

        reader = PdfReader(
            str(pdf_path)
        )

        pages = []

        page_count = len(
            reader.pages
        )

        for index, page in enumerate(
                reader.pages,
                start=1,
        ):
            text = (
                    page.extract_text()
                    or ""
            )

            pages.append(
                text
            )

            self.stdout.write(
                f"Страница "
                f"{index}/{page_count}"
            )

        full_text = normalize(
            "\n".join(pages)
        )

        blocks = find_psalm_blocks(
            full_text
        )

        self.stdout.write(
            f"Найдено блоков Псалмов: "
            f"{len(blocks)}"
        )

        # =================================================
        # БД
        # =================================================

        psalms = list(
            Psalm.objects
            .filter(
                number__lte=150
            )
            .prefetch_related(
                "verses"
            )
            .order_by(
                "number"
            )
        )

        if len(psalms) != 150:
            raise CommandError(
                "В БД должно быть 150 псалмов. "
                f"Сейчас: {len(psalms)}."
            )

        result = {
            "psalms": []
        }

        errors = []

        total_verses = 0

        # =================================================
        # ОБРАБОТКА
        # =================================================

        for psalm in psalms:
            block = blocks.get(
                psalm.number
            )

            if block is None:
                errors.append(
                    f"Псалом "
                    f"{psalm.number}: "
                    f"отсутствует в PDF."
                )

                continue

            verses = list(
                psalm.verses
                .all()
                .order_by(
                    "number"
                )
            )

            expected_numbers = [
                verse.number
                for verse in verses
            ]

            candidates = (
                build_candidates(
                    block
                )
            )

            russian_run = (
                choose_russian_run(
                    candidates,
                    expected_numbers,
                    psalm.number,
                )
            )

            if russian_run is None:
                errors.append(
                    f"Псалом "
                    f"{psalm.number}: "
                    f"не удалось определить "
                    f"русский блок стихов."
                )

                continue

            # =============================================
            # ЗАГОЛОВОК
            # =============================================

            title_russian = (
                extract_title_russian(
                    block,
                    psalm,
                    candidates,
                )
            )

            title_error = (
                validate_title(
                    psalm.number,
                    title_russian,
                )
            )

            if title_error:
                errors.append(
                    title_error
                )

                continue

            if show_titles:
                self.stdout.write(
                    self.style.WARNING(
                        f"{psalm.number}: "
                        f"{title_russian}"
                    )
                )

            # =============================================
            # СТИХИ
            # =============================================

            russian_verses = []

            valid = True

            for expected, item in zip(
                    expected_numbers,
                    russian_run["items"],
            ):
                if item["number"] != expected:
                    errors.append(
                        f"Псалом "
                        f"{psalm.number}: "
                        f"ожидался стих "
                        f"{expected}, "
                        f"получен "
                        f"{item['number']}."
                    )

                    valid = False
                    break

                russian_text = clean_piece(
                    item["text"]
                )

                if not russian_text:
                    errors.append(
                        f"Псалом "
                        f"{psalm.number}, "
                        f"стих "
                        f"{expected}: "
                        f"пустой русский текст."
                    )

                    valid = False
                    break

                if not contains_cyrillic(
                        russian_text
                ):
                    errors.append(
                        f"Псалом "
                        f"{psalm.number}, "
                        f"стих "
                        f"{expected}: "
                        f"некорректный текст."
                    )

                    valid = False
                    break

                russian_verses.append({
                    "number": expected,
                    "russian": russian_text,
                })

            if not valid:
                continue

            result[
                "psalms"
            ].append({
                "number":
                    psalm.number,
                "title_russian":
                    title_russian,
                "verses":
                    russian_verses,
            })

            total_verses += len(
                russian_verses
            )

            self.stdout.write(
                self.style.SUCCESS(
                    f"Псалом "
                    f"{psalm.number}: "
                    f"OK | "
                    f"стихов "
                    f"{len(russian_verses)}"
                )
            )

        # =================================================
        # ПРОВЕРКИ
        # =================================================

        if errors:
            self.stdout.write("")

            self.stdout.write(
                self.style.ERROR(
                    "Найдены ошибки:"
                )
            )

            for error in errors:
                self.stdout.write(
                    self.style.ERROR(
                        error
                    )
                )

            self.stdout.write("")

            raise CommandError(
                "Импорт отменён. "
                "База данных не изменена."
            )

        if len(
                result["psalms"]
        ) != 150:
            raise CommandError(
                f"Получено псалмов: "
                f"{len(result['psalms'])}, "
                f"ожидалось 150."
            )

        expected_db_verses = sum(
            psalm.verses.count()
            for psalm in psalms
        )

        if (
                total_verses
                != expected_db_verses
        ):
            raise CommandError(
                f"Количество стихов "
                f"не совпало. "
                f"В БД: "
                f"{expected_db_verses}, "
                f"в PDF: "
                f"{total_verses}."
            )

        # =================================================
        # JSON
        # =================================================

        json_output.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        json_output.write_text(
            json.dumps(
                result,
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

        self.stdout.write("")

        self.stdout.write(
            self.style.SUCCESS(
                "ПРОВЕРКА ПРОЙДЕНА."
            )
        )

        self.stdout.write(
            self.style.SUCCESS(
                "Псалмов: 150"
            )
        )

        self.stdout.write(
            self.style.SUCCESS(
                f"Стихов: "
                f"{total_verses}"
            )
        )

        self.stdout.write(
            self.style.SUCCESS(
                f"JSON: "
                f"{json_output}"
            )
        )

        if check_only:
            self.stdout.write(
                self.style.WARNING(
                    "Режим --check-only: "
                    "БД не изменена."
                )
            )

            return

        # =================================================
        # ЗАПИСЬ В БД
        # =================================================

        self.stdout.write("")

        if titles_only:
            self.stdout.write(
                "Исправляю только "
                "русские заголовки..."
            )
        else:
            self.stdout.write(
                "Записываю русский "
                "перевод в БД..."
            )

        psalm_by_number = {
            psalm.number: psalm
            for psalm in psalms
        }

        with transaction.atomic():
            updated_psalms = 0
            updated_verses = 0

            for psalm_data in result[
                "psalms"
            ]:
                psalm = psalm_by_number[
                    psalm_data[
                        "number"
                    ]
                ]

                # -----------------------------------------
                # Заголовок
                # -----------------------------------------

                psalm.title_russian = (
                    psalm_data[
                        "title_russian"
                    ]
                )

                psalm.save(
                    update_fields=[
                        "title_russian",
                    ]
                )

                updated_psalms += 1

                # -----------------------------------------
                # Если нужен только ремонт заголовков,
                # стихи вообще не трогаем.
                # -----------------------------------------

                if titles_only:
                    continue

                verse_by_number = {
                    verse.number: verse
                    for verse
                    in psalm.verses.all()
                }

                for verse_data in (
                        psalm_data[
                            "verses"
                        ]
                ):
                    verse = (
                        verse_by_number[
                            verse_data[
                                "number"
                            ]
                        ]
                    )

                    verse.russian = (
                        verse_data[
                            "russian"
                        ]
                    )

                    verse.save(
                        update_fields=[
                            "russian",
                        ]
                    )

                    updated_verses += 1

        self.stdout.write("")

        if titles_only:
            self.stdout.write(
                self.style.SUCCESS(
                    "РУССКИЕ ЗАГОЛОВКИ "
                    "УСПЕШНО ИСПРАВЛЕНЫ."
                )
            )

            self.stdout.write(
                self.style.SUCCESS(
                    f"Заголовков: "
                    f"{updated_psalms}"
                )
            )

        else:
            self.stdout.write(
                self.style.SUCCESS(
                    "РУССКИЙ ПЕРЕВОД "
                    "УСПЕШНО ИМПОРТИРОВАН."
                )
            )

            self.stdout.write(
                self.style.SUCCESS(
                    f"Псалмов: "
                    f"{updated_psalms}"
                )
            )

            self.stdout.write(
                self.style.SUCCESS(
                    f"Стихов: "
                    f"{updated_verses}"
                )
            )