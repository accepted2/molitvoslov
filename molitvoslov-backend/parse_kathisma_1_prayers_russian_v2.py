import argparse
import json
import re
import unicodedata
from pathlib import Path

from pypdf import PdfReader


KATHISMA_NUMBER = 1
NEXT_KATHISMA_NUMBER = 2
NEXT_PSALM_NUMBER = 9

# В разных источниках встречаются и "кафизма", и "кафисма".
START_PATTERNS = [
    re.compile(r"По\s+1\s*[–—-]?\s*[йя]\s+кафи[зс]ме\b", re.IGNORECASE),
    re.compile(r"После\s+1\s*[–—-]?\s*[йя]\s+кафи[зс]м[еы]\b", re.IGNORECASE),
    re.compile(r"После\s+кафи[зс]мы\s+1\b", re.IGNORECASE),
    re.compile(r"Молитв[аы]\s+после\s+1\s*[–—-]?\s*[йя]\s+кафи[зс]м[ыы]\b", re.IGNORECASE),
]

END_PATTERNS = [
    re.compile(r"По\s+2\s*[–—-]?\s*[йя]\s+кафи[зс]ме\b", re.IGNORECASE),
    re.compile(r"После\s+2\s*[–—-]?\s*[йя]\s+кафи[зс]м[еы]\b", re.IGNORECASE),
    re.compile(r"После\s+кафи[зс]мы\s+2\b", re.IGNORECASE),
    re.compile(r"(?m)^\s*Кафи[зс]ма\s+2\b", re.IGNORECASE),
    re.compile(rf"(?m)^\s*Псалом\s+{NEXT_PSALM_NUMBER}\b", re.IGNORECASE),
]

REQUIRED_MARKERS = [
    ("тропарь/тропари", re.compile(r"\bтропар", re.IGNORECASE)),
    ("Слава", re.compile(r"\bСлава\s*:", re.IGNORECASE)),
    ("И ныне", re.compile(r"\bИ\s+ныне\s*:", re.IGNORECASE)),
    ("Господи, помилуй", re.compile(r"Господи\s*,?\s*помилуй", re.IGNORECASE)),
]


def normalize_fragment(text: str) -> str:
    text = str(text or "")
    text = text.replace("\xa0", " ")
    text = text.replace("\u00ad", "")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def accent_count(text: str) -> int:
    count = 0
    for char in unicodedata.normalize("NFD", text or ""):
        if unicodedata.category(char) == "Mn":
            count += 1
    return count


def join_line_fragments(fragments):
    parts = []
    for _x, text in sorted(fragments, key=lambda item: item[0]):
        value = normalize_fragment(text)
        if value:
            parts.append(value)

    if not parts:
        return ""

    line = " ".join(parts)
    line = re.sub(r"\s+([,.;:!?])", r"\1", line)
    line = re.sub(r"\s{2,}", " ", line)
    return line.strip()


def extract_column_lines(page, side="right", split_ratio=0.50):
    """
    Достаёт одну геометрическую половину страницы.
    Ничего не пишет в БД и не меняет исходные файлы.
    """
    page_width = float(page.mediabox.width)
    split_x = page_width * split_ratio
    fragments = []

    def visitor_text(text, _cm, tm, _font_dict, _font_size):
        value = normalize_fragment(text)
        if not value:
            return

        try:
            x = float(tm[4])
            y = float(tm[5])
        except (TypeError, ValueError, IndexError):
            return

        if side == "right":
            if x < split_x:
                return
        else:
            if x >= split_x:
                return

        chunks = [chunk.strip() for chunk in value.split("\n") if chunk.strip()]
        for index, chunk in enumerate(chunks):
            fragments.append({
                "x": x,
                "y": y - index * 0.01,
                "text": chunk,
            })

    page.extract_text(visitor_text=visitor_text)

    fragments.sort(key=lambda item: (-item["y"], item["x"]))

    lines = []
    current_y = None
    current = []
    y_tolerance = 2.5

    for item in fragments:
        y = item["y"]

        if current_y is None or abs(y - current_y) <= y_tolerance:
            current.append((item["x"], item["text"]))
            current_y = y if current_y is None else (current_y + y) / 2
            continue

        line = join_line_fragments(current)
        if line:
            lines.append(line)

        current_y = y
        current = [(item["x"], item["text"])]

    line = join_line_fragments(current)
    if line:
        lines.append(line)

    return lines


