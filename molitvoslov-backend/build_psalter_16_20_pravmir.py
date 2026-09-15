import json
import re
import unicodedata
from pathlib import Path

from bs4 import BeautifulSoup


KATHISMA_RANGES = {
    16: list(range(109, 118)),
    17: [118],
    18: list(range(119, 134)),
    19: list(range(134, 143)),
    20: list(range(143, 151)),
}

GLORIES = {
    16: [
        {"number": 1, "after_psalm": 111, "after_verse": None},
        {"number": 2, "after_psalm": 114, "after_verse": None},
        {"number": 3, "after_psalm": 117, "after_verse": None},
    ],
    17: [
        {
            "number": 1,
            "after_psalm": None,
            "after_verse": {"psalm": 118, "verse": 72},
        },
        {
            "number": 2,
            "after_psalm": None,
            "after_verse": {"psalm": 118, "verse": 131},
        },
        {
            "number": 3,
            "after_psalm": 118,
            "after_verse": None,
        },
    ],
    18: [
        {"number": 1, "after_psalm": 123, "after_verse": None},
        {"number": 2, "after_psalm": 128, "after_verse": None},
        {"number": 3, "after_psalm": 133, "after_verse": None},
    ],
    19: [
        {"number": 1, "after_psalm": 136, "after_verse": None},
        {"number": 2, "after_psalm": 139, "after_verse": None},
        {"number": 3, "after_psalm": 142, "after_verse": None},
    ],
    20: [
        {"number": 1, "after_psalm": 144, "after_verse": None},
        {"number": 2, "after_psalm": 147, "after_verse": None},
        {"number": 3, "after_psalm": 150, "after_verse": None},
    ],
}


# На Правмире местами встречаются латинские буквы,
# визуально неотличимые от кириллицы.
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

    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)

    return text.strip()


def without_accents(text):
    return "".join(
        ch for ch in unicodedata.normalize("NFD", text)
        if unicodedata.category(ch) != "Mn"
    )


def find_source_file():
    files_dir = Path("files")

    preferred = [
        files_dir / "pravmir_psalter.html",
        files_dir / "pravmir_psalter.html",
        files_dir / "pravmir_psalter.html.html",
        ]

    for path in preferred:
        if path.exists():
            return path

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
            "Не найден HTML Правмира.\n"
            "Положи скачанный файл в папку files."
        )

    # Полный HTML заметно больше карточки книги.
    candidates.sort(
        key=lambda p: p.stat().st_size,
        reverse=True,
    )

    return candidates[0]


def is_kathisma_heading(text):
    plain = without_accents(text).lower()
    return plain.startswith("кафисма")


def is_glory(text):
    plain = without_accents(text).lower().strip()

    return (
            plain.startswith("слава:")
            or plain.startswith("слава, и ныне:")
            or plain == "слава"
    )


def parse_verses(text, psalm_number):
    text = normalize(text)

    # В тексте Правмира номера стихов записаны:
    # 1 текст... 2 текст... 3 текст...
    matches = list(
        re.finditer(
            r"(?:(?<=^)|(?<=\s))(\d{1,3})\s+",
            text,
        )
    )

    if not matches:
        raise ValueError(
            f"Псалом {psalm_number}: "
            f"не удалось найти номера стихов."
        )

    verses = []

    for index, match in enumerate(matches):
        number = int(match.group(1))

        start = match.end()

        if index + 1 < len(matches):
            end = matches[index + 1].start()
        else:
            end = len(text)

        verse_text = normalize(text[start:end])

        if not verse_text:
            raise ValueError(
                f"Псалом {psalm_number}, стих {number}: пустой текст."
            )

        verses.append({
            "number": number,
            "church_slavonic": verse_text,
            "russian": "",
        })

    numbers = [v["number"] for v in verses]

    if len(numbers) != len(set(numbers)):
        raise ValueError(
            f"Псалом {psalm_number}: найдены повторяющиеся номера стихов."
        )

    for previous, current in zip(numbers, numbers[1:]):
        if current <= previous:
            raise ValueError(
                f"Псалом {psalm_number}: "
                f"нарушена нумерация стихов: {previous} -> {current}"
            )

    return verses


def find_kathisma_divs(soup):
    result = []

    for h2 in soup.find_all("h2"):
        title = normalize(h2.get_text(" ", strip=True))

        if not is_kathisma_heading(title):
            continue

        parent = h2.parent

        if parent:
            result.append(parent)

    if len(result) < 20:
        raise ValueError(
            f"Нашлось только {len(result)} кафизм вместо 20."
        )

    return result[:20]


