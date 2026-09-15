import json
import re
import unicodedata
from pathlib import Path

import requests


URL = (
    "https://raw.githubusercontent.com/"
    "slavonic/cu-md-sandbox/refs/heads/master/"
    "AugmentedPsalter1978/chapters/Cathisma_2.md"
)

OUT = Path("files/psalter_kathisma_2.json")

PSALM_NUMBERS = list(range(9, 17))

# В этом издании у Псалмов 9, 11 и 12 надписание
# само занимает стих №1, поэтому основной текст начинается с 2.
FIRST_VERSE = {
    9: 2,
    10: 1,
    11: 2,
    12: 2,
    13: 1,
    14: 1,
    15: 1,
    16: 1,
}

GLORIES_AFTER = {
    1: 10,
    2: 14,
    3: 16,
}

NUMERAL_VALUES = {
    "а": 1, "в": 2, "г": 3, "д": 4,
    "є": 5, "е": 5, "ѕ": 6, "з": 7,
    "и": 8, "ѳ": 9, "і": 10, "ї": 10,
    "к": 20, "л": 30, "м": 40, "н": 50,
    "ѯ": 60, "о": 70, "ѻ": 70, "п": 80,
    "ч": 90, "р": 100,
}

MARKER_RE = re.compile(r"(?<!\S)([^\s.]{1,12})\.\s*")


def strip_combining(text):
    text = unicodedata.normalize("NFD", text)
    return "".join(
        c for c in text
        if unicodedata.category(c) != "Mn"
    )


def parse_csl_number(token):
    token = strip_combining(token.lower())
    token = (
        token.replace("҃", "")
             .replace("҂", "")
             .replace("’", "")
             .replace("'", "")
    )

    total = 0
    found = False

    for ch in token:
        if ch not in NUMERAL_VALUES:
            return None
        total += NUMERAL_VALUES[ch]
        found = True

    return total if found else None


def clean(text):
    # Убираем редакционные альтернативы [[...]],
    # оставляя основной вариант перед ними.
    text = re.sub(r"\[\[.*?\]\]", "", text)
    text = text.replace("꙾", "")
    text = text.replace("=", "")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def extract_verses(segment, first_expected):
    """
    Ищет строго последовательные номера стихов:
    first_expected, first_expected+1, ...
    Все прочие числовые маркеры в надписании игнорируются.
    """
    matches = list(MARKER_RE.finditer(segment))

    accepted = []
    expected = first_expected

    for m in matches:
        number = parse_csl_number(m.group(1))
        if number == expected:
            accepted.append(m)
            expected += 1

    if not accepted:
        raise RuntimeError(
            f"Не найден первый ожидаемый стих {first_expected}"
        )

    title = clean(segment[:accepted[0].start()])

    verses = []

    for i, match in enumerate(accepted):
        start = match.end()
        end = (
            accepted[i + 1].start()
            if i + 1 < len(accepted)
            else len(segment)
        )

        text = clean(segment[start:end])

        # Слава относится к границе, не к тексту стиха.
        text = re.sub(
            r"\s*Сла́ва:\s*$",
            "",
            text,
        ).strip()

        # Всё после начала молитв после кафизмы
        # в последний псалом не включаем.
        text = re.split(
            r"\s*=*По\s+в҃-й\s+каѳі́смѣ",
            text,
            maxsplit=1,
        )[0].strip()

        verses.append({
            "number": parse_csl_number(match.group(1)),
            "church_slavonic": text,
            "russian": "",
        })

    return title, verses


def main():
    print("Скачиваю 2-ю кафизму...")

    response = requests.get(
        URL,
        timeout=60,
        headers={
            "User-Agent": "Molitvoslov-Kathisma2/1.0"
        },
    )
    response.raise_for_status()

    markdown = response.text

    # Один ### = начало одного псалма в этой конкретной кафизме.
    chunks = re.split(r"###\s*", markdown)

    psalm_chunks = [
        clean(chunk)
        for chunk in chunks[1:]
        if clean(chunk)
    ]

    # Последний chunk содержит после Псалма 16 ещё молитвы после кафизмы.
    # Это нормально; extract_verses отрежет их.
    if len(psalm_chunks) != 8:
        raise RuntimeError(
            f"Ожидалось 8 псалмов, найдено {len(psalm_chunks)}"
        )

    psalms = []

    for psalm_number, chunk in zip(
        PSALM_NUMBERS,
        psalm_chunks,
    ):
        title, verses = extract_verses(
            chunk,
            FIRST_VERSE[psalm_number],
        )

        if not verses:
            raise RuntimeError(
                f"Псалом {psalm_number}: нет стихов"
            )

        numbers = [v["number"] for v in verses]

        expected_numbers = list(
            range(numbers[0], numbers[-1] + 1)
        )

        if numbers != expected_numbers:
            raise RuntimeError(
                f"Псалом {psalm_number}: "
                f"пропуск/дубль стихов: {numbers}"
            )

        psalms.append({
            "number": psalm_number,
            "title_church_slavonic": title,
            "title_russian": "",
            "description": "",
            "verses": verses,
        })

        print(
            f"Псалом {psalm_number}: "
            f"{len(verses)} стихов, "
            f"{numbers[0]}–{numbers[-1]}"
        )

    data = {
        "psalter": {
            "name": "Псалтирь",
            "slug": "psaltir",
            "description": (
                "Церковнославянская Псалтирь в Unicode."
            ),
            "is_visible": True,
        },
        "kathismas": [
            {
                "number": 2,
                "title": "Каѳі́сма в҃",
                "psalms": psalms,
                "glories": [
                    {
                        "number": glory,
                        "after_psalm": psalm,
                        "after_verse": None,
                    }
                    for glory, psalm
                    in GLORIES_AFTER.items()
                ],
            }
        ],
    }

    OUT.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    OUT.write_text(
        json.dumps(
            data,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print()
    print("Готово:", OUT.resolve())


if __name__ == "__main__":
    main()
