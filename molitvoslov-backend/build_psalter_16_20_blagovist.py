from __future__ import annotations

import argparse
import json
import re
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup


KATHISMA_RANGES = {
    16: range(109, 118),
    17: range(118, 119),
    18: range(119, 134),
    19: range(134, 143),
    20: range(143, 151),
}

GLORIES = {
    16: [
        {"number": 1, "after_psalm": 111, "after_verse": None},
        {"number": 2, "after_psalm": 114, "after_verse": None},
        {"number": 3, "after_psalm": 117, "after_verse": None},
    ],
    17: [
        {"number": 1, "after_psalm": None, "after_verse": {"psalm": 118, "verse": 72}},
        {"number": 2, "after_psalm": None, "after_verse": {"psalm": 118, "verse": 131}},
        {"number": 3, "after_psalm": 118, "after_verse": None},
    ],
    18: [
        {"number": 1, "after_psalm": 123, "after_verse": None},
        {"number": 2, "after_psalm": 128, "after_verse": None},
        {"number": 3, "after_psalm": 133, "after_verse": None},
    ],
    19: [
        {"number": 1, "after_psalm": 136, "after_verse": None},
        {"number": 2, "after_psalm": 139, "after_verse": None},
        {"number": 3, "after_psalm": 142, "after_verse": None},
    ],
    20: [
        {"number": 1, "after_psalm": 144, "after_verse": None},
        {"number": 2, "after_psalm": 147, "after_verse": None},
        {"number": 3, "after_psalm": 150, "after_verse": None},
    ],
}

URL = "https://blagovist.info/psaltyr-1/kafizma-{number}"

BAD_CHARS = {
    "e": "е",
    "E": "Е",
    "ќ": "к",
}

DROP_LINE_PREFIXES = (
    "По ",
    "Трисвято",
    "Та́же тропари",
    "Го́споди, поми́луй",
    "Господи, помилуй",
    "И ны́не:",
    "Сла́ва:",
)

def normalize(s: str) -> str:
    s = s.replace("\xa0", " ")
    for bad, good in BAD_CHARS.items():
        s = s.replace(bad, good)
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\s+([,.;:!?])", r"\1", s)
    return s.strip()

def get_html(k: int, cache_dir: Path, offline: bool = False) -> str:
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache = cache_dir / f"kafizma_{k}.html"

    if cache.exists():
        return cache.read_text(encoding="utf-8")

    if offline:
        raise FileNotFoundError(f"Нет кэша: {cache}")

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/152.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "ru,uk;q=0.9,en;q=0.7",
    }

    last = None
    for attempt in range(1, 4):
        try:
            r = requests.get(URL.format(number=k), headers=headers, timeout=30)
            r.raise_for_status()
            cache.write_text(r.text, encoding="utf-8")
            return r.text
        except Exception as e:
            last = e
            if attempt < 3:
                time.sleep(2 * attempt)

    raise RuntimeError(f"Не удалось скачать кафизму {k}: {last}")

def select_civil_section(html: str, k: int) -> str:
    soup = BeautifulSoup(html, "html.parser")

    # Удаляем явно ненужные элементы.
    for tag in soup(["script", "style", "nav", "footer", "header", "noscript"]):
        tag.decompose()

    text = soup.get_text("\n")
    text = text.replace("\r", "")
    lines = [normalize(x) for x in text.split("\n")]
    lines = [x for x in lines if x]

    # У гражданского текста на Благовіст есть заголовок "Кафизма ...".
    start = None
    for i, line in enumerate(lines):
        if re.match(r"^Кафизма\b", line, re.I) and str(k) not in line:
            # Первый церковнославянский гражданский заголовок обычно словесный:
            # "Кафизма шестаянадесять", "Кафизма седмаянадесять"...
            start = i + 1
            break

    if start is None:
        # запасной вариант: после блока переключателей
        for i, line in enumerate(lines):
            if "Граждан" in line and "Церков" in " ".join(lines[i:i+5]):
                start = i + 1
                break

    if start is None:
        raise ValueError(f"Не нашёл начало гражданского текста кафизмы {k}")

    end = len(lines)
    for i in range(start, len(lines)):
        line = lines[i]
        if re.match(r"^По\s+\d+-й\s+кафисме", line, re.I):
            end = i
            break
        if line.startswith("По ") and "кафисм" in line.lower():
            end = i
            break

    return "\n".join(lines[start:end])

