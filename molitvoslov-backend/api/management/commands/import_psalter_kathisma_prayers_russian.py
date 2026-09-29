import json
import re
import unicodedata
from pathlib import Path

from bs4 import BeautifulSoup
from django.conf import settings
from django.core.exceptions import FieldDoesNotExist
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Count

from api.models import Kathisma, Psalter


KATHISMA_MIN = 1
KATHISMA_MAX = 20


def normalize_spaces(text):
    text = str(text or "")
    text = text.replace("\xa0", " ")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def strip_liturgical_accents(text):
    """
    Убирает надстрочные ударения только для ПОИСКА.

    Важно: breve у 'й' сохраняем, чтобы слово 'помилуй'
    не превращалось в 'помилуи'.
    """
    result = []

    for char in unicodedata.normalize("NFD", str(text or "")):
        if unicodedata.category(char) == "Mn" and char != "\u0306":
            continue
        result.append(char)

    return unicodedata.normalize("NFC", "".join(result))


def normalize_search(text):
    text = strip_liturgical_accents(text)
    text = text.replace("–", "-").replace("—", "-")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def td_text(td):
    """
    Превращает содержимое <td> в обычный текст.

    Внутренние <em>, <strong>, <a>, <sup> нам для TextField
    не нужны, но их текст сохраняется.
    """
    if td is None:
        return ""

    text = " ".join(td.stripped_strings)
    return normalize_spaces(text)


def direct_tds(row):
    return row.find_all("td", recursive=False)


def find_after_kathisma_row(rows, number):
    pattern = re.compile(
        rf"\bПосле\s+кафизмы\s+{number}\b",
        re.IGNORECASE,
    )

    for index, row in enumerate(rows):
        cells = direct_tds(row)

        if len(cells) < 2:
            continue

        right = normalize_search(td_text(cells[1]))

        if pattern.search(right):
            return index

    return None


def find_next_kathisma_row(rows, start_index, next_number):
    """
    Находим заголовок следующей кафизмы.

    Заголовок обычно лежит в <td colspan="2">, но проверяем
    весь текст строки, чтобы не зависеть от конкретной разметки.
    """
    pattern = re.compile(
        rf"\bКафи[зс]ма\s+{next_number}\s*-?\s*я\b",
        re.IGNORECASE,
    )

    for index in range(start_index + 1, len(rows)):
        cells = direct_tds(rows[index])
        row_text = " ".join(td_text(cell) for cell in cells)
        row_text = normalize_search(row_text)

        if pattern.search(row_text):
            return index

    return None


def find_kathisma_20_end(rows, start_index):
    """
    После молитвы 20-й кафизмы в источнике начинается раздел
    «Молитвы по прочтении нескольких кафизм или всей Псалтири».
    """
    pattern = re.compile(
        r"\bМолитвы\s+по\s+прочтении\s+нескольких\s+кафизм\b",
        re.IGNORECASE,
    )

    for index in range(start_index + 1, len(rows)):
        cells = direct_tds(rows[index])
        row_text = " ".join(td_text(cell) for cell in cells)
        row_text = normalize_search(row_text)

        if pattern.search(row_text):
            return index

    return None


def find_troparion_row(block_rows):
    """
    Ищем первую русскую рубрику:
        Тропари, глас N
        Тропарь, глас N
    """
    pattern = re.compile(
        r"\bТропар(?:ь|и)\b[^0-9\n]{0,60}\bглас\s+(\d+)\b",
        re.IGNORECASE,
    )

    for relative_index, row in enumerate(block_rows):
        cells = direct_tds(row)

        if len(cells) < 2:
            continue

        right = normalize_search(td_text(cells[1]))
        match = pattern.search(right)

        if match:
            return relative_index, int(match.group(1))

    return None, None


def clean_paragraph(text):
    text = normalize_spaces(text)

    # Убираем случайные пробелы перед пунктуацией.
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)

    return text.strip()


