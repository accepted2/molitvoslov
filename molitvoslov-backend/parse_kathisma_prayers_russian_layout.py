import argparse
import json
import re
import unicodedata
from collections import Counter
from pathlib import Path

from pypdf import PdfReader


# =========================================================
# НОРМАЛИЗАЦИЯ
# =========================================================

def strip_marks(text: str) -> str:
    return "".join(
        ch
        for ch in unicodedata.normalize("NFD", str(text or ""))
        if unicodedata.category(ch) != "Mn"
    )


def normalize_search(text: str) -> str:
    text = strip_marks(text)
    text = text.replace("\xa0", " ").replace("\u00ad", "")
    text = text.replace("–", "-").replace("—", "-")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def accent_count(text: str) -> int:
    return sum(
        1
        for ch in unicodedata.normalize("NFD", str(text or ""))
        if unicodedata.category(ch) == "Mn"
    )


def cyrillic_count(text: str) -> int:
    return len(re.findall(r"[А-Яа-яЁё]", str(text or "")))


def accent_density(text: str) -> float:
    letters = max(1, cyrillic_count(text))
    return accent_count(text) / letters


# =========================================================
# РЕГУЛЯРКИ РАЗДЕЛОВ
# =========================================================

def after_kathisma_re(number: int):
    n = re.escape(str(number))
    return re.compile(
        rf"(?:"
        rf"после\s+кафи[зс]мы\s+{n}\b"
        rf"|по\s+{n}\s*[-–—]?\s*(?:й|я)\s+кафи[зс]ме\b"
        rf"|после\s+{n}\s*[-–—]?\s*(?:й|я)\s+кафи[зс]м[еы]\b"
        rf")",
        re.IGNORECASE,
    )


def next_kathisma_re(number: int):
    n = re.escape(str(number))
    return re.compile(
        rf"(?:"
        rf"\bкафи[зс]ма\s+{n}(?:\s*[-–—]?\s*я)?\b"
        rf"|\b{n}\s*[-–—]?\s*я\s+кафи[зс]ма\b"
        rf")",
        re.IGNORECASE,
    )


TROPAR_RE = re.compile(
    r"(?:и\s+)?(?:таже\s+)?"
    r"тропар(?:ь|и)"
    r"(?:\s+сия|\s+покаянн(?:ый|ые|ыя))?"
    r"[^:\n]{0,70}глас[^:\n]{0,30}:",
    re.IGNORECASE,
)

PRAYER_RE = re.compile(
    r"господи\s*,?\s*помилуй\s*"
    r"\(?\s*40\s*\)?"
    r"[^:\n]{0,100}"
    r"молитв[^:\n]{0,40}:",
    re.IGNORECASE,
)

TAIL_20_RES = [
    re.compile(r"\bпсалом\s+151\b", re.IGNORECASE),
    re.compile(r"молитв[аы].{0,50}после.{0,30}псалтир", re.IGNORECASE),
    re.compile(r"молитв[аы].{0,50}по.{0,30}псалтир", re.IGNORECASE),
]


# =========================================================
# LAYOUT-ИЗВЛЕЧЕНИЕ
# =========================================================

def extract_layout(page) -> str:
    """
    Ключевое отличие от прошлых версий:
    pypdf сам восстанавливает визуальную раскладку страницы.
    Мы НЕ используем visitor_text/Y-координаты.
    """
    try:
        text = page.extract_text(
            extraction_mode="layout",
            layout_mode_space_vertically=False,
        )
    except TypeError:
        # Запасной вариант на случай другой минорной версии pypdf.
        text = page.extract_text(extraction_mode="layout")

    return (text or "").replace("\r\n", "\n").replace("\r", "\n")


