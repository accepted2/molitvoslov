import argparse
import json
import re
import unicodedata
from pathlib import Path

from pypdf import PdfReader


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


def normalize_piece(text: str) -> str:
    text = str(text or "")
    text = text.replace("\xa0", " ").replace("\u00ad", "")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def extract_raw_fragments(page):
    """
    ВАЖНО:
    здесь специально используем исходные tm[4]/tm[5], без привязки
    к половине ширины страницы. В этом PDF координатная система текста
    не совпадает с page.mediabox, поэтому границу колонок определяем
    по самим X-координатам.
    """
    items = []

    def visitor(text, _cm, tm, _font_dict, _font_size):
        value = normalize_piece(text)
        if not value:
            return

        try:
            x = float(tm[4])
            y = float(tm[5])
        except (TypeError, ValueError, IndexError):
            return

        parts = [part.strip() for part in value.split("\n") if part.strip()]
        for idx, part in enumerate(parts):
            items.append({
                "x": x,
                "y": y - idx * 0.01,
                "text": part,
            })

    page.extract_text(visitor_text=visitor)
    return items


def kmeans_1d(values, max_iter=50):
    """
    Два кластера по X без сторонних библиотек.
    Нужны только для поиска двух колонок.
    """
    if len(values) < 2:
        return None

    lo = min(values)
    hi = max(values)

    if abs(hi - lo) < 1e-6:
        return None

    c1, c2 = lo, hi

    for _ in range(max_iter):
        g1 = []
        g2 = []

        for value in values:
            if abs(value - c1) <= abs(value - c2):
                g1.append(value)
            else:
                g2.append(value)

        if not g1 or not g2:
            return None

        n1 = sum(g1) / len(g1)
        n2 = sum(g2) / len(g2)

        if abs(n1 - c1) < 0.001 and abs(n2 - c2) < 0.001:
            c1, c2 = n1, n2
            break

        c1, c2 = n1, n2

    left_center, right_center = sorted((c1, c2))
    return {
        "left_center": left_center,
        "right_center": right_center,
        "split_x": (left_center + right_center) / 2,
    }


def group_lines(items, y_tolerance=2.7):
    items = sorted(items, key=lambda item: (-item["y"], item["x"]))

    lines = []
    current = []
    current_y = None

    def flush():
        nonlocal current, current_y
        if not current:
            return

        current.sort(key=lambda item: item["x"])
        text = " ".join(item["text"] for item in current)
        text = re.sub(r"\s+([,.;:!?])", r"\1", text)
        text = re.sub(r"\s{2,}", " ", text).strip()

        if text:
            lines.append({
                "y": sum(item["y"] for item in current) / len(current),
                "text": text,
            })

        current = []
        current_y = None

    for item in items:
        if current_y is None or abs(item["y"] - current_y) <= y_tolerance:
            current.append(item)
            current_y = item["y"] if current_y is None else (current_y + item["y"]) / 2
        else:
            flush()
            current = [item]
            current_y = item["y"]

    flush()
    return lines


def find_target_page(reader):
    """
    Ищем страницу по полному тексту. Не пытаемся здесь отделять языки.
    """
    start_re = re.compile(
        r"(?:по\s*1\s*[-–—]?\s*[йя]\s+кафи[зс]ме|"
        r"после\s+кафи[зс]мы\s+1)",
        re.IGNORECASE,
    )

    for index, page in enumerate(reader.pages):
        text = normalize_search(page.extract_text() or "")
        if start_re.search(text) and re.search(r"кафи[зс]ма\s+2", text, re.IGNORECASE):
            return index

    for index, page in enumerate(reader.pages):
        text = normalize_search(page.extract_text() or "")
        if start_re.search(text):
            return index

    return None


def find_y(lines, patterns):
    for line in lines:
        source = normalize_search(line["text"])
        for pattern in patterns:
            if re.search(pattern, source, re.IGNORECASE):
                return line["y"], line["text"]
    return None, None


