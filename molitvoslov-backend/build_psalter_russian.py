import json
import re
from pathlib import Path

import requests
from bs4 import BeautifulSoup


BASE_URL = "https://psalmi.ru/book.php"


def normalize(text):
    text = text.replace("\xa0", " ")

    text = re.sub(
        r"[ \t\r\n]+",
        " ",
        text,
    )

    return text.strip()


def fetch_psalm(number):
    response = requests.get(
        BASE_URL,
        params={
            "chapterbook": number,
            "idbook": 25,
        },
        timeout=30,
        headers={
            "User-Agent": (
                "Mozilla/5.0 "
                "(Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 "
                "Chrome/120 Safari/537.36"
            )
        },
    )

    response.raise_for_status()

    return response.text


def extract_psalm(number):
    html = fetch_psalm(number)

    soup = BeautifulSoup(
        html,
        "html.parser",
    )

    text = soup.get_text(
        "\n",
        strip=True,
    )

    lines = [
        normalize(line)
        for line in text.splitlines()
        if normalize(line)
    ]

    #
    # Ищем начало нужного Псалма.
    #
    start_index = None

    for index, line in enumerate(lines):
        if line == f"Пс. {number}":
            start_index = index
            break

    if start_index is None:
        #
        # На некоторых страницах может не быть "Пс. N".
        # Тогда начинаем с первого разумного места.
        #
        start_index = 0

    lines = lines[start_index:]

    title_russian = ""
    verses = []

    current_number = None
    current_russian = None

    #
    # На странице для каждого стиха обычно идут:
    #
    # N
    # русский синодальный
    # церковнославянский гражданский
    # церковнославянский старым шрифтом
    #
    # Нас интересует первая строка после номера.
    #

    for index, line in enumerate(lines):
        match = re.fullmatch(
            r"(\d{1,3})(?:\s+.*)?",
            line,
        )

        if not match:
            continue

        verse_number = int(
            match.group(1)
        )

        #
        # 0 используется для надписания псалма.
        #
        if verse_number == 0:
            if index + 1 < len(lines):
                title_russian = normalize(
                    lines[index + 1]
                )
            continue

        #
        # Нас интересуют только реальные стихи.
        #
        if not (
                1 <= verse_number <= 176
        ):
            continue

        #
        # Следующая непустая строка должна быть
        # русским синодальным текстом.
        #
        if index + 1 >= len(lines):
            continue

        russian = normalize(
            lines[index + 1]
        )

        #
        # Фильтруем очевидные элементы интерфейса.
        #
        if russian in {
            "Image",
            "Слушать стих",
            "УЧИТЬ",
            "СКРЫТЬ СТИХИ",
        }:
            continue

        verses.append({
            "number": verse_number,
            "russian": russian,
        })

    #
    # Удаляем возможные дубли.
    #
    unique = {}

    for verse in verses:
        number = verse["number"]

        if number not in unique:
            unique[number] = verse

    verses = [
        unique[number]
        for number in sorted(unique)
    ]

    if not verses:
        raise ValueError(
            f"Псалом {number}: "
            "не удалось извлечь русский текст."
        )

    return {
        "number": number,
        "title_russian": title_russian,
        "verses": verses,
    }


def validate_test_psalm(
        psalm,
        expected_count=None,
):
    numbers = [
        verse["number"]
        for verse in psalm["verses"]
    ]

    if len(numbers) != len(set(numbers)):
        raise ValueError(
            f"Псалом {psalm['number']}: "
            "дубли стихов."
        )

    if expected_count is not None:
        if len(numbers) != expected_count:
            raise ValueError(
                f"Псалом {psalm['number']}: "
                f"ожидалось {expected_count} стихов, "
                f"получено {len(numbers)}."
            )


def main():
    tests = {
        1: 6,
        3: 8,
        118: 176,
    }

    result = {
        "psalms": []
    }

    for number, expected_count in tests.items():
        print(
            f"Загружаю Псалом {number}..."
        )

        psalm = extract_psalm(
            number
        )

        validate_test_psalm(
            psalm,
            expected_count,
        )

        result["psalms"].append(
            psalm
        )

        print(
            f"Псалом {number}: OK | "
            f"стихов {len(psalm['verses'])} | "
            f"title: {psalm['title_russian']!r}"
        )

    output = Path(
        "files/psalter_russian_test.json"
    )

    output.write_text(
        json.dumps(
            result,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print()
    print(
        f"Создан тестовый файл: {output}"
    )


if __name__ == "__main__":
    main()