def build_russian_block(rows, number):
    start_index = find_after_kathisma_row(rows, number)

    if start_index is None:
        raise CommandError(
            f"Кафизма {number}: не найден русский маркер " f"«После кафизмы {number}»."
        )

    if number < KATHISMA_MAX:
        end_index = find_next_kathisma_row(
            rows,
            start_index,
            number + 1,
        )
    else:
        end_index = find_kathisma_20_end(
            rows,
            start_index,
        )

    if end_index is None:
        raise CommandError(f"Кафизма {number}: не найдена граница конца блока.")

    block_rows = rows[start_index:end_index]

    troparion_relative_index, glas = find_troparion_row(block_rows)

    if troparion_relative_index is None:
        raise CommandError(
            f"Кафизма {number}: не найдена русская рубрика " f"«Тропарь/Тропари, глас ...»."
        )

    # В 1-й кафизме источник полностью расписывает Трисвятое
    # между заголовком и тропарями. В нашей модели prayers_after
    # это не нужно: сохраняем только краткую рубрику, как в ЦС-блоке.
    #
    # Для остальных кафизм заголовок и «Тропари, глас N» обычно
    # находятся в одной строке — это тоже приводим к общей структуре.
    paragraphs = [
        f"После кафизмы {number}. Трисвятое по Отче наш:",
        f"Тропари, глас {glas}:",
    ]

    for row in block_rows[troparion_relative_index + 1 :]:
        cells = direct_tds(row)

        if len(cells) < 2:
            continue

        right = clean_paragraph(td_text(cells[1]))

        if not right:
            continue

        paragraphs.append(right)

    text = "\n\n".join(paragraphs).strip()

    validate_russian_block(
        number=number,
        text=text,
        glas=glas,
    )

    return {
        "number": number,
        "glas": glas,
        "text": text,
        "source_start_row": start_index,
        "source_end_row": end_index,
    }


def validate_russian_block(number, text, glas):
    searchable = normalize_search(text)

    required_patterns = [
        (
            "заголовок после кафизмы",
            re.compile(
                rf"\bПосле\s+кафизмы\s+{number}\b",
                re.IGNORECASE,
            ),
        ),
        (
            "Тропарь/Тропари",
            re.compile(
                rf"\bТропар(?:ь|и)\b[^0-9\n]{{0,60}}" rf"\bглас\s+{glas}\b",
                re.IGNORECASE,
            ),
        ),
        (
            "Слава:",
            re.compile(r"\bСлава\s*:", re.IGNORECASE),
        ),
        (
            "И ныне:",
            re.compile(r"\bИ\s+ныне\s*:", re.IGNORECASE),
        ),
        (
            "Господи, помилуй (40)",
            re.compile(
                r"\bГосподи\s*,?\s*помилуй\s*\(\s*40\s*\)",
                re.IGNORECASE,
            ),
        ),
        (
            "молитва",
            re.compile(r"\bмолитв", re.IGNORECASE),
        ),
    ]

    errors = []

    for label, pattern in required_patterns:
        if not pattern.search(searchable):
            errors.append(label)

    if len(text) < 300:
        errors.append(f"слишком короткий блок ({len(text)} символов)")

    if number < KATHISMA_MAX:
        next_pattern = re.compile(
            rf"\bКафи[зс]ма\s+{number + 1}\b",
            re.IGNORECASE,
        )

        if next_pattern.search(searchable):
            errors.append("в текст попало начало следующей кафизмы")

    if errors:
        raise CommandError(f"Кафизма {number}: проверка не пройдена: " + "; ".join(errors))


def parse_source(source_path):
    """
    Возвращает 20 русских prayers_after из XHTML/HTML.

    Источник должен иметь таблицу:
        <td>церковнославянский</td>
        <td>русский</td>
    """
    raw = source_path.read_text(encoding="utf-8-sig")

    # Файл XHTML, поэтому XML-парсер предпочтительнее.
    # Если документ окажется слегка невалидным XML,
    # lxml/html всё равно позволяет его разобрать.
    try:
        soup = BeautifulSoup(raw, "xml")
        rows = soup.find_all("tr")

        if not rows:
            raise ValueError("XML parser returned no <tr>")
    except Exception:
        soup = BeautifulSoup(raw, "lxml")
        rows = soup.find_all("tr")

    if not rows:
        raise CommandError("В источнике не найдено ни одной строки <tr>.")

    result = []

    for number in range(KATHISMA_MIN, KATHISMA_MAX + 1):
        result.append(
            build_russian_block(
                rows=rows,
                number=number,
            )
        )

    if len(result) != 20:
        raise CommandError(f"Ожидалось 20 кафизм, получено {len(result)}.")

    numbers = [item["number"] for item in result]

    if numbers != list(range(1, 21)):
        raise CommandError(f"Неверный набор номеров кафизм: {numbers}")

    return result


def ensure_target_field_exists():
    try:
        Kathisma._meta.get_field("prayers_after_russian")
    except FieldDoesNotExist as exc:
        raise CommandError(
            "В модели Kathisma пока нет поля prayers_after_russian. "
            "Сначала добавьте TextField + миграцию. "
            "Режим --check-only можно использовать и без поля."
        ) from exc