def clean_text(lines):
    text = "\n".join(line["text"] for line in lines if line["text"].strip())
    text = text.replace("\u00ad", "")

    # Склеиваем только переносы слов с дефисом.
    text = re.sub(
        r"(?<=[А-Яа-яЁёA-Za-z])-+\s*\n\s*(?=[А-Яа-яЁёA-Za-z])",
        "",
        text,
    )

    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


def parse_first_kathisma(pdf_path: Path):
    reader = PdfReader(str(pdf_path))
    page_index = find_target_page(reader)

    if page_index is None:
        raise RuntimeError("Не нашёл страницу с молитвами после 1-й кафизмы.")

    page = reader.pages[page_index]
    fragments = extract_raw_fragments(page)

    if not fragments:
        raise RuntimeError("pypdf не вернул координатные фрагменты.")

    # Для определения колонок берём X только у достаточно длинных кириллических
    # фрагментов: номера стихов и мелкий мусор не должны влиять на кластеризацию.
    x_values = [
        item["x"]
        for item in fragments
        if len(re.findall(r"[А-Яа-яЁё]", item["text"])) >= 4
    ]

    clusters = kmeans_1d(x_values)
    if clusters is None:
        raise RuntimeError("Не удалось автоматически определить две колонки по X.")

    split_x = clusters["split_x"]

    left_items = [item for item in fragments if item["x"] < split_x]
    right_items = [item for item in fragments if item["x"] >= split_x]

    left_lines = group_lines(left_items)
    right_lines = group_lines(right_items)
    all_lines = group_lines(fragments)

    # Граница сверху: строка "тропари..., глас 1"
    tropar_y, tropar_line = find_y(
        all_lines,
        [
            r"тропар(?:ь|и|и сия).*глас\s*1",
        ],
    )

    # Граница перехода от тропарей к заключительной молитве.
    prayer_y, prayer_line = find_y(
        all_lines,
        [
            r"господи\s*,?\s*помилуй.*40.*молитв",
        ],
    )

    # Нижняя граница: Кафизма 2.
    end_y, end_line = find_y(
        all_lines,
        [
            r"кафи[зс]ма\s*2(?:-я)?",
        ],
    )

    if tropar_y is None:
        raise RuntimeError("Не нашёл на странице строку «тропари..., глас 1».")

    if end_y is None:
        raise RuntimeError("Не нашёл на странице начало 2-й кафизмы.")

    # У pypdf сверху страницы Y больше. Значит берём строки ниже tropar_y
    # и выше end_y.
    def in_range(line):
        return line["y"] < tropar_y - 0.5 and line["y"] > end_y + 0.5

    left_target = [line for line in left_lines if in_range(line)]
    right_target = [line for line in right_lines if in_range(line)]

    left_text = clean_text(left_target)
    right_text = clean_text(right_target)

    # Русский столбец определяем НЕ по "право/лево", а по количеству ударений.
    # Это защищает от зеркальной раскладки конкретного PDF.
    def score(text):
        letters = max(1, len(re.findall(r"[А-Яа-яЁё]", text)))
        return accent_count(text) / letters

    left_score = score(left_text)
    right_score = score(right_text)

    if left_score <= right_score:
        russian_side = "left"
        russian_lines = left_target
        russian_score = left_score
    else:
        russian_side = "right"
        russian_lines = right_target
        russian_score = right_score

    # Делим выбранный русский столбец на:
    # 1) русские тропари;
    # 2) русскую заключительную молитву.
    #
    # Рубрики берём из уже существующей ЦС-структуры, а НЕ "переводим":
    # "Тропарь, глас 1:" и "Господи, помилуй (40) и молитва:".
    if prayer_y is not None:
        tropar_lines = [
            line for line in russian_lines
            if line["y"] > prayer_y + 0.5
        ]
        prayer_lines = [
            line for line in russian_lines
            if line["y"] < prayer_y - 0.5
        ]
    else:
        tropar_lines = russian_lines
        prayer_lines = []

    russian_tropars = clean_text(tropar_lines)
    russian_prayer = clean_text(prayer_lines)

    result_parts = []

    if russian_tropars:
        result_parts.append("Тропарь, глас 1:")
        result_parts.append(russian_tropars)

    if russian_prayer:
        result_parts.append("Господи, помилуй (40) и молитва:")
        result_parts.append(russian_prayer)

    result_text = "\n\n".join(result_parts).strip()

    plain = normalize_search(result_text)
    errors = []

    if not re.search(r"в беззакониях", plain, re.IGNORECASE):
        errors.append("Не найден русский первый тропарь «В беззакониях...».")

    if not re.search(r"если праведник", plain, re.IGNORECASE):
        errors.append("Не найден русский второй тропарь «Если праведник...».")

    if not re.search(r"слава\s*:", plain, re.IGNORECASE):
        errors.append("Не найдено русское «Слава:».")

    if not re.search(r"и ныне\s*:", plain, re.IGNORECASE):
        errors.append("Не найдено русское «И ныне:».")

    if not re.search(r"владыка вседержител", plain, re.IGNORECASE):
        errors.append("Не найдено начало русской молитвы «Владыка Вседержитель...».")

    if re.search(r"в беззакониих зача", plain, re.IGNORECASE):
        errors.append("В русский результат попал церковнославянский тропарь.")

    if re.search(r"владыко вседержителю", plain, re.IGNORECASE):
        errors.append("В русский результат попала церковнославянская молитва.")

    return {
        "kathisma": 1,
        "source": str(pdf_path),
        "pdf_page": page_index + 1,
        "column_detection": {
            "left_center_x": clusters["left_center"],
            "right_center_x": clusters["right_center"],
            "split_x": split_x,
            "left_accent_score": left_score,
            "right_accent_score": right_score,
            "selected_russian_side": russian_side,
            "selected_russian_accent_score": russian_score,
        },
        "anchors": {
            "troparion_line": tropar_line,
            "prayer_line": prayer_line,
            "next_kathisma_line": end_line,
        },
        "prayers_after_russian": result_text,
        "validation_errors": errors,
    }


