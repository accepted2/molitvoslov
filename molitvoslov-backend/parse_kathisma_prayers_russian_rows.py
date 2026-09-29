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


def cyrillic_count(text: str) -> int:
    return len(re.findall(r"[А-Яа-яЁё]", str(text or "")))


def accent_count(text: str) -> int:
    return sum(
        1
        for ch in unicodedata.normalize("NFD", str(text or ""))
        if unicodedata.category(ch) == "Mn"
    )


def accent_density(text: str) -> float:
    letters = max(1, cyrillic_count(text))
    return accent_count(text) / letters


# =========================================================
# РАЗМЕТКА PDF
# =========================================================


def extract_layout(page) -> str:
    try:
        return (
            page.extract_text(
                extraction_mode="layout",
                layout_mode_space_vertically=False,
            )
            or ""
        )
    except TypeError:
        return page.extract_text(extraction_mode="layout") or ""


def detect_split_column(lines):
    """
    Определяем межколоночный пробел по layout-тексту.
    Это тот же принцип, который уже дал правильный debug:
    L = церковнославянский, R = русский.
    """
    useful = [line.rstrip("\n") for line in lines if line.strip()]

    if not useful:
        return None

    widths = sorted(len(line) for line in useful)
    typical_width = widths[len(widths) // 2]

    centers = []

    for line in useful:
        for match in re.finditer(r" {6,}", line):
            left = line[: match.start()].strip()
            right = line[match.end() :].strip()

            if cyrillic_count(left) < 4 or cyrillic_count(right) < 4:
                continue

            center = (match.start() + match.end()) // 2

            if typical_width:
                ratio = center / typical_width
                if not 0.25 <= ratio <= 0.75:
                    continue

            centers.append(center)

    if centers:
        buckets = Counter(round(center / 2) * 2 for center in centers)
        return int(buckets.most_common(1)[0][0])

    max_width = max(len(line) for line in useful)

    if max_width < 20:
        return max_width // 2

    return max_width // 2


def split_line(line: str, split_col: int):
    if split_col is None:
        return line.rstrip(), ""

    return (
        line[:split_col].rstrip(),
        line[split_col:].strip(),
    )


def build_rows(reader):
    rows = []

    for page_index, page in enumerate(reader.pages):
        layout = extract_layout(page)
        lines = layout.replace("\r\n", "\n").replace("\r", "\n").splitlines()
        split_col = detect_split_column(lines)

        for line_index, full in enumerate(lines):
            left, right = split_line(full, split_col)

            rows.append(
                {
                    "page": page_index + 1,
                    "line": line_index + 1,
                    "left": left,
                    "right": right,
                    "full": full.rstrip(),
                    "plain_left": normalize_search(left),
                    "plain_right": normalize_search(right),
                    "plain_full": normalize_search(full),
                }
            )

    return rows


# =========================================================
# ГРАНИЦЫ ПОСЛЕКАФИЗМАЛЬНОГО БЛОКА
# =========================================================


def after_kathisma_patterns(number: int):
    n = re.escape(str(number))

    return [
        re.compile(rf"\bпосле\s+кафи[зс]мы\s+{n}\b", re.IGNORECASE),
        re.compile(
            rf"\bпо\s+{n}\s*[-–—]?\s*(?:й|я)\s+кафи[зс]ме\b",
            re.IGNORECASE,
        ),
    ]


def next_kathisma_patterns(number: int):
    n = re.escape(str(number))

    return [
        re.compile(
            rf"\bкафи[зс]ма\s+{n}(?:\s*[-–—]?\s*я)?\b",
            re.IGNORECASE,
        ),
        re.compile(
            rf"\b{n}\s*[-–—]?\s*я\s+кафи[зс]ма\b",
            re.IGNORECASE,
        ),
    ]


def find_start(rows, number):
    patterns = after_kathisma_patterns(number)

    # Для русского блока в первую очередь ищем именно ПРАВУЮ колонку.
    for index, row in enumerate(rows):
        if any(pattern.search(row["plain_right"]) for pattern in patterns):
            return index

    # Запасной вариант: если заголовок напечатан только слева,
    # ищем строку и начинаем с неё/следующей.
    for index, row in enumerate(rows):
        if any(pattern.search(row["plain_left"]) for pattern in patterns):
            for probe in range(index, min(len(rows), index + 4)):
                if "тропар" in rows[probe]["plain_right"].lower() or any(
                    pattern.search(rows[probe]["plain_right"]) for pattern in patterns
                ):
                    return probe

            return index

    return None


def find_end(rows, number, start_index):
    if number < 20:
        patterns = next_kathisma_patterns(number + 1)

        for index in range(start_index + 1, len(rows)):
            row = rows[index]

            if any(
                pattern.search(row["plain_left"])
                or pattern.search(row["plain_right"])
                or pattern.search(row["plain_full"])
                for pattern in patterns
            ):
                return index

        return None

    # Для 20-й кафизмы в этом PDF после неё идёт Псалом 151.
    tail_patterns = [
        re.compile(r"\bпсалом\s+151\b", re.IGNORECASE),
        re.compile(r"\bмолитв[аы].{0,50}псалтир", re.IGNORECASE),
    ]

    for index in range(start_index + 1, len(rows)):
        row = rows[index]

        if any(
            pattern.search(row["plain_left"])
            or pattern.search(row["plain_right"])
            or pattern.search(row["plain_full"])
            for pattern in tail_patterns
        ):
            return index

    return len(rows)


# =========================================================
# ИЗВЛЕЧЕНИЕ ПРАВОЙ (РУССКОЙ) КОЛОНКИ
# =========================================================


def clean_russian_lines(values):
    cleaned = []

    for value in values:
        value = value.replace("\u00ad", "").strip()

        if not value:
            continue

        # Одиночные номера страниц/стихов в этот раздел не нужны.
        if re.fullmatch(r"\d{1,3}", value):
            continue

        cleaned.append(value)

    text = "\n".join(cleaned)

    # Склеиваем слово, которое PDF разорвал дефисом.
    text = re.sub(
        r"(?<=[А-Яа-яЁёA-Za-z])-+\s*\n\s*(?=[А-Яа-яЁёA-Za-z])",
        "",
        text,
    )

    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


def extract_russian_block(rows, start_index, end_index):
    """
    Никаких искусственных разрезов "тропари/молитва" больше нет.

    Просто берём русскую ПРАВУЮ колонку:
      от "После кафизмы N..."
      до "Кафизма N+1".

    Именно так выглядит реальная структура debug-файла.
    """
    values = []

    for index in range(start_index, end_index):
        value = rows[index]["right"].strip()

        if value:
            values.append(value)

    return clean_russian_lines(values)


# =========================================================
# ПРОВЕРКА
# =========================================================


def validate(number, text):
    plain = normalize_search(text)
    errors = []

    if len(text) < 300:
        errors.append(f"Блок слишком короткий: {len(text)} символов.")

    required = [
        ("заголовок после кафизмы", rf"после\s+кафи[зс]мы\s+{number}\b"),
        ("тропарь/тропари", r"\bтропар"),
        ("Слава:", r"\bслава\s*:"),
        ("И ныне:", r"\bи\s+ныне\s*:"),
        ("Господи, помилуй", r"господи\s*,?\s*помилуй"),
        ("молитва", r"\bмолитв"),
    ]

    for label, pattern in required:
        if not re.search(pattern, plain, flags=re.IGNORECASE):
            errors.append(f"Не найден обязательный элемент: {label}.")

    density = accent_density(text)

    if density > 0.075:
        errors.append(f"Слишком высокая плотность ЦС-ударений: {density:.4f}.")

    if number < 20 and re.search(
        rf"\bкафи[зс]ма\s+{number + 1}\b",
        plain,
        flags=re.IGNORECASE,
    ):
        errors.append("В результат попало начало следующей кафизмы.")

    return errors, density


# =========================================================
# ОДНА / ВСЕ КАФИЗМЫ
# =========================================================


def parse_one(rows, number):
    start = find_start(rows, number)

    if start is None:
        return {
            "number": number,
            "status": "ERROR",
            "validation_errors": ["Не найдено начало русского блока."],
        }

    end = find_end(rows, number, start)

    if end is None:
        return {
            "number": number,
            "status": "ERROR",
            "pdf_start_page": rows[start]["page"],
            "validation_errors": ["Не найден конец русского блока."],
        }

    text = extract_russian_block(rows, start, end)
    errors, density = validate(number, text)

    return {
        "number": number,
        "status": "OK" if not errors else "CHECK",
        "pdf_start_page": rows[start]["page"],
        "pdf_end_page": (rows[end - 1]["page"] if end > start else rows[start]["page"]),
        "start_row": {
            "page": rows[start]["page"],
            "line": rows[start]["line"],
            "left": rows[start]["left"],
            "right": rows[start]["right"],
        },
        "end_row": (
            {
                "page": rows[end]["page"],
                "line": rows[end]["line"],
                "left": rows[end]["left"],
                "right": rows[end]["right"],
            }
            if end < len(rows)
            else None
        ),
        "russian_accent_density": round(density, 6),
        "prayers_after_russian": text,
        "validation_errors": errors,
    }


def main():
    base_dir = Path(__file__).resolve().parent

    parser = argparse.ArgumentParser(
        description=(
            "PREVIEW-парсер русских молитв после кафизм. "
            "Берёт только ПРАВУЮ колонку layout-PDF между "
            "«После кафизмы N» и следующей кафизмой. "
            "БД не изменяет."
        )
    )

    parser.add_argument(
        "pdf_file",
        nargs="?",
        default=str(base_dir / "files" / "psaltir_azbyka.pdf"),
    )

    parser.add_argument(
        "--kathisma",
        type=int,
        default=None,
        help="Одна кафизма для проверки, например --kathisma 3.",
    )

    parser.add_argument(
        "--output",
        default=str(base_dir / "files" / "kathisma_prayers_russian_rows_preview.json"),
    )

    args = parser.parse_args()

    if args.kathisma is not None and not 1 <= args.kathisma <= 20:
        raise SystemExit("--kathisma должен быть от 1 до 20.")

    pdf_path = Path(args.pdf_file).resolve()
    output_path = Path(args.output).resolve()

    if not pdf_path.exists():
        raise SystemExit(f"PDF не найден: {pdf_path}")

    reader = PdfReader(str(pdf_path))

    print(f"PDF: {pdf_path}")
    print(f"Страниц: {len(reader.pages)}")
    print("Строю layout-строки...")

    rows = build_rows(reader)

    print(f"Строк: {len(rows)}")
    print()

    numbers = [args.kathisma] if args.kathisma is not None else list(range(1, 21))

    results = []

    for number in numbers:
        result = parse_one(rows, number)
        results.append(result)

        print(f"Кафизма {number}: {result['status']}")

        if result.get("russian_accent_density") is not None:
            print(
                f"  pages={result.get('pdf_start_page')}-"
                f"{result.get('pdf_end_page')} | "
                f"accent={result['russian_accent_density']}"
            )

        for error in result.get("validation_errors", []):
            print(f"  - {error}")

        if len(numbers) == 1:
            print()
            print("=" * 80)
            print(result.get("prayers_after_russian", ""))
            print("=" * 80)

    ok = sum(item["status"] == "OK" for item in results)
    check = sum(item["status"] == "CHECK" for item in results)
    error = sum(item["status"] == "ERROR" for item in results)

    payload = {
        "source_pdf": str(pdf_path),
        "summary": {
            "total": len(results),
            "ok": ok,
            "check": check,
            "error": error,
        },
        "kathismas": results,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print()
    print(f"OK={ok} CHECK={check} ERROR={error}")
    print(f"JSON: {output_path}")
    print("БД и существующие файлы НЕ изменялись.")

    if check or error:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