def detect_split_column(lines):
    """
    Ищет вертикальный пробел между двумя колонками.

    В layout-тексте pypdf этот пробел представлен серией обычных пробелов.
    Берём центры длинных пробелов только на строках, где текст есть
    с обеих сторон, затем выбираем наиболее частую область.
    """
    useful = [line.rstrip("\n") for line in lines if line.strip()]

    if not useful:
        return None

    widths = sorted(len(line) for line in useful)
    typical_width = widths[len(widths) // 2]

    centers = []

    for line in useful:
        # Нужен именно большой межколоночный пробел.
        for match in re.finditer(r" {6,}", line):
            left = line[:match.start()].strip()
            right = line[match.end():].strip()

            if cyrillic_count(left) < 4 or cyrillic_count(right) < 4:
                continue

            center = (match.start() + match.end()) // 2

            # Отбрасываем поля и случайные пробелы совсем у краёв.
            if typical_width > 0:
                ratio = center / typical_width
                if not 0.25 <= ratio <= 0.75:
                    continue

            centers.append(center)

    if centers:
        # Группируем близкие центры в бакеты по 2 символа.
        bucketed = Counter(round(center / 2) * 2 for center in centers)
        split = bucketed.most_common(1)[0][0]
        return int(split)

    # Fallback: ищем "долину" занятости около центра страницы.
    max_width = max(len(line) for line in useful)

    if max_width < 20:
        return max_width // 2

    occupancy = [0] * max_width

    for line in useful:
        padded = line.ljust(max_width)
        for index, char in enumerate(padded):
            if not char.isspace():
                occupancy[index] += 1

    lo = int(max_width * 0.30)
    hi = int(max_width * 0.70)

    if hi <= lo:
        return max_width // 2

    min_occ = min(occupancy[lo:hi])
    candidates = [
        index
        for index in range(lo, hi)
        if occupancy[index] == min_occ
    ]

    return int(sum(candidates) / len(candidates)) if candidates else max_width // 2


def split_line(line: str, split_col: int):
    if split_col is None:
        return line, ""

    left = line[:split_col].rstrip()
    right = line[split_col:].strip()

    return left, right


def build_rows(reader):
    rows = []
    page_meta = []

    for page_index, page in enumerate(reader.pages):
        layout = extract_layout(page)
        lines = layout.splitlines()
        split_col = detect_split_column(lines)

        meta = {
            "page": page_index + 1,
            "split_col": split_col,
            "line_count": len(lines),
        }
        page_meta.append(meta)

        for line_index, full in enumerate(lines):
            left, right = split_line(full, split_col)

            rows.append(
                {
                    "page_index": page_index,
                    "page": page_index + 1,
                    "line_index": line_index,
                    "full": full.rstrip(),
                    "left": left,
                    "right": right,
                    "plain_full": normalize_search(full),
                }
            )

    return rows, page_meta


# =========================================================
# ПОИСК РЯДОВ
# =========================================================

def find_row_index(rows, regex, start=0):
    for index in range(start, len(rows)):
        if regex.search(rows[index]["plain_full"]):
            return index
    return None


def find_end_index(rows, number, start):
    if number < 20:
        return find_row_index(
            rows,
            next_kathisma_re(number + 1),
            start=start,
        )

    for index in range(start, len(rows)):
        plain = rows[index]["plain_full"]

        if any(regex.search(plain) for regex in TAIL_20_RES):
            return index

    return len(rows)


def row_matches(regex, row):
    return regex.search(row["plain_full"])


def find_marker_index(rows, regex, start, end):
    for index in range(start, end):
        if row_matches(regex, rows[index]):
            return index
    return None


# =========================================================
# ЯЗЫКОВАЯ КОЛОНКА
# =========================================================

def column_text(rows, side, start, end):
    return "\n".join(
        rows[index][side]
        for index in range(start, end)
        if rows[index][side].strip()
    )


def choose_russian_side(rows, start, end):
    left_text = column_text(rows, "left", start, end)
    right_text = column_text(rows, "right", start, end)

    left_letters = cyrillic_count(left_text)
    right_letters = cyrillic_count(right_text)

    left_score = accent_density(left_text)
    right_score = accent_density(right_text)

    # Пустая колонка не может "выиграть" нулевым accent_density.
    candidates = []

    if left_letters >= 80:
        candidates.append(("left", left_score, left_letters))

    if right_letters >= 80:
        candidates.append(("right", right_score, right_letters))

    if not candidates:
        return {
            "side": None,
            "left_score": left_score,
            "right_score": right_score,
            "left_letters": left_letters,
            "right_letters": right_letters,
        }

    candidates.sort(key=lambda item: (item[1], -item[2]))
    side = candidates[0][0]

    return {
        "side": side,
        "left_score": left_score,
        "right_score": right_score,
        "left_letters": left_letters,
        "right_letters": right_letters,
    }


# =========================================================
# ИЗВЛЕЧЕНИЕ ТЕКСТА ИЗ РЯДОВ
# =========================================================

def clean_extracted_lines(values):
    cleaned = []

    for value in values:
        value = value.replace("\u00ad", "").strip()

        if not value:
            continue

        # Одиночные номера стихов/страниц нам не нужны.
        if re.fullmatch(r"\d{1,3}", value):
            continue

        cleaned.append(value)

    text = "\n".join(cleaned)

    # Склеивание слова, разорванного PDF через дефис.
    text = re.sub(
        r"(?<=[А-Яа-яЁёA-Za-z])-+\s*\n\s*(?=[А-Яа-яЁёA-Za-z])",
        "",
        text,
    )

    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


def remove_heading_from_value(value, regex):
    plain = normalize_search(value)
    match = regex.search(plain)

    if not match:
        return value.strip()

    # Индексы normalised-текста могут немного отличаться из-за диакритики.
    # Поэтому если рубрика занимает почти всю строку — просто удаляем строку.
    if len(plain) <= match.end() + 8:
        return ""

    # Если после двоеточия есть содержимое, берём хвост по ':' оригинала.
    colon = value.find(":")

    if colon >= 0 and colon + 1 < len(value):
        return value[colon + 1:].strip()

    return ""


def extract_side_segment(rows, side, start, end, heading_regex=None):
    values = []

    for index in range(start, end):
        value = rows[index][side].strip()

        if not value:
            continue

        if index == start and heading_regex is not None:
            value = remove_heading_from_value(value, heading_regex)

        if value:
            values.append(value)

    return clean_extracted_lines(values)


# =========================================================
# ЭТАЛОННАЯ СТРУКТУРА ИЗ СУЩЕСТВУЮЩЕГО JSON
# =========================================================

def load_structure(files_dir: Path, number: int):
    path = files_dir / f"psalter_kathisma_{number}_final.json"

    if not path.exists():
        raise RuntimeError(f"Не найден {path.name}")

    data = json.loads(path.read_text(encoding="utf-8"))
    kathismas = data.get("kathismas") or []

    if not kathismas:
        raise RuntimeError(f"Нет kathismas в {path.name}")

    source = str(kathismas[0].get("prayers_after") or "").strip()

    if not source:
        raise RuntimeError(f"Пустой prayers_after в {path.name}")

    first_line = source.splitlines()[0].strip()

    # Ищем оригинальную рубрику тропаря.
    tropar_heading = ""

    for line in source.splitlines():
        plain = normalize_search(line)
        match = TROPAR_RE.search(plain)

        if match:
            tropar_heading = strip_marks(line).strip()
            break

    if not tropar_heading:
        tropar_heading = f"Тропари после {number}-й кафизмы:"

    return {
        "path": str(path),
        "first_line": strip_marks(first_line),
        "tropar_heading": tropar_heading,
        "prayer_heading": "Господи, помилуй (40) и молитва:",
    }


# =========================================================
# ОДНА КАФИЗМА
# =========================================================

def parse_one(rows, files_dir, number):
    structure = load_structure(files_dir, number)

    start_index = find_row_index(
        rows,
        after_kathisma_re(number),
    )

    if start_index is None:
        return {
            "number": number,
            "status": "ERROR",
            "validation_errors": ["Не найдено «После кафизмы N» в layout-тексте."],
        }

    end_index = find_end_index(
        rows,
        number,
        start_index + 1,
    )

    if end_index is None:
        return {
            "number": number,
            "status": "ERROR",
            "pdf_start_page": rows[start_index]["page"],
            "validation_errors": ["Не найден конец блока кафизмы."],
        }

    tropar_index = find_marker_index(
        rows,
        TROPAR_RE,
        start_index,
        end_index,
    )

    prayer_index = find_marker_index(
        rows,
        PRAYER_RE,
        start_index,
        end_index,
    )

    if tropar_index is None:
        return {
            "number": number,
            "status": "ERROR",
            "pdf_start_page": rows[start_index]["page"],
            "pdf_end_page": rows[end_index - 1]["page"] if end_index > start_index else rows[start_index]["page"],
            "validation_errors": ["Не найдена строка «Тропари..., глас ...»."],
        }

    # Язык определяем по самому содержимому послекафизмального блока,
    # а не по пустым областям страницы.
    language_end = end_index
    language = choose_russian_side(
        rows,
        tropar_index,
        language_end,
    )

    side = language["side"]

    if side is None:
        return {
            "number": number,
            "status": "ERROR",
            "pdf_start_page": rows[start_index]["page"],
            "pdf_end_page": rows[end_index - 1]["page"] if end_index > start_index else rows[start_index]["page"],
            "language": language,
            "validation_errors": ["Не удалось определить русскую колонку."],
        }

    # Если рубрика молитвы не нашлась, всё ещё сохраняем preview,
    # но ставим CHECK — ничего не записываем в БД.
    if prayer_index is not None and prayer_index > tropar_index:
        tropar_text = extract_side_segment(
            rows,
            side,
            tropar_index,
            prayer_index,
            heading_regex=TROPAR_RE,
        )

        prayer_text = extract_side_segment(
            rows,
            side,
            prayer_index,
            end_index,
            heading_regex=PRAYER_RE,
        )
    else:
        tropar_text = extract_side_segment(
            rows,
            side,
            tropar_index,
            end_index,
            heading_regex=TROPAR_RE,
        )
        prayer_text = ""

    parts = [
        structure["first_line"],
        "",
        structure["tropar_heading"],
        "",
        tropar_text,
    ]

    if prayer_text:
        parts.extend(
            [
                "",
                structure["prayer_heading"],
                "",
                prayer_text,
            ]
        )

    result_text = "\n".join(parts).strip()

    errors = []
    plain = normalize_search(result_text)

    if cyrillic_count(tropar_text) < 80:
        errors.append("Русская часть тропарей получилась слишком короткой.")

    if "слава:" not in plain:
        errors.append("В русском тексте не найдено «Слава:».")

    if "и ныне:" not in plain:
        errors.append("В русском тексте не найдено «И ныне:».")

    if prayer_index is None:
        errors.append("Не найдена отдельная строка «Господи, помилуй (40) и молитва:».")

    if prayer_index is not None and cyrillic_count(prayer_text) < 60:
        errors.append("Русская заключительная молитва получилась слишком короткой.")

    selected_score = (
        language["left_score"]
        if side == "left"
        else language["right_score"]
    )
    other_score = (
        language["right_score"]
        if side == "left"
        else language["left_score"]
    )

    if selected_score > 0.075:
        errors.append(
            f"Слишком высокая плотность ударений в выбранной русской колонке: {selected_score:.4f}."
        )

    # Дополнительная защита от очевидного захвата ЦС.
    if number == 1:
        if "в беззакониях" not in plain:
            errors.append("Для 1-й кафизмы не найдено русское «В беззакониях...».")

        if "в беззакониих" in plain:
            errors.append("Для 1-й кафизмы в результат попал ЦС-текст «В беззакониих...».")

    return {
        "number": number,
        "status": "OK" if not errors else "CHECK",
        "source_structure_file": structure["path"],
        "pdf_start_page": rows[start_index]["page"],
        "pdf_end_page": (
            rows[end_index - 1]["page"]
            if end_index > start_index
            else rows[start_index]["page"]
        ),
        "selected_russian_side": side,
        "russian_accent_density": round(selected_score, 6),
        "other_column_accent_density": round(other_score, 6),
        "layout_rows": {
            "after_kathisma_row": {
                "page": rows[start_index]["page"],
                "line": rows[start_index]["line_index"] + 1,
                "text": rows[start_index]["full"],
            },
            "tropar_row": {
                "page": rows[tropar_index]["page"],
                "line": rows[tropar_index]["line_index"] + 1,
                "text": rows[tropar_index]["full"],
            },
            "prayer_row": (
                {
                    "page": rows[prayer_index]["page"],
                    "line": rows[prayer_index]["line_index"] + 1,
                    "text": rows[prayer_index]["full"],
                }
                if prayer_index is not None
                else None
            ),
            "end_row": (
                {
                    "page": rows[end_index]["page"],
                    "line": rows[end_index]["line_index"] + 1,
                    "text": rows[end_index]["full"],
                }
                if end_index < len(rows)
                else None
            ),
        },
        "prayers_after_russian": result_text,
        "validation_errors": errors,
    }


# =========================================================
# DEBUG
# =========================================================

def write_debug_layout(rows, output_dir, number, result):
    pages = set()

    for key in ("pdf_start_page", "pdf_end_page"):
        page = result.get(key)
        if page:
            pages.add(page)

    if not pages:
        return None

    lo = max(1, min(pages) - 1)
    hi = max(pages) + 1

    debug_path = output_dir / f"kathisma_{number}_layout_debug.txt"

    with debug_path.open("w", encoding="utf-8") as file:
        for page in range(lo, hi + 1):
            file.write(f"\n{'=' * 30} PAGE {page} {'=' * 30}\n")

            for row in rows:
                if row["page"] != page:
                    continue

                file.write(
                    f"{row['line_index'] + 1:03d} | "
                    f"L=[{row['left']}] | "
                    f"R=[{row['right']}]\n"
                )

    return str(debug_path)


# =========================================================
# CLI
# =========================================================

def main():
    base_dir = Path(__file__).resolve().parent

    parser = argparse.ArgumentParser(
        description=(
            "Безопасный PREVIEW-парсер русского текста после кафизм. "
            "Использует pypdf extraction_mode='layout'. "
            "БД и существующие JSON НЕ изменяет."
        )
    )

    parser.add_argument(
        "pdf_file",
        nargs="?",
        default=str(base_dir / "files" / "psaltir_azbyka.pdf"),
    )

    parser.add_argument(
        "--files-dir",
        default=str(base_dir / "files"),
    )

    parser.add_argument(
        "--output",
        default=str(
            base_dir / "files" / "kathisma_prayers_russian_layout_preview.json"
        ),
    )

    parser.add_argument(
        "--kathisma",
        type=int,
        default=None,
        help="Проверить только одну кафизму, например --kathisma 3.",
    )

    args = parser.parse_args()

    pdf_path = Path(args.pdf_file).resolve()
    files_dir = Path(args.files_dir).resolve()
    output_path = Path(args.output).resolve()

    if not pdf_path.exists():
        raise SystemExit(f"PDF не найден: {pdf_path}")

    if not files_dir.exists():
        raise SystemExit(f"Папка files не найдена: {files_dir}")

    if args.kathisma is not None and not 1 <= args.kathisma <= 20:
        raise SystemExit("--kathisma должен быть от 1 до 20.")

    reader = PdfReader(str(pdf_path))

    print(f"PDF: {pdf_path}")
    print(f"Страниц: {len(reader.pages)}")
    print("Извлекаю PDF в layout-режиме...")

    rows, page_meta = build_rows(reader)

    print(f"Layout-строк: {len(rows)}")
    print()

    numbers = (
        [args.kathisma]
        if args.kathisma is not None
        else list(range(1, 21))
    )

    results = []

    for number in numbers:
        print(f"Кафизма {number}...", end=" ")

        try:
            result = parse_one(
                rows,
                files_dir,
                number,
            )
        except Exception as exc:
            result = {
                "number": number,
                "status": "ERROR",
                "validation_errors": [str(exc)],
            }

        if result["status"] != "OK":
            debug = write_debug_layout(
                rows,
                output_path.parent,
                number,
                result,
            )
            if debug:
                result["debug_file"] = debug

        results.append(result)

        print(result["status"])

        if result["status"] != "OK":
            for error in result.get("validation_errors", []):
                print(f"  - {error}")

        if result.get("selected_russian_side"):
            print(
                f"  side={result['selected_russian_side']} | "
                f"accent={result['russian_accent_density']} | "
                f"pages={result['pdf_start_page']}-{result['pdf_end_page']}"
            )

    ok = sum(item["status"] == "OK" for item in results)
    check = sum(item["status"] == "CHECK" for item in results)
    error = sum(item["status"] == "ERROR" for item in results)

    payload = {
        "source_pdf": str(pdf_path),
        "mode": (
            f"kathisma_{args.kathisma}"
            if args.kathisma is not None
            else "all_20"
        ),
        "summary": {
            "total": len(results),
            "ok": ok,
            "check": check,
            "error": error,
        },
        "page_meta": page_meta,
        "kathismas": results,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print()
    print("=" * 76)
    print("LAYOUT PREVIEW ЗАВЕРШЁН")
    print("=" * 76)
    print(f"OK:    {ok}")
    print(f"CHECK: {check}")
    print(f"ERROR: {error}")
    print(f"JSON:  {output_path}")
    print()
    print("БД НЕ ИЗМЕНЯЛАСЬ.")
    print("Существующие *_final.json НЕ ИЗМЕНЯЛИСЬ.")
    print("import_psalter_russian.py НЕ ИЗМЕНЯЛСЯ.")

    if check or error:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