def main():
    base_dir = Path(__file__).resolve().parent

    parser = argparse.ArgumentParser(
        description=(
            "Тестовый парсер ТОЛЬКО русских тропарей и заключительной молитвы "
            "после 1-й кафизмы. БД и существующие JSON не изменяет."
        )
    )

    parser.add_argument(
        "pdf_file",
        nargs="?",
        default=str(base_dir / "files" / "psaltir_azbyka.pdf"),
    )

    parser.add_argument(
        "--output",
        default=str(
            base_dir / "files" / "kathisma_1_prayers_russian_preview_v4.json"
        ),
    )

    args = parser.parse_args()

    pdf_path = Path(args.pdf_file).resolve()
    output_path = Path(args.output).resolve()

    if not pdf_path.exists():
        raise SystemExit(f"PDF не найден: {pdf_path}")

    result = parse_first_kathisma(pdf_path)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(result, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"PDF: {pdf_path}")
    print(f"Страница: {result['pdf_page']}")
    print("Колонки:")
    for key, value in result["column_detection"].items():
        print(f"  {key}: {value}")

    print()
    print("=" * 80)
    print("РУССКИЙ БЛОК ПОСЛЕ 1-Й КАФИЗМЫ")
    print("БД НЕ ИЗМЕНЯЛАСЬ")
    print("=" * 80)
    print(result["prayers_after_russian"])
    print("=" * 80)
    print()
    print(f"JSON: {output_path}")

    if result["validation_errors"]:
        print()
        print("ПРОВЕРКА НЕ ПРОЙДЕНА:")
        for error in result["validation_errors"]:
            print(f"  - {error}")
        raise SystemExit(2)

    print()
    print("ПРОВЕРКА ПРОЙДЕНА.")
    print("Получены только русские тропари и русская заключительная молитва.")
    print("Никакие данные БД и существующие JSON не изменялись.")


if __name__ == "__main__":
    main()