def parse_kathisma(div, kathisma_number):
    expected_psalms = KATHISMA_RANGES[kathisma_number]

    paragraphs = div.find_all("p")

    psalms = []

    current_number = None
    current_title = None
    body_parts = []

    glory_points = []

    def finish_current():
        nonlocal current_number
        nonlocal current_title
        nonlocal body_parts

        if current_number is None:
            return

        # Псалом 151 в нашу Псалтирь не включаем.
        if current_number not in expected_psalms:
            current_number = None
            current_title = None
            body_parts = []
            return

        if current_title is None:
            raise ValueError(
                f"Псалом {current_number}: отсутствует надписание."
            )

        body = normalize(" ".join(body_parts))

        verses = parse_verses(
            body,
            current_number,
        )

        psalms.append({
            "number": current_number,
            "title_church_slavonic": normalize(current_title),
            "title_russian": "",
            "description": "",
            "verses": verses,
        })

        current_number = None
        current_title = None
        body_parts = []

    for p in paragraphs:
        text = normalize(
            p.get_text(" ", strip=True)
        )

        if not text:
            continue

        psalm_match = re.fullmatch(
            r"Псалом\s+(\d+)",
            without_accents(text),
            flags=re.IGNORECASE,
        )

        if psalm_match:
            finish_current()

            number = int(psalm_match.group(1))

            # После 150-го Правмир содержит внечисловой Псалом 151.
            if kathisma_number == 20 and number == 151:
                break

            current_number = number
            current_title = None
            body_parts = []
            continue

        # Текст после окончания кафизмы нам не нужен.
        plain = without_accents(text).lower()

        if plain.startswith("по ") and "кафисм" in plain:
            finish_current()
            break

        if current_number is None:
            continue

        if is_glory(text):
            # Запоминаем, после какого места источник поставил Славу.
            accumulated = normalize(" ".join(body_parts))

            if accumulated:
                try:
                    parsed = parse_verses(
                        accumulated,
                        current_number,
                    )

                    if parsed:
                        glory_points.append(
                            (
                                current_number,
                                parsed[-1]["number"],
                            )
                        )
                except ValueError:
                    pass

            continue

        # Первый p после "Псалом N" — надписание.
        if current_title is None:
            current_title = text
            continue

        body_parts.append(text)

    finish_current()

    psalms.sort(
        key=lambda p: p["number"]
    )

    got = [p["number"] for p in psalms]

    if got != expected_psalms:
        raise ValueError(
            f"Кафизма {kathisma_number}: "
            f"ожидались псалмы {expected_psalms}, "
            f"получены {got}."
        )

    return psalms, glory_points


def validate(kathisma_number, psalms):
    expected = KATHISMA_RANGES[
        kathisma_number
    ]

    numbers = [
        psalm["number"]
        for psalm in psalms
    ]

    if numbers != expected:
        raise ValueError(
            f"Кафизма {kathisma_number}: "
            "неверный диапазон псалмов."
        )

    for psalm in psalms:
        if not psalm["verses"]:
            raise ValueError(
                f"Псалом {psalm['number']} пуст."
            )

        for verse in psalm["verses"]:
            text = verse[
                "church_slavonic"
            ]

            if "Слава:" in text:
                raise ValueError(
                    f"Псалом {psalm['number']}:"
                    f"{verse['number']} содержит 'Слава:'."
                )

            latin = re.findall(
                r"[A-Za-z]",
                text,
            )

            if latin:
                raise ValueError(
                    f"Псалом {psalm['number']}:"
                    f"{verse['number']} содержит "
                    f"латинские символы: {latin}"
                )

    if kathisma_number == 17:
        psalm118 = psalms[0]

        verse_numbers = {
            verse["number"]
            for verse in psalm118["verses"]
        }

        if 72 not in verse_numbers:
            raise ValueError(
                "Псалом 118: нет стиха 72."
            )

        if 131 not in verse_numbers:
            raise ValueError(
                "Псалом 118: нет стиха 131."
            )

        # В полном 118-м псалме должно быть 176 стихов.
        if 176 not in verse_numbers:
            raise ValueError(
                "Псалом 118: не найден последний, 176-й стих."
            )


def main():
    source = find_source_file()

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

    kathisma_divs = find_kathisma_divs(
        soup
    )

    out_dir = Path("files")
    out_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    for kathisma_number in range(
            16,
            21,
    ):
        div = kathisma_divs[
            kathisma_number - 1
            ]

        psalms, source_glories = parse_kathisma(
            div,
            kathisma_number,
        )

        validate(
            kathisma_number,
            psalms,
        )

        data = {
            "psalter": {
                "name": "Псалтирь",
                "slug": "psaltir",
                "description": (
                    "Псалтирь на церковнославянском языке "
                    "гражданским шрифтом с ударениями."
                ),
                "is_visible": True,
            },
            "kathismas": [
                {
                    "number": kathisma_number,
                    "title": f"Кафизма {kathisma_number}",
                    "psalms": psalms,
                    "glories": GLORIES[
                        kathisma_number
                    ],
                }
            ],
        }

        output = (
                out_dir
                / f"psalter_kathisma_{kathisma_number}.json"
        )

        output.write_text(
            json.dumps(
                data,
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

        verse_count = sum(
            len(psalm["verses"])
            for psalm in psalms
        )

        print(
            f"Кафизма {kathisma_number}: OK | "
            f"псалмов: {len(psalms)} | "
            f"стихов: {verse_count}"
        )

        if source_glories:
            print(
                "  Славы в HTML:",
                source_glories,
            )

        print(
            f"  -> {output}"
        )

    print()
    print(
        "ГОТОВО: кафизмы 16–20 созданы."
    )


if __name__ == "__main__":
    main()