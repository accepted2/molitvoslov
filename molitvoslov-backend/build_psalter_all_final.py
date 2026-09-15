import json
import re
import unicodedata
from pathlib import Path

from bs4 import BeautifulSoup


KATHISMA_RANGES = {
    1: list(range(1, 9)),
    2: list(range(9, 17)),
    3: list(range(17, 24)),
    4: list(range(24, 32)),
    5: list(range(32, 37)),
    6: list(range(37, 46)),
    7: list(range(46, 55)),
    8: list(range(55, 64)),
    9: list(range(64, 70)),
    10: list(range(70, 77)),
    11: list(range(77, 85)),
    12: list(range(85, 91)),
    13: list(range(91, 101)),
    14: list(range(101, 105)),
    15: list(range(105, 109)),
    16: list(range(109, 118)),
    17: [118],
    18: list(range(119, 134)),
    19: list(range(134, 143)),
    20: list(range(143, 151)),
}


LATIN_TO_CYRILLIC = str.maketrans({
    "A": "А",
    "B": "В",
    "C": "С",
    "E": "Е",
    "H": "Н",
    "K": "К",
    "M": "М",
    "O": "О",
    "P": "Р",
    "T": "Т",
    "X": "Х",

    "a": "а",
    "c": "с",
    "e": "е",
    "o": "о",
    "p": "р",
    "x": "х",
})


def normalize(text):
    text = text.replace("\xa0", " ")

    text = text.translate(LATIN_TO_CYRILLIC)

    text = re.sub(
        r"[ \t\r\n]+",
        " ",
        text,
    )

    text = re.sub(
        r"\s+([,.;:!?])",
        r"\1",
        text,
    )

    return text.strip()


def without_accents(text):
    return "".join(
        char
        for char in unicodedata.normalize("NFD", text)
        if unicodedata.category(char) != "Mn"
    )


def find_source():
    files_dir = Path("files")

    preferred = files_dir / "pravmir_psalter.html"

    if preferred.exists():
        return preferred

    candidates = []

    for path in files_dir.iterdir():
        if not path.is_file():
            continue

        name = path.name.lower()

        if (
                "2420" in name
                or "psalt" in name
                or "псалт" in name
                or "library_ebook" in name
        ):
            candidates.append(path)

    if not candidates:
        raise FileNotFoundError(
            "Не найден pravmir_psalter.html "
            "в папке files."
        )

    candidates.sort(
        key=lambda item: item.stat().st_size,
        reverse=True,
    )

    return candidates[0]


def get_part(soup, part_id):
    part = soup.find(
        "div",
        id=f"part_{part_id}",
    )

    if part is None:
        raise ValueError(
            f"Не найден HTML-блок part_{part_id}"
        )

    return part


def extract_section_text(
        part,
        exclude_last_heading=False,
):
    result = []

    for p in part.find_all("p"):
        text = normalize(
            p.get_text(
                " ",
                strip=True,
            )
        )

        if not text:
            continue

        if (
                exclude_last_heading
                and "ДАВИ" in without_accents(text).upper()
                and "ПРОРОКА" in without_accents(text).upper()
                and "ПЕСН" in without_accents(text).upper()
        ):
            continue

        result.append(text)

    return "\n\n".join(result)


def find_verse_matches(text):
    return list(
        re.finditer(
            r"(?<!\d)(\d{1,3})(?=\s|[А-ЯЁ])",
            text,
        )
    )


def parse_verses(text, psalm_number):
    text = normalize(text)

    matches = find_verse_matches(text)

    if not matches:
        raise ValueError(
            f"Псалом {psalm_number}: "
            "не найдены номера стихов."
        )

    verses = []

    for index, match in enumerate(matches):
        number = int(match.group(1))

        start = match.end()

        while (
                start < len(text)
                and text[start].isspace()
        ):
            start += 1

        if index + 1 < len(matches):
            end = matches[index + 1].start()
        else:
            end = len(text)

        verse_text = normalize(
            text[start:end]
        )

        if not verse_text:
            raise ValueError(
                f"Псалом {psalm_number}, "
                f"стих {number}: пуст."
            )

        verses.append({
            "number": number,
            "church_slavonic": verse_text,
            "russian": "",
        })

    numbers = [
        verse["number"]
        for verse in verses
    ]

    # Ошибка в исходном HTML Правмира.
    #
    # В Псалме 77 после стиха 13 идёт:
    #
    # 15 И наста́ви я́ о́блаком...
    # 15 Разве́рзе ка́мень...
    #
    # Первый "15" на самом деле является стихом 14.
    if psalm_number == 77:
        if (
                len(numbers) >= 15
                and numbers[12] == 13
                and numbers[13] == 15
                and numbers[14] == 15
        ):
            verses[13]["number"] = 14

            numbers = [
                verse["number"]
                for verse in verses
            ]

    if len(numbers) != len(set(numbers)):
        raise ValueError(
            f"Псалом {psalm_number}: "
            "повторяются номера стихов."
        )

    for previous, current in zip(
            numbers,
            numbers[1:],
    ):
        if current <= previous:
            raise ValueError(
                f"Псалом {psalm_number}: "
                f"неверная последовательность "
                f"{previous} -> {current}"
            )

    return verses


