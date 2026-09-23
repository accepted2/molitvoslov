import argparse
import json
import re
import zipfile
from collections import Counter
from pathlib import Path

from bs4 import BeautifulSoup, Tag


HTML_SUFFIXES = (
    ".html",
    ".xhtml",
    ".htm",
)

HEADING_TAGS = {
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
}


def clean_text(value):
    value = value or ""

    value = value.replace(
        "\xa0",
        " ",
    )

    value = re.sub(
        r"[ \t]+",
        " ",
        value,
    )

    value = re.sub(
        r"\n\s*\n+",
        "\n",
        value,
    )

    return value.strip()


def normalize(value):
    value = clean_text(
        value
    ).lower()

    value = value.replace(
        "ё",
        "е",
    )

    value = re.sub(
        r"[^а-яa-z0-9]+",
        " ",
        value,
        flags=re.IGNORECASE,
    )

    return re.sub(
        r"\s+",
        " ",
        value,
    ).strip()


def html_score(
        name,
        html,
):
    normalized = normalize(
        html
    )

    score = 0

    if "песнь 1" in normalized:
        score += 8

    if "песнь 3" in normalized:
        score += 6

    if "ирмос" in normalized:
        score += 5

    if "припев" in normalized:
        score += 3

    if "кондак" in normalized:
        score += 2

    if "икос" in normalized:
        score += 2

    if Path(
            name
    ).name.lower() == "book.html":
        score += 10

    return score


def read_html_files(
        epub_path,
):
    with zipfile.ZipFile(
            epub_path,
            "r",
    ) as archive:
        html_files = []

        for name in archive.namelist():
            if not name.lower().endswith(
                    HTML_SUFFIXES
            ):
                continue

            try:
                raw = archive.read(
                    name
                )
            except KeyError:
                continue

            text = raw.decode(
                "utf-8-sig",
                errors="replace",
            )

            html_files.append(
                {
                    "name": name,
                    "size": len(raw),
                    "score": html_score(
                        name,
                        text,
                    ),
                    "html": text,
                }
            )

        return html_files


def class_list(tag):
    classes = tag.get(
        "class",
        [],
    )

    if isinstance(
            classes,
            str,
    ):
        classes = classes.split()

    return sorted(
        str(value)
        for value
        in classes
    )


def summarize_html(
        item,
):
    soup = BeautifulSoup(
        item["html"],
        "html.parser",
    )

    headings = []

    for tag in soup.find_all(
            list(
                HEADING_TAGS
            )
    ):
        if not isinstance(
                tag,
                Tag,
        ):
            continue

        value = clean_text(
            tag.get_text(
                " ",
                strip=True,
            )
        )

        if not value:
            continue

        headings.append(
            {
                "tag":
                    tag.name,

                "classes":
                    class_list(
                        tag
                    ),

                "text":
                    value,
            }
        )

    class_counter = Counter()

    for tag in soup.find_all(
            True
    ):
        for class_name in class_list(
                tag
        ):
            class_counter[
                class_name
            ] += 1

    blocks = []

    for tag in soup.find_all(
            (
                "p",
                "div",
                "blockquote",
                "li",
            )
    ):
        value = clean_text(
            tag.get_text(
                " ",
                strip=True,
            )
        )

        if not value:
            continue

        classes = class_list(
            tag
        )

        normalized = normalize(
            value
        )

        interesting = (
            bool(classes)
            or normalized.startswith(
                "ирмос"
            )
            or normalized.startswith(
                "припев"
            )
            or normalized.startswith(
                "запев"
            )
            or normalized.startswith(
                "богородичен"
            )
            or normalized.startswith(
                "слава"
            )
            or normalized.startswith(
                "и ныне"
            )
        )

        if not interesting:
            continue

        blocks.append(
            {
                "tag":
                    tag.name,

                "classes":
                    classes,

                "text":
                    value[:500],
            }
        )

        if len(
                blocks
        ) >= 120:
            break

    return {
        "name":
            item["name"],

        "size":
            item["size"],

        "score":
            item["score"],

        "title":
            clean_text(
                soup.title.get_text(
                    " ",
                    strip=True,
                )
            )
            if soup.title
            else "",

        "headings":
            headings[:120],

        "classes":
            [
                {
                    "class":
                        name,

                    "count":
                        count,
                }
                for (
                    name,
                    count
                )
                in class_counter
                .most_common(
                    50
                )
            ],

        "interesting_blocks":
            blocks,
    }


def inspect_epub(
        epub_path,
):
    html_files = read_html_files(
        epub_path
    )

    html_files.sort(
        key=lambda item: (
            item["score"],
            item["size"],
        ),
        reverse=True,
    )

    summarized = [
        summarize_html(
            item
        )
        for item
        in html_files[:8]
    ]

    return {
        "epub":
            str(
                epub_path
            ).replace(
                "\\",
                "/",
            ),

        "html_file_count":
            len(
                html_files
            ),

        "best_html":
            (
                summarized[0][
                    "name"
                ]
                if summarized
                else None
            ),

        "html_files":
            summarized,
    }


def iter_epubs(
        target,
):
    target = Path(
        target
    )

    if target.is_file():
        return [
            target
        ]

    if target.is_dir():
        return sorted(
            target.glob(
                "*.epub"
            )
        )

    return []


def main():
    parser = argparse.ArgumentParser(
        description=(
            "Исследует внутреннюю HTML-разметку "
            "EPUB-канонов и сохраняет JSON-отчёты."
        )
    )

    parser.add_argument(
        "--path",
        default="files/canons",
        help=(
            "EPUB-файл или папка с EPUB. "
            "По умолчанию files/canons."
        ),
    )

    parser.add_argument(
        "--count",
        type=int,
        default=5,
        help=(
            "Сколько EPUB проверить. "
            "0 = все."
        ),
    )

    parser.add_argument(
        "--output-dir",
        default="files/canons/structure_samples",
        help=(
            "Папка для JSON-отчётов."
        ),
    )

    args = parser.parse_args()

    epubs = iter_epubs(
        args.path
    )

    if args.count > 0:
        epubs = epubs[
            :args.count
        ]

    if not epubs:
        print(
            "EPUB-файлы не найдены."
        )
        return

    output_dir = Path(
        args.output_dir
    )

    output_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    index = []

    for epub_path in epubs:
        print(
            f"Проверяю: "
            f"{epub_path.name}"
        )

        try:
            report = inspect_epub(
                epub_path
            )
        except zipfile.BadZipFile:
            print(
                "  Ошибка: некорректный EPUB/ZIP."
            )
            continue

        output_path = (
            output_dir /
            (
                epub_path.stem +
                ".json"
            )
        )

        output_path.write_text(
            json.dumps(
                report,
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

        index.append(
            {
                "epub":
                    report["epub"],

                "report":
                    str(
                        output_path
                    ).replace(
                        "\\",
                        "/",
                    ),

                "best_html":
                    report[
                        "best_html"
                    ],

                "html_file_count":
                    report[
                        "html_file_count"
                    ],
            }
        )

        print(
            f"  HTML-файлов: "
            f"{report['html_file_count']}"
        )

        print(
            f"  Главный кандидат: "
            f"{report['best_html']}"
        )

        print(
            f"  Отчёт: "
            f"{output_path}"
        )

    index_path = (
        output_dir /
        "index.json"
    )

    index_path.write_text(
        json.dumps(
            index,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print()
    print("=" * 60)
    print(
        f"Готово. Отчётов: "
        f"{len(index)}"
    )
    print(
        f"Индекс: "
        f"{index_path}"
    )
    print("=" * 60)


if __name__ == "__main__":
    main()
