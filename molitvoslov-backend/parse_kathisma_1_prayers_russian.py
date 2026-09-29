import argparse
import json
import re
from pathlib import Path

from pypdf import PdfReader


KATHISMA_NUMBER = 1
NEXT_PSALM_NUMBER = 9

START_PATTERNS = [
    re.compile(r"После\s+кафизмы\s*1\b", re.IGNORECASE),
    re.compile(r"После\s+1\s*[–—-]?\s*[йя]\s+кафизмы\b", re.IGNORECASE),
]

END_PATTERN = re.compile(
    rf"(?im)^\s*(?:Кафизма\s+2\b|Псалом\s+{NEXT_PSALM_NUMBER}\b)"
)

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


def join_line_fragments(fragments):
    """
    Склеивает куски текста, которые pypdf отдал для одной визуальной строки.
    """
    parts = []

    for _x, text in sorted(fragments, key=lambda item: item[0]):
        value = normalize_fragment(text)

        if value:
            parts.append(value)

    if not parts:
        return ""

    line = " ".join(parts)

    # Убираем случайные пробелы перед пунктуацией.
    line = re.sub(r"\s+([,.;:!?])", r"\1", line)
    line = re.sub(r"\s{2,}", " ", line)

    return line.strip()


def extract_column_lines(page, side="right", split_ratio=0.50):
    """
    Извлекает только одну половину страницы по координатам текста.

    В исходной Псалтири Азбуки:
      левая колонка  -> церковнославянский,
      правая колонка -> русский.

    БД здесь вообще не используется.
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

        # Иногда один callback содержит несколько строк.
        # Сохраняем их как отдельные фрагменты с небольшим сдвигом Y.
        chunks = [chunk.strip() for chunk in value.split("\n") if chunk.strip()]

        if not chunks:
            return

        for index, chunk in enumerate(chunks):
            fragments.append(
                {
                    "x": x,
                    "y": y - (index * 0.01),
                    "text": chunk,
                }
            )

    page.extract_text(visitor_text=visitor_text)

    if not fragments:
        return []

    # В PDF координата Y растёт снизу вверх.
    fragments.sort(key=lambda item: (-item["y"], item["x"]))

    lines = []
    current_y = None
    current = []
    y_tolerance = 2.5

    for item in fragments:
        y = item["y"]

        if current_y is None or abs(y - current_y) <= y_tolerance:
            current.append((item["x"], item["text"]))

            if current_y is None:
                current_y = y
            else:
                current_y = (current_y + y) / 2

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
    """
    Нормализует извлечённую правую колонку, но не пытается
    переписывать молитву или менять её смысл.
    """
    text = "\n".join(lines)
    text = text.replace("\u00ad", "")

    # Если слово было разорвано переносом в PDF:
    # "одиннадца-\nтого" -> "одиннадцатого"
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
    for pattern in START_PATTERNS:
        match = pattern.search(text)

        if match:
            return match

    return None


def clean_result(text):
    text = normalize_column_text(text.splitlines())

    # Сохраняем строки источника, но добавляем читаемые разрывы
    # перед основными служебными заголовками, если PDF их склеил.
    heading_patterns = [
        r"(?<!\n)(Тропар(?:ь|и)[^:\n]{0,40}:)",
        r"(?<!\n)(Слава\s*:)",
        r"(?<!\n)(И\s+ныне\s*:)",
        r"(?<!\n)(Господи\s*,?\s*помилуй[^:\n]{0,45}:)",
    ]

    for pattern in heading_patterns:
        text = re.sub(pattern, r"\n\1", text, flags=re.IGNORECASE)

    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def validate_result(text):
    errors = []

    if len(text) < 500:
        errors.append(f"Слишком короткий блок: {len(text)} символов.")

    for label, pattern in REQUIRED_MARKERS:
        if not pattern.search(text):
            errors.append(f"Не найден обязательный маркер: {label}.")

    if re.search(r"\bПсалом\s+9\b", text, flags=re.IGNORECASE):
        errors.append("В результат попал Псалом 9 — конец блока определён неверно.")

    return errors


def parse_kathisma_1_prayers_russian(pdf_path, split_ratio=0.50, max_pages=5):
    reader = PdfReader(str(pdf_path))

    start_page = None
    right_pages = {}

    print(f"PDF: {pdf_path}")
    print(f"Страниц: {len(reader.pages)}")
    print(f"Ищу русский заголовок молитв после {KATHISMA_NUMBER}-й кафизмы...")

    # Сначала находим страницу, где в ПРАВОЙ колонке есть русский заголовок.
    for page_index, page in enumerate(reader.pages):
        lines = extract_column_lines(
            page,
            side="right",
            split_ratio=split_ratio,
        )

        page_text = normalize_column_text(lines)
        right_pages[page_index] = page_text

        if find_start_match(page_text):
            start_page = page_index
            break

    if start_page is None:
        debug_path = pdf_path.parent / "kathisma_1_right_column_debug.txt"

        with debug_path.open("w", encoding="utf-8") as file:
            for page_index in range(len(reader.pages)):
                if page_index not in right_pages:
                    lines = extract_column_lines(
                        reader.pages[page_index],
                        side="right",
                        split_ratio=split_ratio,
                    )
                    right_pages[page_index] = normalize_column_text(lines)

                page_text = right_pages[page_index]

                if re.search(r"кафизм", page_text, flags=re.IGNORECASE):
                    file.write(f"\n===== PAGE {page_index + 1} =====\n")
                    file.write(page_text)
                    file.write("\n")

        raise RuntimeError(
            "Не найден русский заголовок «После кафизмы 1» в правой колонке.\n"
            f"Создан debug-файл: {debug_path}\n"
            "Пришли его содержимое — подстроим границу колонок, не затрагивая БД."
        )

    print(f"Начало найдено на странице PDF: {start_page + 1}")

    # Берём только несколько страниц от найденного места.
    # Для 1-й кафизмы конец обязан встретиться раньше Псалма 9 / Кафизмы 2.
    collected = []

    for page_index in range(
        start_page,
        min(len(reader.pages), start_page + max_pages),
    ):
        if page_index not in right_pages:
            lines = extract_column_lines(
                reader.pages[page_index],
                side="right",
                split_ratio=split_ratio,
            )
            right_pages[page_index] = normalize_column_text(lines)

        collected.append(right_pages[page_index])

    combined = "\n".join(collected)

    start_match = find_start_match(combined)

    if not start_match:
        raise RuntimeError("Внутренняя ошибка: после определения страницы стартовый маркер потерян.")

    block = combined[start_match.start() :]

    end_match = END_PATTERN.search(block)

    if end_match:
        block = block[: end_match.start()]
        print("Конец найден перед Кафизмой 2 / Псалмом 9.")
    else:
        print(
            "ВНИМАНИЕ: явный конец перед Кафизмой 2 / Псалмом 9 не найден "
            f"в пределах {max_pages} страниц."
        )

    block = clean_result(block)

    errors = validate_result(block)

    return {
        "kathisma": 1,
        "source": str(pdf_path),
        "pdf_start_page": start_page + 1,
        "split_ratio": split_ratio,
        "prayers_after_russian": block,
        "validation_errors": errors,
    }


def main():
    base_dir = Path(__file__).resolve().parent

    parser = argparse.ArgumentParser(
        description=(
            "ТЕСТОВЫЙ парсер только русского блока молитв после 1-й кафизмы. "
            "БД не читает и не изменяет."
        )
    )

    parser.add_argument(
        "pdf_file",
        nargs="?",
        default=str(base_dir / "files" / "psaltir_azbyka.pdf"),
        help="Путь к psaltir_azbyka.pdf",
    )

    parser.add_argument(
        "--output",
        default=str(base_dir / "files" / "kathisma_1_prayers_russian_preview.json"),
        help="Куда сохранить проверочный JSON",
    )

    parser.add_argument(
        "--split",
        type=float,
        default=0.50,
        help="Граница между левой и правой колонками PDF. По умолчанию 0.50.",
    )

    parser.add_argument(
        "--max-pages",
        type=int,
        default=5,
        help="Сколько страниц максимум читать после найденного начала.",
    )

    args = parser.parse_args()

    pdf_path = Path(args.pdf_file).resolve()
    output_path = Path(args.output).resolve()

    if not pdf_path.exists():
        raise SystemExit(f"PDF не найден: {pdf_path}")

    if not (0.35 <= args.split <= 0.70):
        raise SystemExit("--split должен быть примерно между 0.35 и 0.70")

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
    print("=" * 70)
    print("ПРЕДПРОСМОТР. БАЗА ДАННЫХ НЕ ИЗМЕНЯЛАСЬ.")
    print("=" * 70)
    print(result["prayers_after_russian"])
    print("=" * 70)

    print()
    print(f"JSON сохранён: {output_path}")

    if result["validation_errors"]:
        print()
        print("ПРОВЕРКА НЕ ПРОЙДЕНА:")

        for error in result["validation_errors"]:
            print(f"  - {error}")

        raise SystemExit(2)

    print()
    print("ПРОВЕРКА ПРОЙДЕНА:")
    print("  - найден русский блок после 1-й кафизмы")
    print("  - найден тропарь/тропари")
    print("  - найдены «Слава» и «И ныне»")
    print("  - найдено «Господи, помилуй»")
    print("  - Псалом 9 в результат не попал")
    print()
    print("Никакие модели Django, БД, псалмы и существующие JSON не изменялись.")


if __name__ == "__main__":
    main()