def resolve_psalter(psalter_slug=None):
    if psalter_slug:
        try:
            return Psalter.objects.get(slug=psalter_slug)
        except Psalter.DoesNotExist as exc:
            raise CommandError(f"Псалтирь со slug={psalter_slug!r} не найдена.") from exc

    candidates = (
        Psalter.objects.annotate(kathisma_count=Count("kathismas", distinct=True))
        .filter(kathisma_count__gte=20)
        .order_by("id")
    )

    count = candidates.count()

    if count == 1:
        return candidates.first()

    if count == 0:
        raise CommandError(
            "Не найдена Псалтирь с 20 кафизмами. " "Укажите --psalter-slug после проверки данных."
        )

    raise CommandError(
        "Найдено несколько Псалтирей с 20+ кафизмами. " "Укажите нужную через --psalter-slug."
    )


def save_preview_json(output_path, source_path, parsed):
    payload = {
        "source": str(source_path),
        "count": len(parsed),
        "kathismas": [
            {
                "number": item["number"],
                "glas": item["glas"],
                "length": len(item["text"]),
                "prayers_after_russian": item["text"],
            }
            for item in parsed
        ],
    }

    output_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    output_path.write_text(
        json.dumps(
            payload,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


class Command(BaseCommand):
    help = (
        "Импортирует русский текст тропарей и молитв после "
        "20 кафизм из XHTML/HTML «Псалтирь по кафизмам "
        "с переводом и молитвами»."
    )

    def add_arguments(self, parser):
        default_source = Path(settings.BASE_DIR) / "files" / "psalter_azbyka_with_translation.html"

        default_json = Path(settings.BASE_DIR) / "files" / "psalter_kathisma_prayers_russian.json"

        parser.add_argument(
            "source_file",
            nargs="?",
            default=str(default_source),
            help=("Путь к XHTML/HTML. По умолчанию: " "files/psalter_azbyka_with_translation.html"),
        )

        parser.add_argument(
            "--json-output",
            default=str(default_json),
            help=(
                "Куда сохранить проверочный JSON. По умолчанию: "
                "files/psalter_kathisma_prayers_russian.json"
            ),
        )

        parser.add_argument(
            "--check-only",
            action="store_true",
            help=("Только распарсить и проверить все 20 кафизм. " "БД не изменяется."),
        )

        parser.add_argument(
            "--overwrite",
            action="store_true",
            help=(
                "Разрешить перезаписать уже заполненное "
                "prayers_after_russian. Без этого флага заполненные "
                "значения пропускаются."
            ),
        )

        parser.add_argument(
            "--psalter-slug",
            default=None,
            help=("Slug нужной Псалтири, если в БД их несколько."),
        )

    def handle(self, *args, **options):
        source_path = Path(options["source_file"]).expanduser().resolve()

        output_path = Path(options["json_output"]).expanduser().resolve()

        if not source_path.exists():
            raise CommandError(f"Файл-источник не найден: {source_path}")

        self.stdout.write(f"Источник: {source_path}")

        parsed = parse_source(source_path)

        save_preview_json(
            output_path=output_path,
            source_path=source_path,
            parsed=parsed,
        )

        self.stdout.write(self.style.SUCCESS(f"Парсинг: 20/20 OK"))

        for item in parsed:
            self.stdout.write(
                f"  Кафизма {item['number']:>2}: "
                f"глас {item['glas']}, "
                f"{len(item['text'])} символов"
            )

        self.stdout.write(f"Проверочный JSON: {output_path}")

        if options["check_only"]:
            self.stdout.write(self.style.SUCCESS("CHECK ONLY: БД не изменялась."))
            return

        ensure_target_field_exists()

        psalter = resolve_psalter(options.get("psalter_slug"))

        kathismas = {
            item.number: item
            for item in Kathisma.objects.filter(
                psalter=psalter,
                number__range=(
                    KATHISMA_MIN,
                    KATHISMA_MAX,
                ),
            )
        }

        missing = [number for number in range(1, 21) if number not in kathismas]

        if missing:
            raise CommandError("В БД отсутствуют кафизмы: " + ", ".join(map(str, missing)))

        updated = 0
        skipped = 0

        with transaction.atomic():
            for item in parsed:
                kathisma = kathismas[item["number"]]

                current = (kathisma.prayers_after_russian or "").strip()

                if current and not options["overwrite"]:
                    skipped += 1

                    self.stdout.write(
                        self.style.WARNING(
                            f"Кафизма {item['number']}: " "пропущена — русский текст уже заполнен."
                        )
                    )
                    continue

                kathisma.prayers_after_russian = item["text"]

                # КРИТИЧНО: обновляется только новое русское поле.
                # prayers_after, псалмы, стихи и другие данные
                # этот импортёр не сохраняет.
                kathisma.save(update_fields=["prayers_after_russian"])

                updated += 1

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(f"Готово. Обновлено: {updated}; " f"пропущено: {skipped}.")
        )

        self.stdout.write("Изменялось только " "Kathisma.prayers_after_russian.")