def get_last_verse_number(body):
    text = normalize(
        " ".join(body)
    )

    matches = find_verse_matches(text)

    if not matches:
        return None

    return int(
        matches[-1].group(1)
    )


def is_glory(text):
    plain = without_accents(
        text
    ).lower()

    return (
            plain.startswith("слава:")
            or plain.startswith("слава, и ныне:")
            or plain == "слава"
    )


def parse_kathisma(part, number):
    expected_psalms = KATHISMA_RANGES[number]

    psalms = []

    current_number = None
    current_title = None
    body = []

    glory_positions = []

    prayers_after = []
    reading_prayers_after = False

    def finish_psalm():
        nonlocal current_number
        nonlocal current_title
        nonlocal body

        if current_number is None:
            return

        if current_number not in expected_psalms:
            current_number = None
            current_title = None
            body = []
            return

        body_text = normalize(
            " ".join(body)
        )

        verses = parse_verses(
            body_text,
            current_number,
        )

        psalms.append({
            "number": current_number,
            "title_church_slavonic": normalize(
                current_title or ""
            ),
            "title_russian": "",
            "description": "",
            "verses": verses,
        })

        current_number = None
        current_title = None
        body = []

    for p in part.find_all("p"):
        text = normalize(
            p.get_text(
                " ",
                strip=True,
            )
        )

        if not text:
            continue

        plain = without_accents(
            text
        ).lower()

        if (
                plain.startswith("по ")
                and "кафисм" in plain
        ):
            finish_psalm()

            reading_prayers_after = True
            prayers_after.append(text)

            continue

        if reading_prayers_after:
            prayers_after.append(text)
            continue

        match = re.fullmatch(
            r"Псалом\s+(\d+)",
            without_accents(text),
            flags=re.IGNORECASE,
        )

        if match:
            finish_psalm()

            psalm_number = int(
                match.group(1)
            )

            if psalm_number not in expected_psalms:
                current_number = None
                current_title = None
                body = []
                continue

            current_number = psalm_number
            current_title = None
            body = []

            continue

        if current_number is None:
            continue

        if is_glory(text):
            last_verse = get_last_verse_number(
                body
            )

            glory_positions.append({
                "psalm": current_number,
                "verse": last_verse,
            })

            continue

        if current_title is None:
            current_title = text
            continue

        body.append(text)

    finish_psalm()

    psalms.sort(
        key=lambda item: item["number"]
    )

    actual_numbers = [
        psalm["number"]
        for psalm in psalms
    ]

    if actual_numbers != expected_psalms:
        raise ValueError(
            f"Кафизма {number}: "
            f"ожидались псалмы {expected_psalms}, "
            f"получены {actual_numbers}"
        )

    psalm_last_verse = {
        psalm["number"]: psalm["verses"][-1]["number"]
        for psalm in psalms
    }

    glories = []

    for index, position in enumerate(
            glory_positions,
            start=1,
    ):
        psalm_number = position["psalm"]
        verse_number = position["verse"]

        if verse_number is None:
            raise ValueError(
                f"Кафизма {number}, Слава {index}: "
                "не удалось определить позицию."
            )

        last_number = psalm_last_verse[
            psalm_number
        ]

        if verse_number < last_number:
            glories.append({
                "number": index,
                "after_psalm": None,
                "after_verse": {
                    "psalm": psalm_number,
                    "verse": verse_number,
                },
            })

        else:
            glories.append({
                "number": index,
                "after_psalm": psalm_number,
                "after_verse": None,
            })

    if len(glories) != 3:
        raise ValueError(
            f"Кафизма {number}: "
            f"должно быть 3 Славы, "
            f"найдено {len(glories)}."
        )

    return {
        "number": number,
        "title": f"Кафизма {number}",
        "prayers_after": "\n\n".join(
            prayers_after
        ),
        "psalms": psalms,
        "glories": glories,
    }


