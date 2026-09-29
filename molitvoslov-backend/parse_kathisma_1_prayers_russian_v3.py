import argparse
import json
import re
import unicodedata
from pathlib import Path

from pypdf import PdfReader


KATHISMA_NUMBER = 1
NEXT_KATHISMA_NUMBER = 2
NEXT_PSALM_NUMBER = 9


def strip_marks(text: str) -> str:
    """Убирает только комбинируемые ударения/надстрочные знаки для поиска."""
    return "".join(
        ch
        for ch in unicodedata.normalize("NFD", str(text or ""))
        if unicodedata.category(ch) != "Mn"
    )


def normalize_search(text: str) -> str:
    text = strip_marks(text)
    text = text.replace("\xa0", " ").replace("\u00ad", "")
    text = text.replace("–", "-").replace("—", "-")
    text = re.sub(r"[ \t]+", " ", text)
    return text


START_RE = re.compile(
    r"(?:"
    r"по\s*1\s*-\s*[йя]\s+кафи[зс]ме"
    r"|после\s+1\s*-\s*[йя]\s+кафи[зс]м[еы]"
    r"|после\s+кафи[зс]мы\s+1"
    r")",
    re.IGNORECASE,
)

END_RES = [
    re.compile(r"по\s*2\s*-\s*[йя]\s+кафи[зс]ме", re.IGNORECASE),
    re.compile(r"после\s+2\s*-\s*[йя]\s+кафи[зс]м[еы]", re.IGNORECASE),
    re.compile(r"после\s+кафи[зс]мы\s+2", re.IGNORECASE),
    re.compile(r"кафи[зс]ма\s+2(?:-я)?", re.IGNORECASE),
    re.compile(rf"псалом\s+{NEXT_PSALM_NUMBER}\b", re.IGNORECASE),
]


def has_start(text: str) -> bool:
    return bool(START_RE.search(normalize_search(text)))


def has_end(text: str) -> bool:
    source = normalize_search(text)
    return any(pattern.search(source) for pattern in END_RES)


def accent_count(text: str) -> int:
    return sum(
        1
        for ch in unicodedata.normalize("NFD", str(text or ""))
        if unicodedata.category(ch) == "Mn"
    )


def compose_text_matrix(tm, cm):
    """
    Реальная пользовательская матрица = Text Matrix × Current Matrix.

    В v2 использовались только tm[4]/tm[5].
    В этом PDF этого недостаточно: обе визуальные колонки попадали
    в одну геометрическую половину. Здесь учитываем cm.
    """
    return [
        tm[0] * cm[0] + tm[1] * cm[2],
        tm[0] * cm[1] + tm[1] * cm[3],
        tm[2] * cm[0] + tm[3] * cm[2],
        tm[2] * cm[1] + tm[3] * cm[3],
        tm[4] * cm[0] + tm[5] * cm[2] + cm[4],
        tm[4] * cm[1] + tm[5] * cm[3] + cm[5],
    ]


def normalize_fragment(text):
    text = str(text or "")
    text = text.replace("\xa0", " ").replace("\u00ad", "")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def extract_fragments(page):
    """
    Возвращает реальные координаты текстовых фрагментов страницы.
    Никакие файлы/БД не изменяет.
    """
    fragments = []

    def visitor_text(text, cm, tm, _font_dict, _font_size):
        value = normalize_fragment(text)
        if not value:
            return

        try:
            matrix = compose_text_matrix(tm, cm)
            x = float(matrix[4])
            y = float(matrix[5])
        except (TypeError, ValueError, IndexError):
            return

        chunks = [part.strip() for part in value.split("\n") if part.strip()]
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
    return fragments


def group_lines(fragments, y_tolerance=2.8):
    if not fragments:
        return []

    items = sorted(fragments, key=lambda item: (-item["y"], item["x"]))

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
            lines.append(
                {
                    "y": sum(item["y"] for item in current) / len(current),
                    "x_min": min(item["x"] for item in current),
                    "x_max": max(item["x"] for item in current),
                    "text": text,
                }
            )

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


