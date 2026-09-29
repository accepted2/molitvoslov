import argparse
import json
import re
import unicodedata
from pathlib import Path

from pypdf import PdfReader


# =========================================================
# НОРМАЛИЗАЦИЯ / ПОИСК
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


def normalize_piece(text: str) -> str:
    text = str(text or "")
    text = text.replace("\xa0", " ").replace("\u00ad", "")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
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


def start_patterns(number: int):
    n = re.escape(str(number))
    return [
        re.compile(
            rf"по\s*{n}\s*[-–—]?\s*(?:й|я)\s+кафи[зс]ме\b",
            re.IGNORECASE,
        ),
        re.compile(
            rf"после\s*{n}\s*[-–—]?\s*(?:й|я)\s+кафи[зс]м[еы]\b",
            re.IGNORECASE,
        ),
        re.compile(
            rf"после\s+кафи[зс]мы\s+{n}\b",
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


def tropar_heading_pattern():
    return re.compile(
        r"(?:и\s+)?(?:таже\s+)?тропар(?:ь|и)"
        r"(?:\s+сия|\s+покаянн(?:ый|ые|ыя))?"
        r"[^:\n]{0,60}глас[^:\n]{0,30}:",
        re.IGNORECASE,
    )


def prayer_rubric_pattern():
    return re.compile(
        r"господи\s*,?\s*помилуй\s*\(?\s*40\s*\)?"
        r"[^:\n]{0,80}(?:молитв|моли́тв)[^:\n]{0,30}:",
        re.IGNORECASE,
    )


# =========================================================
# КООРДИНАТЫ PDF
# =========================================================

def extract_raw_fragments(page):
    """
    Извлекает текстовые фрагменты с исходными tm[4]/tm[5].

    В этом PDF они хорошо разделяют две печатные колонки.
    База данных здесь не используется.
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
            items.append(
                {
                    "x": x,
                    "y": y - idx * 0.01,
                    "text": part,
                }
            )

    page.extract_text(visitor_text=visitor)
    return items


def kmeans_1d(values, max_iter=50):
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


def detect_columns(page, fragments):
    """
    Определяет геометрическую границу двух колонок по X.
    """
    x_values = [
        item["x"]
        for item in fragments
        if cyrillic_count(item["text"]) >= 4
    ]

    result = kmeans_1d(x_values)

    if result is None:
        raise RuntimeError("Не удалось определить две колонки на странице.")

    return result


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
            lines.append(
                {
                    "y": sum(item["y"] for item in current) / len(current),
                    "text": text,
                }
            )

        current = []
        current_y = None

    for item in items:
        if current_y is None or abs(item["y"] - current_y) <= y_tolerance:
            current.append(item)
            current_y = (
                item["y"]
                if current_y is None
                else (current_y + item["y"]) / 2
            )
        else:
            flush()
            current = [item]
            current_y = item["y"]

    flush()
    return lines


# =========================================================
# ПОЗИЦИИ В ДОКУМЕНТЕ
# =========================================================

def later_than(page_index, y, anchor_page, anchor_y):
    """
    Истинно, если позиция идёт ПОСЛЕ anchor в порядке чтения.
    На одной странице Y уменьшается сверху вниз.
    """
    if page_index > anchor_page:
        return True

    if page_index < anchor_page:
        return False

    return y < anchor_y - 0.5


def earlier_than(page_index, y, anchor_page, anchor_y):
    """
    Истинно, если позиция идёт ДО anchor в порядке чтения.
    """
    if page_index < anchor_page:
        return True

    if page_index > anchor_page:
        return False

    return y > anchor_y + 0.5


def find_line_anchor(lines, regexes):
    for line in lines:
        source = normalize_search(line["text"])

        for regex in regexes:
            if regex.search(source):
                return {
                    "y": line["y"],
                    "text": line["text"],
                }

    return None


# =========================================================
# ИСХОДНАЯ СТРУКТУРА КАФИЗМ
# =========================================================

def load_existing_structure(files_dir: Path, number: int):
    """
    Читает ТОЛЬКО существующий *_final.json как эталон рубрик.
    Ничего в нём не изменяет.
    """
    path = files_dir / f"psalter_kathisma_{number}_final.json"

    if not path.exists():
        raise RuntimeError(f"Не найден эталонный файл: {path}")

    data = json.loads(path.read_text(encoding="utf-8"))

    kathismas = data.get("kathismas") or []

    if not kathismas:
        raise RuntimeError(f"Нет kathismas в {path.name}")

    item = kathismas[0]
    prayers_after = str(item.get("prayers_after") or "").strip()

    if not prayers_after:
        raise RuntimeError(f"Пустой prayers_after в {path.name}")

    plain = normalize_search(prayers_after)

    tropar_match = tropar_heading_pattern().search(plain)

    # Если нормализованный вариант не сработал, ищем в оригинале.
    if tropar_match:
        tropar_heading = tropar_match.group(0).strip()
    else:
        raw_match = re.search(
            r"(?:И\s+)?(?:Таже\s+)?Тропар(?:ь|и)"
            r"(?:\s+сия|\s+покаянн(?:ый|ые|ыя))?"
            r"[^:\n]{0,60}глас[^:\n]{0,30}:",
            prayers_after,
            flags=re.IGNORECASE,
        )

        tropar_heading = (
            strip_marks(raw_match.group(0)).strip()
            if raw_match
            else ""
        )

    # Для русского блока ставим единообразную рубрику.
    prayer_heading = "Господи, помилуй (40) и молитва:"

    return {
        "path": str(path),
        "prayers_after": prayers_after,
        "tropar_heading": tropar_heading,
        "prayer_heading": prayer_heading,
    }


# =========================================================
# СТРАНИЦЫ / ЯКОРЯ
# =========================================================

def build_page_cache(reader):
    cache = []

    for page_index, page in enumerate(reader.pages):
        fragments = extract_raw_fragments(page)
        all_lines = group_lines(fragments)

        cache.append(
            {
                "page": page,
                "page_index": page_index,
                "fragments": fragments,
                "all_lines": all_lines,
                "plain_text": normalize_search(page.extract_text() or ""),
            }
        )

    return cache


def find_start_page(cache, number):
    patterns = start_patterns(number)

    for item in cache:
        text = item["plain_text"]

        if any(pattern.search(text) for pattern in patterns):
            return item["page_index"]

    return None


def find_tropar_anchor(cache, number, start_page):
    regex = tropar_heading_pattern()

    # Обычно рубрика находится на той же странице.
    # Даём максимум ещё две страницы на случай переноса.
    for page_index in range(start_page, min(len(cache), start_page + 3)):
        lines = cache[page_index]["all_lines"]

        anchor = find_line_anchor(lines, [regex])

        if anchor:
            return {
                "page": page_index,
                "y": anchor["y"],
                "text": anchor["text"],
            }

    return None


def find_prayer_anchor(cache, start_page, max_pages=4):
    regex = prayer_rubric_pattern()

    for page_index in range(start_page, min(len(cache), start_page + max_pages)):
        lines = cache[page_index]["all_lines"]

        anchor = find_line_anchor(lines, [regex])

        if anchor:
            return {
                "page": page_index,
                "y": anchor["y"],
                "text": anchor["text"],
            }

    return None


def find_end_anchor(cache, number, start_page, max_pages=5):
    """
    Для 1-19 конец — начало следующей кафизмы.

    Для 20 ищем первое явно следующее крупное место.
    Если не найдём, используем конец PDF и оставляем предупреждение.
    """
    if number < 20:
        regexes = next_kathisma_patterns(number + 1)

        for page_index in range(
            start_page,
            min(len(cache), start_page + max_pages),
        ):
            anchor = find_line_anchor(
                cache[page_index]["all_lines"],
                regexes,
            )

            if anchor:
                return {
                    "page": page_index,
                    "y": anchor["y"],
                    "text": anchor["text"],
                    "kind": "next_kathisma",
                }

        return None

    # Кафизма 20: возможные заголовки после её заключительной молитвы.
    tail_patterns = [
        re.compile(r"по\s+совершении\s+.*псалтир", re.IGNORECASE),
        re.compile(r"по\s+прочтении\s+.*псалтир", re.IGNORECASE),
        re.compile(r"молитв[аы]\s+по\s+прочтении\s+псалтир", re.IGNORECASE),
        re.compile(r"молитв[аы]\s+после\s+прочтения\s+псалтир", re.IGNORECASE),
        re.compile(r"молитв[аы]\s+по\s+окончании\s+псалтир", re.IGNORECASE),
        re.compile(r"\bпсалом\s+151\b", re.IGNORECASE),
    ]

    for page_index in range(
        start_page,
        min(len(cache), start_page + max_pages),
    ):
        anchor = find_line_anchor(
            cache[page_index]["all_lines"],
            tail_patterns,
        )

        if anchor:
            return {
                "page": page_index,
                "y": anchor["y"],
                "text": anchor["text"],
                "kind": "tail_heading",
            }

    return None


# =========================================================
# РУССКАЯ КОЛОНКА
# =========================================================

def split_page_lines(cache_item):
    fragments = cache_item["fragments"]
    columns = detect_columns(cache_item["page"], fragments)
    split_x = columns["split_x"]

    left_items = [
        item for item in fragments
        if item["x"] < split_x
    ]
    right_items = [
        item for item in fragments
        if item["x"] >= split_x
    ]

    return {
        "columns": columns,
        "left": group_lines(left_items),
        "right": group_lines(right_items),
    }


def lines_between_anchors(
    side_lines_by_page,
    start_anchor,
    end_anchor,
):
    result = []

    for page_index, lines in side_lines_by_page:
        for line in lines:
            if not later_than(
                page_index,
                line["y"],
                start_anchor["page"],
                start_anchor["y"],
            ):
                continue

            if end_anchor is not None and not earlier_than(
                page_index,
                line["y"],
                end_anchor["page"],
                end_anchor["y"],
            ):
                continue

            result.append(
                {
                    "page": page_index,
                    "y": line["y"],
                    "text": line["text"],
                }
            )

    return result


def choose_russian_side(
    page_splits,
    start_anchor,
    end_anchor,
):
    """
    Определяем сторону один раз для блока по плотности ударений.
    В проверенном PDF русская колонка имеет существенно меньшую
    плотность церковнославянских надстрочных знаков.
    """
    left_pages = [
        (page_index, data["left"])
        for page_index, data in page_splits
    ]
    right_pages = [
        (page_index, data["right"])
        for page_index, data in page_splits
    ]

    left_lines = lines_between_anchors(
        left_pages,
        start_anchor,
        end_anchor,
    )
    right_lines = lines_between_anchors(
        right_pages,
        start_anchor,
        end_anchor,
    )

    left_text = "\n".join(line["text"] for line in left_lines)
    right_text = "\n".join(line["text"] for line in right_lines)

    left_score = accent_density(left_text)
    right_score = accent_density(right_text)

    if left_score <= right_score:
        return {
            "side": "left",
            "score": left_score,
            "other_score": right_score,
            "lines": left_lines,
        }

    return {
        "side": "right",
        "score": right_score,
        "other_score": left_score,
        "lines": right_lines,
    }


# =========================================================
# ФОРМИРОВАНИЕ РЕЗУЛЬТАТА
# =========================================================

def clean_lines(lines):
    text = "\n".join(
        line["text"]
        for line in lines
        if str(line["text"]).strip()
    )

    text = text.replace("\u00ad", "")

    # Разрыв слова с дефисом на границе строк.
    text = re.sub(
        r"(?<=[А-Яа-яЁёA-Za-z])-+\s*\n\s*(?=[А-Яа-яЁёA-Za-z])",
        "",
        text,
    )

    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    # Убираем одиночные номера страниц/стихов, если они случайно попали.
    cleaned = []

    for line in text.splitlines():
        value = line.strip()

        if re.fullmatch(r"\d{1,3}", value):
            continue

        cleaned.append(value)

    return "\n".join(cleaned).strip()


def remove_shared_rubrics(text):
    """
    Общая рубрика иногда печатается между колонками и может попасть
    в русский текст. Мы всё равно добавляем её сами по структуре.
    """
    lines = []

    for line in text.splitlines():
        plain = normalize_search(line)

        if re.search(
            r"господи\s*,?\s*помилуй\s*\(?\s*40\s*\)?.*молитв",
            plain,
            flags=re.IGNORECASE,
        ):
            continue

        # Заголовок тропарей тоже добавляем сами из существующего *_final.json.
        if tropar_heading_pattern().search(plain):
            continue

        lines.append(line)

    return "\n".join(lines).strip()


def partition_at_prayer(lines, prayer_anchor):
    if prayer_anchor is None:
        return lines, []

    before = []
    after = []

    for line in lines:
        if earlier_than(
            line["page"],
            line["y"],
            prayer_anchor["page"],
            prayer_anchor["y"],
        ):
            before.append(line)
        elif later_than(
            line["page"],
            line["y"],
            prayer_anchor["page"],
            prayer_anchor["y"],
        ):
            after.append(line)

    return before, after


def validate_result(number, result_text, russian_score, prayer_text):
    errors = []
    plain = normalize_search(result_text)

    if len(result_text) < 250:
        errors.append(
            f"Слишком короткий русский блок: {len(result_text)} символов."
        )

    if russian_score > 0.075:
        errors.append(
            f"Слишком высокая плотность ударений для русского текста: "
            f"{russian_score:.4f}."
        )

    if not re.search(r"\bслава\s*:", plain, re.IGNORECASE):
        errors.append("Не найдено «Слава:».")

    if not re.search(r"\bи\s+ныне\s*:", plain, re.IGNORECASE):
        errors.append("Не найдено «И ныне:».")

    if not prayer_text or len(prayer_text) < 80:
        errors.append("Не удалось уверенно выделить заключительную молитву.")

    if re.search(r"\bкафи[зс]ма\s+\d+", plain, re.IGNORECASE):
        errors.append("В русский блок попал заголовок следующей кафизмы.")

    if number < 20 and re.search(
        rf"\bкафи[зс]ма\s+{number + 1}\b",
        plain,
        re.IGNORECASE,
    ):
        errors.append("В результат попало начало следующей кафизмы.")

    return errors


def parse_one(cache, files_dir, number):
    structure = load_existing_structure(files_dir, number)

    start_page = find_start_page(cache, number)

    if start_page is None:
        return {
            "number": number,
            "status": "ERROR",
            "validation_errors": [
                "Не найдена страница с блоком после этой кафизмы."
            ],
        }

    tropar_anchor = find_tropar_anchor(
        cache,
        number,
        start_page,
    )

    if tropar_anchor is None:
        return {
            "number": number,
            "status": "ERROR",
            "start_page": start_page + 1,
            "validation_errors": [
                "Не найден заголовок тропарей."
            ],
        }

    prayer_anchor = find_prayer_anchor(
        cache,
        start_page,
        max_pages=5,
    )

    end_anchor = find_end_anchor(
        cache,
        number,
        start_page,
        max_pages=6,
    )

    # Для 1-19 отсутствие конца считаем ошибкой.
    if number < 20 and end_anchor is None:
        return {
            "number": number,
            "status": "ERROR",
            "start_page": start_page + 1,
            "validation_errors": [
                "Не найдено начало следующей кафизмы."
            ],
        }

    # Для 20, если отдельного хвостового заголовка не нашли,
    # ограничиваемся не более чем 4 страницами после старта.
    last_page = (
        end_anchor["page"]
        if end_anchor is not None
        else min(len(cache) - 1, start_page + 3)
    )

    page_splits = []

    for page_index in range(start_page, last_page + 1):
        try:
            split = split_page_lines(cache[page_index])
        except Exception as exc:
            return {
                "number": number,
                "status": "ERROR",
                "start_page": start_page + 1,
                "validation_errors": [
                    f"Страница {page_index + 1}: {exc}"
                ],
            }

        page_splits.append(
            (
                page_index,
                split,
            )
        )

    side = choose_russian_side(
        page_splits,
        tropar_anchor,
        end_anchor,
    )

    russian_lines = side["lines"]

    tropar_lines, prayer_lines = partition_at_prayer(
        russian_lines,
        prayer_anchor,
    )

    tropar_text = remove_shared_rubrics(
        clean_lines(tropar_lines)
    )
    prayer_text = remove_shared_rubrics(
        clean_lines(prayer_lines)
    )

    parts = []

    tropar_heading = (
        structure["tropar_heading"]
        or f"Тропари после {number}-й кафизмы:"
    )

    if tropar_text:
        parts.append(tropar_heading)
        parts.append(tropar_text)

    if prayer_text:
        parts.append(structure["prayer_heading"])
        parts.append(prayer_text)

    result_text = "\n\n".join(parts).strip()

    errors = validate_result(
        number,
        result_text,
        side["score"],
        prayer_text,
    )

    if prayer_anchor is None:
        errors.append(
            "Не найден геометрический якорь «Господи, помилуй (40) и молитва»."
        )

    if number == 20 and end_anchor is None:
        errors.append(
            "Для 20-й кафизмы не найден явный конечный заголовок; "
            "нужна ручная проверка конца блока."
        )

    return {
        "number": number,
        "status": "OK" if not errors else "CHECK",
        "source_structure_file": structure["path"],
        "pdf_start_page": start_page + 1,
        "pdf_end_page": (
            end_anchor["page"] + 1
            if end_anchor is not None
            else last_page + 1
        ),
        "selected_russian_side": side["side"],
        "russian_accent_density": round(side["score"], 6),
        "other_column_accent_density": round(side["other_score"], 6),
        "anchors": {
            "troparion": tropar_anchor["text"],
            "prayer": prayer_anchor["text"] if prayer_anchor else None,
            "end": end_anchor["text"] if end_anchor else None,
        },
        "prayers_after_russian": result_text,
        "validation_errors": errors,
    }


# =========================================================
# CLI
# =========================================================

def main():
    base_dir = Path(__file__).resolve().parent

    parser = argparse.ArgumentParser(
        description=(
            "ПРЕДПРОСМОТР русского текста после кафизм 1–20. "
            "Читает psaltir_azbyka.pdf и существующие "
            "psalter_kathisma_N_final.json только как источники. "
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
            base_dir
            / "files"
            / "kathisma_prayers_russian_preview_all.json"
        ),
    )

    parser.add_argument(
        "--kathisma",
        type=int,
        default=None,
        help="Проверить только одну кафизму, например --kathisma 7.",
    )

    args = parser.parse_args()

    pdf_path = Path(args.pdf_file).resolve()
    files_dir = Path(args.files_dir).resolve()
    output_path = Path(args.output).resolve()

    if not pdf_path.exists():
        raise SystemExit(f"PDF не найден: {pdf_path}")

    if not files_dir.exists():
        raise SystemExit(f"Папка files не найдена: {files_dir}")

    if args.kathisma is not None and not (1 <= args.kathisma <= 20):
        raise SystemExit("--kathisma должен быть от 1 до 20.")

    reader = PdfReader(str(pdf_path))

    print(f"PDF: {pdf_path}")
    print(f"Страниц: {len(reader.pages)}")
    print("Строю индекс страниц...")
    cache = build_page_cache(reader)
    print("Индекс готов.")
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
            item = parse_one(
                cache,
                files_dir,
                number,
            )
        except Exception as exc:
            item = {
                "number": number,
                "status": "ERROR",
                "validation_errors": [str(exc)],
            }

        results.append(item)

        if item["status"] == "OK":
            print(
                f"OK | стр. {item.get('pdf_start_page')}"
                f"–{item.get('pdf_end_page')} | "
                f"{item.get('selected_russian_side')} | "
                f"accent={item.get('russian_accent_density')}"
            )
        else:
            print(item["status"])

            for error in item.get("validation_errors", []):
                print(f"  - {error}")

    ok_count = sum(1 for item in results if item["status"] == "OK")
    check_count = sum(1 for item in results if item["status"] == "CHECK")
    error_count = sum(1 for item in results if item["status"] == "ERROR")

    payload = {
        "source_pdf": str(pdf_path),
        "mode": (
            f"kathisma_{args.kathisma}"
            if args.kathisma is not None
            else "all_20"
        ),
        "summary": {
            "total": len(results),
            "ok": ok_count,
            "check": check_count,
            "error": error_count,
        },
        "kathismas": results,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(
            payload,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print()
    print("=" * 76)
    print("ПРЕДПРОСМОТР ЗАВЕРШЁН")
    print("=" * 76)
    print(f"OK:    {ok_count}")
    print(f"CHECK: {check_count}")
    print(f"ERROR: {error_count}")
    print(f"JSON:  {output_path}")
    print()
    print("БД НЕ ИЗМЕНЯЛАСЬ.")
    print("Существующие psalter_kathisma_*_final.json НЕ ИЗМЕНЯЛИСЬ.")
    print("Существующий import_psalter_russian.py НЕ ИЗМЕНЯЛСЯ.")

    if check_count or error_count:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