def split_psalms(section: str, expected_numbers: list[int]) -> list[dict]:
    # Заголовки на Благовіст обычно заканчиваются ", 119." либо содержат "118."
    lines = [normalize(x) for x in section.splitlines() if normalize(x)]

    psalm_starts = []
    for i, line in enumerate(lines):
        for n in expected_numbers:
            if re.search(rf"(?:,\s*|\b){n}\.\s*$", line):
                # Исключаем строки стихов, которые случайно заканчиваются этим числом:
                if len(line) < 350:
                    psalm_starts.append((i, n))
                    break

    # Убираем дубли и сохраняем только ожидаемый порядок.
    dedup = []
    seen = set()
    for item in psalm_starts:
        if item[1] not in seen:
            dedup.append(item)
            seen.add(item[1])

    got = [n for _, n in dedup]
    if got != expected_numbers:
        raise ValueError(
            f"Не удалось выделить псалмы. Ожидалось {expected_numbers}, найдено {got}"
        )

    result = []
    for idx, (start_i, psalm_num) in enumerate(dedup):
        end_i = dedup[idx + 1][0] if idx + 1 < len(dedup) else len(lines)
        heading = lines[start_i]
        body = " ".join(lines[start_i + 1:end_i])

        # Слава на конце блока не должна попадать в стих.
        body = re.sub(r"\s*Сла́ва:\s*$", "", body).strip()

        title = re.sub(rf",\s*{psalm_num}\.\s*$", "", heading).strip()

        # Ищем нумерованные стихи. BeautifulSoup сохраняет superscript-номера
        # как обычный текст; поддерживаем варианты 1 Текст и ^{1}Текст.
        body = re.sub(r"\^\{(\d+)\}", r" \1 ", body)
        matches = list(re.finditer(r"(?<!\d)(\d{1,3})\s+", body))

        verses = []
        for j, m in enumerate(matches):
            vnum = int(m.group(1))
            vstart = m.end()
            vend = matches[j + 1].start() if j + 1 < len(matches) else len(body)
            text = normalize(body[vstart:vend])
            text = re.sub(r"\s*Сла́ва:\s*$", "", text).strip()
            if not text:
                continue
            verses.append({
                "number": vnum,
                "church_slavonic": text,
                "russian": "",
            })

        # Если верстка склеила первый номер со строкой, пробуем HTML-подобный маркер.
        if not verses:
            raise ValueError(f"Псалом {psalm_num}: стихи не распознаны")

        # Иногда номер заголовка входит в стих 1 у источника. Если первая запись
        # выглядит именно как надписание, переносим её в title.
        if verses and verses[0]["number"] == 1:
            t = verses[0]["church_slavonic"]
            # Для обычных псалмов стих 1 оставляем. Для надписаний характерны слова:
            if (
                psalm_num not in (118, 119, 120, 121, 122, 123, 124, 125, 126, 127,
                                  128, 129, 130, 131, 132, 133, 134, 135, 136, 137,
                                  138, 139, 140, 141, 142, 143, 144, 145, 146, 147,
                                  148, 149, 150)
                and len(t) < 180
                and any(w in t for w in ("Псало́м", "Пе́снь", "Моли́тва", "Аллилу́ия"))
            ):
                title = normalize(f"{title} {t}")
                verses = verses[1:]

        # Дубликаты номеров недопустимы.
        nums = [v["number"] for v in verses]
        if len(nums) != len(set(nums)):
            raise ValueError(f"Псалом {psalm_num}: дубли номеров стихов: {nums}")

        result.append({
            "number": psalm_num,
            "title_church_slavonic": title,
            "title_russian": "",
            "description": "",
            "verses": verses,
        })

    return result

def validate(k: int, psalms: list[dict]):
    expected = list(KATHISMA_RANGES[k])
    got = [p["number"] for p in psalms]
    if got != expected:
        raise ValueError(f"Кафизма {k}: псалмы {got}, ожидалось {expected}")

    for p in psalms:
        if not p["verses"]:
            raise ValueError(f"Псалом {p['number']} пуст")

        nums = [v["number"] for v in p["verses"]]
        if len(nums) != len(set(nums)):
            raise ValueError(f"Псалом {p['number']}: дубли номеров")

        for v in p["verses"]:
            t = v["church_slavonic"]
            if not t:
                raise ValueError(f"Псалом {p['number']}:{v['number']} пуст")
            if "Сла́ва:" in t:
                raise ValueError(f"Псалом {p['number']}:{v['number']} содержит Славу")
            if re.search(r"[eEќ]", t):
                raise ValueError(f"Псалом {p['number']}:{v['number']} содержит мусорный символ")

    if k == 17:
        p118 = psalms[0]
        verse_nums = {v["number"] for v in p118["verses"]}
        if 72 not in verse_nums or 131 not in verse_nums:
            raise ValueError(
                "Кафизма 17: не найдены стихи 72/131 для внутренних Слав"
            )

def build_one(k: int, cache_dir: Path, out_dir: Path, offline: bool):
    html = get_html(k, cache_dir, offline)
    section = select_civil_section(html, k)
    psalms = split_psalms(section, list(KATHISMA_RANGES[k]))
    validate(k, psalms)

    data = {
        "psalter": {
            "name": "Псалтирь",
            "slug": "psaltir",
            "description": "Псалтирь на церковнославянском языке гражданским шрифтом с ударениями.",
            "is_visible": True,
        },
        "kathismas": [{
            "number": k,
            "title": f"Кафизма {k}",
            "psalms": psalms,
            "glories": GLORIES[k],
        }]
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"psalter_kathisma_{k}.json"
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    print(
        f"Кафизма {k}: OK | псалмов {len(psalms)} | "
        f"стихов {sum(len(p['verses']) for p in psalms)} | {path}"
    )

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--kathismas",
        nargs="*",
        type=int,
        default=[16, 17, 18, 19, 20],
        help="Какие кафизмы собрать, по умолчанию 16 17 18 19 20",
    )
    parser.add_argument("--cache-dir", default="files/blagovist_cache")
    parser.add_argument("--out-dir", default="files")
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args()

    bad = [x for x in args.kathismas if x not in KATHISMA_RANGES]
    if bad:
        raise SystemExit(f"Поддерживаются только кафизмы 16-20. Ошибка: {bad}")

    for i, k in enumerate(args.kathismas):
        build_one(k, Path(args.cache_dir), Path(args.out_dir), args.offline)
        if i + 1 < len(args.kathismas):
            time.sleep(0.7)

if __name__ == "__main__":
    main()