def line_text(lines):
    return "\n".join(line["text"] for line in lines).strip()


def find_anchor_line(lines, mode):
    for line in lines:
        source = normalize_search(line["text"])
        if mode == "start" and START_RE.search(source):
            return line
        if mode == "end" and any(pattern.search(source) for pattern in END_RES):
            return line
    return None


def split_candidates(page, fragments, start_y=None, end_y=None):
    """
    Пробует несколько геометрических границ, потому что PDF может иметь
    поля/вложенные трансформации. Возвращает кандидаты LEFT/RIGHT.
    """
    width = float(page.mediabox.width)

    # После compose_text_matrix координаты должны быть реальными,
    # но пробуем несколько близких границ для устойчивости.
    ratios = [0.46, 0.48, 0.50, 0.52, 0.54]

    candidates = []

    for ratio in ratios:
        split_x = width * ratio

        for side in ("left", "right"):
            selected = []

            for item in fragments:
                if side == "left" and item["x"] >= split_x:
                    continue
                if side == "right" and item["x"] < split_x:
                    continue

                # PDF читается сверху вниз: Y уменьшается.
                if start_y is not None and item["y"] > start_y + 4:
                    continue
                if end_y is not None and item["y"] < end_y - 4:
                    continue

                selected.append(item)

            lines = group_lines(selected)
            text = line_text(lines)

            if not text:
                continue

            # Русский вариант должен иметь намного меньше надстрочных ударений.
            # Нормируем на длину, чтобы короткий мусор не выигрывал.
            letters = max(1, len(re.findall(r"[А-Яа-яЁё]", text)))
            density = accent_count(text) / letters

            candidates.append(
                {
                    "ratio": ratio,
                    "side": side,
                    "text": text,
                    "accent_density": density,
                    "length": len(text),
                }
            )

    return candidates


def choose_russian_candidate(candidates):
    """
    Отбрасываем слишком короткие половины и выбираем среди остальных
    текст с минимальной плотностью церковнославянских ударений.
    """
    useful = [item for item in candidates if item["length"] >= 200]

    if not useful:
        useful = candidates

    if not useful:
        return None

    useful.sort(
        key=lambda item: (
            item["accent_density"],
            -item["length"],
        )
    )
    return useful[0]


def merge_russian_pages(page_texts):
    text = "\n".join(part.strip() for part in page_texts if part.strip())

    # Склеиваем перенос слова через дефис.
    text = re.sub(
        r"(?<=[А-Яа-яЁёA-Za-z])-+\s*\n\s*(?=[А-Яа-яЁёA-Za-z])",
        "",
        text,
    )

    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


def validate(text):
    plain = normalize_search(text)
    errors = []

    if len(text) < 500:
        errors.append(f"Русский блок слишком короткий: {len(text)} символов.")

    # Здесь поиск уже без ударений, поэтому "Го́споди" тоже распознаётся.
    if not re.search(r"\bтропар", plain, re.IGNORECASE):
        errors.append("Не найден тропарь/тропари.")

    if not re.search(r"\bслава\s*:", plain, re.IGNORECASE):
        errors.append("Не найдено «Слава:».")

    if not re.search(r"\bи\s+ныне\s*:", plain, re.IGNORECASE):
        errors.append("Не найдено «И ныне:».")

    if not re.search(r"господи\s*,?\s*помилуй", plain, re.IGNORECASE):
        # Это не фатальная ошибка источника: в параллельной колонке
        # общая рубрика может быть напечатана только один раз.
        errors.append(
            "В русской колонке не найдено «Господи, помилуй». "
            "Возможно, рубрика в PDF общая для двух колонок."
        )

    if re.search(r"\bпсалом\s+9\b", plain, re.IGNORECASE):
        errors.append("В результат попал Псалом 9.")

    return errors