def normalize_column_text(lines):
    text = "\n".join(lines)
    text = text.replace("\u00ad", "")

    # Перенос слова через дефис в PDF.
    text = re.sub(
        r"(?<=[А-Яа-яЁёA-Za-z])-+\s*\n\s*(?=[А-Яа-яЁёA-Za-z])",
        "",
        text,
    )

    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def find_start_match(text):
    matches = []
    for pattern in START_PATTERNS:
        m = pattern.search(text)
        if m:
            matches.append(m)

    if not matches:
        return None

    return min(matches, key=lambda m: m.start())


def find_end_match(text):
    matches = []
    for pattern in END_PATTERNS:
        m = pattern.search(text)
        if m:
            matches.append(m)

    if not matches:
        return None

    return min(matches, key=lambda m: m.start())


def clean_result(text):
    text = normalize_column_text(text.splitlines())

    # Только визуальные переносы перед рубриками; сам текст не переписываем.
    headings = [
        r"(?<!\n)(Тропар(?:ь|и)[^:\n]{0,45}:)",
        r"(?<!\n)(Слава\s*:)",
        r"(?<!\n)(И\s+ныне\s*:)",
        r"(?<!\n)(Господи\s*,?\s*помилуй[^:\n]{0,55}:)",
    ]

    for pattern in headings:
        text = re.sub(pattern, r"\n\1", text, flags=re.IGNORECASE)

    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def validate_result(text):
    errors = []

    if len(text) < 350:
        errors.append(f"Слишком короткий блок: {len(text)} символов.")

    for label, pattern in REQUIRED_MARKERS:
        if not pattern.search(text):
            errors.append(f"Не найден обязательный маркер: {label}.")

    if re.search(r"\bПсалом\s+9\b", text, flags=re.IGNORECASE):
        errors.append("В результат попал Псалом 9.")

    return errors


def page_side_text(page, side, split_ratio):
    return normalize_column_text(
        extract_column_lines(page, side=side, split_ratio=split_ratio)
    )


def full_page_text(page):
    return normalize_column_text((page.extract_text() or "").splitlines())


def locate_start(reader, split_ratio):
    """
    Ищем начало одновременно:
      1) в левой половине;
      2) в правой половине;
      3) во всём тексте страницы — только как диагностику.

    Если начало есть в обеих половинах, предпочтение отдаётся
    варианту с меньшим количеством ударений (обычно это русский).
    """
    diagnostics = []

    for page_index, page in enumerate(reader.pages):
        candidates = []

        for side in ("left", "right"):
            text = page_side_text(page, side, split_ratio)
            match = find_start_match(text)

            if match:
                tail = text[match.start():]
                candidates.append({
                    "side": side,
                    "text": text,
                    "match": match,
                    "accents": accent_count(tail[:1800]),
                })

        if candidates:
            candidates.sort(key=lambda item: (item["accents"], item["side"]))
            chosen = candidates[0]

            return {
                "page_index": page_index,
                "side": chosen["side"],
                "text": chosen["text"],
                "match": chosen["match"],
                "candidates": [
                    {
                        "side": c["side"],
                        "accents": c["accents"],
                    }
                    for c in candidates
                ],
            }

        # Диагностика полного текста страницы.
        full = full_page_text(page)
        if re.search(r"кафи[зс]м", full, flags=re.IGNORECASE):
            interesting = [
                line for line in full.splitlines()
                if re.search(r"кафи[зс]м", line, flags=re.IGNORECASE)
            ]
            if interesting:
                diagnostics.append({
                    "page": page_index + 1,
                    "lines": interesting[:20],
                })

    return {
        "page_index": None,
        "diagnostics": diagnostics,
    }