def validate_kathisma(kathisma):
    number = kathisma["number"]

    for psalm in kathisma["psalms"]:
        title = psalm[
            "title_church_slavonic"
        ]

        if re.search(
                r"[A-Za-zќ]",
                title,
        ):
            raise ValueError(
                f"Псалом {psalm['number']}: "
                "латинский символ в заголовке."
            )

        numbers = [
            verse["number"]
            for verse in psalm["verses"]
        ]

        if len(numbers) != len(set(numbers)):
            raise ValueError(
                f"Псалом {psalm['number']}: "
                "дубли номеров стихов."
            )

        for previous, current in zip(
                numbers,
                numbers[1:],
        ):
            if current <= previous:
                raise ValueError(
                    f"Псалом {psalm['number']}: "
                    f"неверная последовательность "
                    f"{previous} -> {current}"
                )

        for verse in psalm["verses"]:
            text = verse[
                "church_slavonic"
            ]

            if re.search(
                    r"[A-Za-zќ]",
                    text,
            ):
                raise ValueError(
                    f"Псалом {psalm['number']}:"
                    f"{verse['number']}: "
                    "обнаружен латинский символ."
                )

            if (
                    "Слава:" in text
                    or "Сла́ва:" in text
            ):
                raise ValueError(
                    f"Псалом {psalm['number']}:"
                    f"{verse['number']}: "
                    "'Слава' попала внутрь стиха."
                )

    if number == 17:
        psalm = kathisma[
            "psalms"
        ][0]

        if psalm["number"] != 118:
            raise ValueError(
                "17-я кафизма должна содержать "
                "только Псалом 118."
            )

        verses = {
            verse["number"]
            for verse in psalm["verses"]
        }

        expected = set(
            range(1, 177)
        )

        if verses != expected:
            missing = sorted(
                expected - verses
            )

            extra = sorted(
                verses - expected
            )

            raise ValueError(
                "Псалом 118 должен содержать "
                "стихи 1–176. "
                f"Отсутствуют: {missing}. "
                f"Лишние: {extra}."
            )

        expected_glories = [
            {
                "number": 1,
                "after_psalm": None,
                "after_verse": {
                    "psalm": 118,
                    "verse": 72,
                },
            },
            {
                "number": 2,
                "after_psalm": None,
                "after_verse": {
                    "psalm": 118,
                    "verse": 131,
                },
            },
            {
                "number": 3,
                "after_psalm": 118,
                "after_verse": None,
            },
        ]

        if kathisma["glories"] != expected_glories:
            raise ValueError(
                "Неверное расположение Слав "
                "в 17-й кафизме.\n"
                f"Получено: {kathisma['glories']}"
            )


def main():
    source = find_source()

    print(
        f"Источник: {source}"
    )

    html = source.read_text(
        encoding="utf-8",
        errors="ignore",
    )

    soup = BeautifulSoup(
        html,
        "html.parser",
    )

    # Правмир:
    #
    # part_43841 — молитвы перед Псалтирью
    # part_43842 — кафизма 1
    # ...
    # part_43861 — кафизма 20
    # part_43862 — молитвы после Псалтири

    prayers_before_part = get_part(
        soup,
        43841,
    )

    prayers_after_part = get_part(
        soup,
        43862,
    )

    prayers_before = extract_section_text(
        prayers_before_part,
        exclude_last_heading=True,
    )

    prayers_after = extract_section_text(
        prayers_after_part,
    )

    if not prayers_before:
        raise ValueError(
            "Молитвы перед чтением не найдены."
        )

    if not prayers_after:
        raise ValueError(
            "Молитвы после чтения не найдены."
        )

    output_dir = Path("files")

    output_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    total_psalms = 0
    total_verses = 0

    print()

    for number in range(1, 21):
        part_id = (
                43841 + number
        )

        part = get_part(
            soup,
            part_id,
        )

        kathisma = parse_kathisma(
            part,
            number,
        )

        validate_kathisma(
            kathisma
        )

        psalm_count = len(
            kathisma["psalms"]
        )

        verse_count = sum(
            len(psalm["verses"])
            for psalm in kathisma["psalms"]
        )

        total_psalms += psalm_count
        total_verses += verse_count

        data = {
            "psalter": {
                "name": "Псалтирь",
                "slug": "psaltir",
                "description": (
                    "Псалтирь на "
                    "церковнославянском языке "
                    "гражданским шрифтом "
                    "с ударениями."
                ),
                "prayers_before": prayers_before,
                "prayers_after": prayers_after,
                "is_visible": True,
            },

            "kathismas": [
                kathisma
            ],
        }

        output = (
                output_dir
                / f"psalter_kathisma_{number}_final.json"
        )

        output.write_text(
            json.dumps(
                data,
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

        glory_description = []

        for glory in kathisma[
            "glories"
        ]:
            if glory[
                "after_verse"
            ]:
                ref = glory[
                    "after_verse"
                ]

                glory_description.append(
                    f"{ref['psalm']}:{ref['verse']}"
                )

            else:
                glory_description.append(
                    str(
                        glory[
                            "after_psalm"
                        ]
                    )
                )

        print(
            f"Кафизма {number:2}: OK | "
            f"псалмов {psalm_count:2} | "
            f"стихов {verse_count:3} | "
            f"Славы: "
            f"{', '.join(glory_description)} | "
            f"молитва после: "
            f"{'ДА' if kathisma['prayers_after'] else 'НЕТ'}"
        )

    if total_psalms != 150:
        raise ValueError(
            f"Вместо 150 псалмов "
            f"получено {total_psalms}."
        )

    print()

    print(
        f"ИТОГО ПСАЛМОВ: {total_psalms}"
    )

    print(
        f"ИТОГО СТИХОВ: {total_verses}"
    )

    print(
        "Молитвы перед Псалтирью: ДА"
    )

    print(
        "Молитвы после Псалтири: ДА"
    )

    print()

    print(
        "ГОТОВО: созданы "
        "psalter_kathisma_1_final.json "
        "... "
        "psalter_kathisma_20_final.json"
    )


if __name__ == "__main__":
    main()