def parse(pdf_path: Path, max_pages=6):
    reader = PdfReader(str(pdf_path))

    print(f"PDF: {pdf_path}")
    print(f"Страниц: {len(reader.pages)}")
    print("1) Ищу страницу с окончанием 1-й кафизмы...")

    start_page = None
    start_anchor_y = None

    page_cache = {}

    for index, page in enumerate(reader.pages):
        fragments = extract_fragments(page)
        lines = group_lines(fragments)
        page_cache[index] = {"fragments": fragments, "lines": lines}

        anchor = find_anchor_line(lines, "start")
        if anchor:
            start_page = index
            start_anchor_y = anchor["y"]
            break

        # Запасной вариант: стандартное извлечение текста.
        raw = page.extract_text() or ""
        if has_start(raw):
            start_page = index
            start_anchor_y = None
            break

    if start_page is None:
        raise RuntimeError("Не найдено начало блока после 1-й кафизмы.")

    print(f"   Начало: страница {start_page + 1}")

    collected = []
    diagnostics = []

    for page_index in range(
        start_page,
        min(len(reader.pages), start_page + max_pages),
    ):
        page = reader.pages[page_index]

        if page_index not in page_cache:
            fragments = extract_fragments(page)
            lines = group_lines(fragments)
            page_cache[page_index] = {"fragments": fragments, "lines": lines}

        fragments = page_cache[page_index]["fragments"]
        all_lines = page_cache[page_index]["lines"]

        end_anchor = find_anchor_line(all_lines, "end")
        end_y = end_anchor["y"] if end_anchor else None

        this_start_y = start_anchor_y if page_index == start_page else None

        candidates = split_candidates(
            page,
            fragments,
            start_y=this_start_y,
            end_y=end_y,
        )

        chosen = choose_russian_candidate(candidates)

        if chosen is None:
            continue

        diagnostics.append(
            {
                "page": page_index + 1,
                "side": chosen["side"],
                "split_ratio": chosen["ratio"],
                "accent_density": round(chosen["accent_density"], 6),
                "length": chosen["length"],
                "end_anchor": end_anchor["text"] if end_anchor else None,
            }
        )

        collected.append(chosen["text"])

        if end_anchor:
            break

    russian = merge_russian_pages(collected)

    return {
        "kathisma": 1,
        "source": str(pdf_path),
        "start_page": start_page + 1,
        "page_diagnostics": diagnostics,
        "prayers_after_russian": russian,
        "validation_errors": validate(russian),
    }


def main():
    base_dir = Path(__file__).resolve().parent

    parser = argparse.ArgumentParser(
        description=(
            "Тестовый парсер русского блока после 1-й кафизмы. "
            "Ничего не пишет в БД и не изменяет существующие JSON."
        )
    )

    parser.add_argument(
        "pdf_file",
        nargs="?",
        default=str(base_dir / "files" / "psaltir_azbyka.pdf"),
    )

    parser.add_argument(
        "--output",
        default=str(base_dir / "files" / "kathisma_1_prayers_russian_preview_v3.json"),
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

    result = parse(
        pdf_path,
        max_pages=max(1, args.max_pages),
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(result, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print()
    print("=" * 78)
    print("РУССКИЙ ПРЕДПРОСМОТР. БД НЕ ИЗМЕНЯЛАСЬ.")
    print("=" * 78)
    print(result["prayers_after_russian"])
    print("=" * 78)
    print()
    print("Диагностика страниц:")
    for item in result["page_diagnostics"]:
        print(
            f"  стр. {item['page']}: side={item['side']}, "
            f"split={item['split_ratio']}, "
            f"accent_density={item['accent_density']}, "
            f"length={item['length']}, "
            f"end={item['end_anchor']!r}"
        )

    print()
    print(f"JSON: {output_path}")

    if result["validation_errors"]:
        print()
        print("Замечания проверки:")
        for error in result["validation_errors"]:
            print(f"  - {error}")
        raise SystemExit(2)

    print()
    print("ПРОВЕРКА ПРОЙДЕНА.")
    print("БД, модели, псалмы и существующие JSON не изменялись.")


if __name__ == "__main__":
    main()