def parse_kathisma_1_prayers_russian(pdf_path, split_ratio=0.50, max_pages=6):
    reader = PdfReader(str(pdf_path))

    print(f"PDF: {pdf_path}")
    print(f"Страниц: {len(reader.pages)}")
    print("Ищу блок после 1-й кафизмы в ОБЕИХ половинах страницы...")

    located = locate_start(reader, split_ratio)

    if located["page_index"] is None:
        debug_path = pdf_path.parent / "kathisma_1_parser_debug_v2.json"
        debug_path.write_text(
            json.dumps(
                {
                    "message": "Старт не найден в левой/правой половине.",
                    "split_ratio": split_ratio,
                    "full_page_kathisma_lines": located.get("diagnostics", []),
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

        raise RuntimeError(
            "Не удалось найти начало блока после 1-й кафизмы.\n"
            f"Создан диагностический файл: {debug_path}\n"
            "Пришли его содержимое."
        )

    start_page = located["page_index"]
    side = located["side"]

    print(f"Страница: {start_page + 1}")
    print(f"Выбрана половина страницы: {side}")
    print(f"Кандидаты: {located.get('candidates', [])}")

    collected = []

    for page_index in range(
        start_page,
        min(len(reader.pages), start_page + max_pages),
    ):
        text = page_side_text(
            reader.pages[page_index],
            side=side,
            split_ratio=split_ratio,
        )
        collected.append(text)

    combined = "\n".join(collected)

    start_match = find_start_match(combined)
    if not start_match:
        raise RuntimeError("Старт был найден на странице, но потерян после объединения.")

    block = combined[start_match.start():]

    end_match = find_end_match(block)
    if end_match:
        block = block[:end_match.start()]
        end_found = True
    else:
        end_found = False

    block = clean_result(block)
    errors = validate_result(block)

    return {
        "kathisma": 1,
        "source": str(pdf_path),
        "pdf_start_page": start_page + 1,
        "selected_side": side,
        "split_ratio": split_ratio,
        "end_marker_found": end_found,
        "prayers_after_russian": block,
        "validation_errors": errors,
    }


def main():
    base_dir = Path(__file__).resolve().parent

    parser = argparse.ArgumentParser(
        description=(
            "Тестовый парсер ТОЛЬКО русского блока после 1-й кафизмы. "
            "БД не читает и не изменяет."
        )
    )

    parser.add_argument(
        "pdf_file",
        nargs="?",
        default=str(base_dir / "files" / "psaltir_azbyka.pdf"),
    )

    parser.add_argument(
        "--output",
        default=str(base_dir / "files" / "kathisma_1_prayers_russian_preview_v2.json"),
    )

    parser.add_argument(
        "--split",
        type=float,
        default=0.50,
        help="Граница между половинами страницы. По умолчанию 0.50.",
    )

    parser.add_argument(
        "--max-pages",
        type=int,
        default=6,
    )

    args = parser.parse_args()

    pdf_path = Path(args.pdf_file).resolve()
    output_path = Path(args.output).resolve()

    if not pdf_path.exists():
        raise SystemExit(f"PDF не найден: {pdf_path}")

    result = parse_kathisma_1_prayers_russian(
        pdf_path=pdf_path,
        split_ratio=args.split,
        max_pages=max(1, args.max_pages),
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(result, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print()
    print("=" * 72)
    print("ПРЕДПРОСМОТР. БД НЕ ИЗМЕНЯЛАСЬ.")
    print("=" * 72)
    print(result["prayers_after_russian"])
    print("=" * 72)
    print()
    print(f"JSON: {output_path}")
    print(f"Конечный маркер найден: {'ДА' if result['end_marker_found'] else 'НЕТ'}")

    if result["validation_errors"]:
        print("ПРОВЕРКА НЕ ПРОЙДЕНА:")
        for error in result["validation_errors"]:
            print(f"  - {error}")
        raise SystemExit(2)

    print("ПРОВЕРКА ПРОЙДЕНА.")
    print("Никакие данные БД и существующие JSON не изменялись.")


if __name__ == "__main__":
    main()
