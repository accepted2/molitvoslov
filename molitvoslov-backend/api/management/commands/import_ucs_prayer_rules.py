import difflib
import re
import unicodedata
from pathlib import Path

from bs4 import BeautifulSoup
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connections, transaction

from api.models import PrayerRule, PrayerRuleItem
from api.sqlite_backup import create_sqlite_backup
from api.vendor.cslavonic_ucs_decode import ucs_decode


RULE_SPECS = {
    "morning": {
        "slug": "molitvy-utrennie",
        "anchor": "1",
        "label": "Утренние молитвы",
        "expected_paragraphs": 38,
    },
    "evening": {
        "slug": "molitvy-na-son-griadushchim",
        "anchor": "3",
        "label": "Вечерние молитвы",
        "expected_paragraphs": 27,
    },
}

# Эти элементы есть в нашей базе, но отсутствуют в данном Book.html.
# Их traditional_content импортёр намеренно не трогает.
EXPECTED_UNMAPPED_ORDERS = {
    # В Book.html эти две краткие поминальные молитвы есть, но их редакция
    # заметно отличается от текста, который уже принят в нашей базе.
    # Поэтому их traditional_content намеренно не заполняем этим источником.
    "morning": {36, 37, 41, 42, 46},
    "evening": {6, 32, 33},
}

SIMILARITY_THRESHOLD = 0.55

HISTORIC_CHAR_MAP = str.maketrans(
    {
        "ѣ": "е",
        "і": "и",
        "ї": "и",
        "ѵ": "и",
        "ѳ": "ф",
        "ѕ": "з",
        "є": "е",
        "ѡ": "о",
        "ѻ": "о",
        "ѽ": "о",
        "ꙍ": "о",
        "ѿ": "от",
        "ꙋ": "у",
        "ѹ": "у",
        "ᲂ": "у",
        "ꙗ": "я",
        "ѧ": "я",
        "ꙙ": "я",
        "ѫ": "у",
        "ѯ": "кс",
        "ѱ": "пс",
        "ъ": "",
    }
)


def clean_html_text(tag):
    return " ".join(tag.get_text(" ", strip=True).split()).strip()


def ucs_to_unicode(value):
    value = str(value or "")
    if not value:
        return ""

    try:
        raw = value.encode("cp1251")
    except UnicodeEncodeError as error:
        bad = value[error.start : error.end]
        raise CommandError(
            "UCS-текст содержит символ, который нельзя представить в cp1251: "
            f"{bad!r}."
        ) from error

    converted, _length = ucs_decode(raw)
    return converted.strip()


def normalize_for_similarity(value):
    value = unicodedata.normalize("NFD", str(value or "").lower())
    value = value.translate(HISTORIC_CHAR_MAP)
    value = "".join(
        char
        for char in value
        if unicodedata.category(char) not in {"Mn", "Me"}
    )
    value = re.sub(r"[^а-яё]+", "", value)
    return value


def similarity(left, right):
    a = normalize_for_similarity(left)
    b = normalize_for_similarity(right)

    if not a or not b:
        return 0.0

    return difflib.SequenceMatcher(None, a, b, autojunk=False).ratio()


def find_section_heading(soup, anchor_name):
    anchor = soup.find("a", attrs={"name": str(anchor_name)})
    if anchor is None:
        raise CommandError(f"В HTML не найден раздел с anchor={anchor_name!r}.")

    heading = anchor.find_parent("h2")
    if heading is None:
        raise CommandError(
            f"Anchor {anchor_name!r} найден, но не находится внутри <h2>."
        )

    return heading


def parse_section_paragraphs(soup, anchor_name):
    heading = find_section_heading(soup, anchor_name)

    rows = []
    current_title = ""
    sibling = heading.find_next_sibling()

    while sibling is not None and sibling.name != "h2":
        if sibling.name == "h3":
            current_title = clean_html_text(sibling)

        elif sibling.name == "p":
            raw_content = clean_html_text(sibling)
            if raw_content:
                rows.append(
                    {
                        "raw_title": current_title,
                        "raw_content": raw_content,
                        "title": ucs_to_unicode(current_title),
                        "content": ucs_to_unicode(raw_content),
                    }
                )

        sibling = sibling.find_next_sibling()

    return rows


def find_common_preinitial_raw(soup):
    """
    В утреннем/вечернем разделах этого издания стоит другая редакция
    предначинательной молитвы ("Господи Иисусе Христе, Сыне Божий...").

    Наша база использует:
    "Молитвами святых отец наших, Господи Иисусе Христе, Боже наш..."

    Та же самая редакция присутствует в Book.html в начале раздела
    "Три канона" (anchor=4), поэтому берём её оттуда и используем для
    общего Text, который разделяют утреннее и вечернее правила.
    """
    rows = parse_section_paragraphs(soup, "4")
    if not rows:
        raise CommandError(
            "Не найден источник для общей предначинательной молитвы "
            "в разделе anchor=4."
        )

    raw = rows[0]["raw_content"]
    start_marker = "Мlтвами с™hхъ nтє1цъ нaшихъ"
    end_marker = "Слaва тебЁ"

    if start_marker not in raw:
        raise CommandError(
            "Предначинательная молитва в anchor=4 имеет неожиданную редакцию."
        )

    return _between(
        raw,
        start_marker,
        end_marker,
        "Общая предначинательная молитва",
    )


def _paragraph(rows, number):
    try:
        return rows[number - 1]["raw_content"]
    except IndexError as error:
        raise CommandError(
            f"В источнике отсутствует ожидаемый абзац #{number}."
        ) from error


def _before(value, marker, label):
    pos = value.find(marker)
    if pos < 0:
        raise CommandError(f"{label}: не найден маркер {marker!r}.")
    return value[:pos].strip()


def _from(value, marker, label):
    pos = value.find(marker)
    if pos < 0:
        raise CommandError(f"{label}: не найден маркер {marker!r}.")
    return value[pos:].strip()


def _between(value, start_marker, end_marker, label):
    start = value.find(start_marker)
    if start < 0:
        raise CommandError(f"{label}: не найден маркер {start_marker!r}.")

    end = value.find(end_marker, start + len(start_marker))
    if end < 0:
        raise CommandError(f"{label}: не найден маркер {end_marker!r}.")

    return value[start:end].strip()


def _split_at_starts(value, starts, label):
    positions = []
    for marker in starts:
        pos = value.find(marker)
        if pos < 0:
            raise CommandError(f"{label}: не найден маркер {marker!r}.")
        positions.append(pos)

    if positions != sorted(positions):
        raise CommandError(f"{label}: маркеры идут в неожиданном порядке.")

    parts = []
    for index, start in enumerate(positions):
        end = positions[index + 1] if index + 1 < len(positions) else len(value)
        parts.append(value[start:end].strip())

    return parts


def _strip_morning_instruction(raw, paragraph_number):
    if paragraph_number == 2:
        marker = "Посeмъ пост0й"
        pos = raw.find(marker)
        return raw[:pos].strip() if pos >= 0 else raw

    if paragraph_number == 3:
        marker = "Тaже начни2"
        pos = raw.find(marker)
        return raw[:pos].strip() if pos >= 0 else raw

    if paragraph_number == 36:
        marker = "Ѓще м0жеши"
        pos = raw.find(marker)
        return raw[:pos].strip() if pos >= 0 else raw

    return raw


def build_morning_raw_map(rows, common_preinitial):
    if len(rows) != RULE_SPECS["morning"]["expected_paragraphs"]:
        raise CommandError(
            "Утренние молитвы: структура Book.html изменилась. "
            f"Ожидалось 38 абзацев, найдено {len(rows)}."
        )

    result = {}

    direct = {
        2: 2,
        4: 3,
        6: 5,
        7: 6,
        8: 7,
        9: 8,
        10: 9,
        12: 12,
        13: 13,
        14: 14,
        17: 16,
        18: 17,
        19: 18,
        20: 19,
        21: 20,
        22: 21,
        23: 22,
        24: 23,
        25: 24,
        26: 25,
        27: 26,
        28: 27,
        29: 28,
        30: 29,
        31: 30,
        32: 31,
        33: 32,
        34: 33,
        35: 34,
        45: 38,
    }

    for order, paragraph_number in direct.items():
        result[order] = _strip_morning_instruction(
            _paragraph(rows, paragraph_number),
            paragraph_number,
        )

    # Общий Text предначинательной молитвы берём из другой части того же
    # Book.html, где редакция совпадает с принятой в нашей базе.
    result[5] = common_preinitial

    # В нашей базе "Господи, помилуй. (Трижды). Слава, и ныне:"
    # является одним Text, а в Book.html славословие расписано полностью.
    result[11] = (
        _paragraph(rows, 10).strip()
        + " Слaва, и3 нhнэ:"
    )

    # Абзац "И ныне..." заканчивается отдельным "Господи, помилуй. (12)".
    p15 = _paragraph(rows, 15)
    mercy_marker = "ГDи, поми1луй."
    mercy_pos = p15.rfind(mercy_marker)
    if mercy_pos < 0:
        raise CommandError("Утренние #15: не найдено окончание 'ГDи, поми1луй.'.")

    result[15] = p15[:mercy_pos].strip()
    result[16] = p15[mercy_pos:].strip()

    # В базе окончание разделено на "Достойно есть..." и
    # сокращённое "Слава, и ныне: Господи, помилуй. (Трижды)".
    p37 = _paragraph(rows, 37)
    glory_marker = "Слaва nц7Y"
    result[39] = _before(p37, glory_marker, "Утренние #37")

    mercy_pos = p37.rfind(mercy_marker)
    if mercy_pos < 0:
        raise CommandError("Утренние #37: не найдено 'ГDи, поми1луй.'.")

    result[44] = "Слaва, и3 нhнэ: " + p37[mercy_pos:].strip()

    return result


def build_evening_raw_map(rows, common_preinitial):
    if len(rows) != RULE_SPECS["evening"]["expected_paragraphs"]:
        raise CommandError(
            "Вечерние молитвы: структура Book.html изменилась. "
            f"Ожидалось 27 абзацев, найдено {len(rows)}."
        )

    result = {}

    # Общее начало в Book.html собрано в крупные абзацы,
    # а в нашей базе хранится отдельными Text.
    p1 = _paragraph(rows, 1)
    parts = _split_at_starts(
        p1,
        [
            "Во и4мz",
            "ГDи ї}се",
            "Слaва тебЁ",
            "ЦRю2 нбcный",
            "С™hй б9е",
        ],
        "Вечерние #1",
    )
    for order, part in zip([1, 2, 3, 4, 8], parts):
        result[order] = part

    # order=2 использует тот же Text, что и утреннее order=5.
    # В самом вечернем разделе редакция иная, поэтому подставляем
    # совпадающую редакцию из anchor=4.
    result[2] = common_preinitial

    p2 = _paragraph(rows, 2)
    trinity_marker = "Прес™az трbце"
    mercy_marker = "ГDи, поми1луй."

    result[9] = _before(p2, trinity_marker, "Вечерние #2")
    result[10] = _between(
        p2,
        trinity_marker,
        mercy_marker,
        "Вечерние #2",
    )
    result[11] = _from(p2, mercy_marker, "Вечерние #2") + " Слaва, и3 нhнэ:"

    p3 = _paragraph(rows, 3)
    result[12] = _from(p3, "Џ§е нaшъ", "Вечерние #3")

    p4 = _paragraph(rows, 4)
    glory_marker = "Слaва nц7Y"
    now_marker = "И# нhнэ"
    second_prayer_marker = "ГDи, поми1луй нaсъ"
    mercy_door_marker = "Млcрдіz двє1ри"

    result[13] = _before(p4, glory_marker, "Вечерние #4")
    result[14] = (
        "Слaва: "
        + _between(
            p4,
            second_prayer_marker,
            now_marker,
            "Вечерние #4",
        )
    )

    final_mercy_pos = p4.rfind(mercy_marker)
    if final_mercy_pos < 0:
        raise CommandError("Вечерние #4: не найдено последнее 'ГDи, поми1луй.'.")

    door_pos = p4.find(mercy_door_marker)
    if door_pos < 0 or door_pos >= final_mercy_pos:
        raise CommandError("Вечерние #4: не найден блок 'Млcрдіz двє1ри...'.")

    result[15] = "И# нhнэ: " + p4[door_pos:final_mercy_pos].strip()
    result[16] = p4[final_mercy_pos:].strip()

    # Молитвы 1–11, кондак и молитва Иоанникия.
    for paragraph_number, order in zip(range(5, 18), range(17, 30)):
        result[order] = _paragraph(rows, paragraph_number)

    # Окончание: в БД "Достойно есть..." и "Слава, и ныне..." раздельно.
    p18 = _paragraph(rows, 18)
    result[30] = _before(p18, glory_marker, "Вечерние #18")

    final_mercy_pos = p18.rfind(mercy_marker)
    if final_mercy_pos < 0:
        raise CommandError("Вечерние #18: не найдено 'ГDи, поми1луй.'.")

    result[35] = "Слaва, и3 нhнэ: " + p18[final_mercy_pos:].strip()

    result[36] = _paragraph(rows, 19)
    result[43] = _paragraph(rows, 20)
    result[44] = _paragraph(rows, 21)
    result[45] = _paragraph(rows, 22)
    result[38] = _paragraph(rows, 23)

    # Абзац 24 ("Просвети очи мои..." и тропари) отдельного элемента
    # в нашей текущей базе не имеет, поэтому не импортируется.
    result[40] = _paragraph(rows, 25)
    result[42] = _paragraph(rows, 26)
    result[47] = _paragraph(rows, 27)

    return result


class Command(BaseCommand):
    help = (
        "Импортирует традиционный церковнославянский текст утреннего и "
        "вечернего молитвенного правила из legacy UCS HTML в "
        "Text.traditional_content. Русский, украинский и основной "
        "церковнославянский Text.content не изменяются."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "html_path",
            help="Путь к Book.html с UCS-текстом.",
        )
        parser.add_argument(
            "--rule",
            choices=["morning", "evening", "both"],
            default="both",
            help="Какое правило обработать. По умолчанию both.",
        )
        parser.add_argument(
            "--backup-dir",
            default="",
            help=(
                "Каталог backup перед APPLY. "
                "По умолчанию <backend>/backups/sqlite."
            ),
        )

        mode = parser.add_mutually_exclusive_group(required=True)
        mode.add_argument("--dry-run", action="store_true")
        mode.add_argument("--apply", action="store_true")

    def handle(self, *args, **options):
        self._assert_local_sqlite()

        html_path = Path(options["html_path"]).expanduser().resolve()
        if not html_path.exists():
            raise CommandError(f"Файл не найден: {html_path}")

        try:
            html = html_path.read_text(encoding="utf-8")
        except UnicodeDecodeError as error:
            raise CommandError("Book.html должен читаться как UTF-8.") from error

        soup = BeautifulSoup(html, "html.parser")
        selected = (
            ["morning", "evening"]
            if options["rule"] == "both"
            else [options["rule"]]
        )

        plans = [
            self._build_plan(key=key, soup=soup)
            for key in selected
        ]

        self.stdout.write("")
        self.stdout.write(
            self.style.MIGRATE_HEADING(
                "Церковнославянский UCS -> Unicode: traditional_content"
            )
        )

        for plan in plans:
            self._print_plan(plan)

        invalid = [plan for plan in plans if not plan["ready"]]

        if options["dry_run"]:
            self.stdout.write("")
            if invalid:
                self.stdout.write(
                    self.style.WARNING(
                        "DRY-RUN завершён. База не изменена. "
                        "Есть элементы с низкой уверенностью — APPLY заблокирован."
                    )
                )
            else:
                self.stdout.write(
                    self.style.SUCCESS(
                        "DRY-RUN завершён. База не изменена. "
                        "Все сопоставления прошли проверку."
                    )
                )
            return

        if invalid:
            labels = ", ".join(plan["label"] for plan in invalid)
            raise CommandError(
                "APPLY остановлен: есть небезопасные сопоставления для: "
                f"{labels}. Сначала пришлите вывод --dry-run."
            )

        self._backup(options["backup_dir"])

        with transaction.atomic():
            seen_text_values = {}

            for plan in plans:
                for row in plan["mapped"]:
                    text = row["item"].text
                    new_value = row["traditional"]

                    previous = seen_text_values.get(text.pk)
                    if previous is not None and previous != new_value:
                        raise CommandError(
                            "Один и тот же Text используется в нескольких местах, "
                            "но источник даёт разные traditional_content. "
                            f"Text id={text.pk}, item order={row['order']}."
                        )

                    seen_text_values[text.pk] = new_value

                    if text.traditional_content != new_value:
                        text.traditional_content = new_value
                        text.save(update_fields=["traditional_content"])

        changed = sum(
            1
            for plan in plans
            for row in plan["mapped"]
            if row["changed"]
        )

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                "APPLY завершён. Изменено traditional_content: "
                f"{changed}. Поля content/translation/translation_uk не тронуты."
            )
        )

    def _build_plan(self, key, soup):
        spec = RULE_SPECS[key]

        rule = PrayerRule.objects.filter(slug=spec["slug"]).first()
        if rule is None:
            raise CommandError(
                f'В локальной базе не найден PrayerRule slug="{spec["slug"]}".'
            )

        rows = parse_section_paragraphs(soup, spec["anchor"])
        common_preinitial = find_common_preinitial_raw(soup)
        raw_map = (
            build_morning_raw_map(rows, common_preinitial)
            if key == "morning"
            else build_evening_raw_map(rows, common_preinitial)
        )

        db_items = list(
            rule.items
            .filter(
                item_type=PrayerRuleItem.TYPE_TEXT,
                text__isnull=False,
            )
            .select_related("text")
            .order_by("order", "id")
        )
        by_order = {item.order: item for item in db_items}

        missing_orders = sorted(set(raw_map) - set(by_order))
        if missing_orders:
            raise CommandError(
                f"{spec['label']}: в БД отсутствуют ожидаемые Text-порядки: "
                + ", ".join(map(str, missing_orders))
            )

        mapped = []
        for order in sorted(raw_map):
            item = by_order[order]
            traditional = ucs_to_unicode(raw_map[order])
            score = similarity(item.text.content, traditional)

            mapped.append(
                {
                    "order": order,
                    "item": item,
                    "traditional": traditional,
                    "score": score,
                    "safe": score >= SIMILARITY_THRESHOLD,
                    "changed": item.text.traditional_content != traditional,
                }
            )

        actual_unmapped = {
            item.order
            for item in db_items
            if item.order not in raw_map
        }
        expected_unmapped = EXPECTED_UNMAPPED_ORDERS[key]

        unexpected_unmapped = sorted(actual_unmapped - expected_unmapped)
        missing_expected_unmapped = sorted(expected_unmapped - actual_unmapped)

        ready = (
            all(row["safe"] for row in mapped)
            and not unexpected_unmapped
            and not missing_expected_unmapped
        )

        return {
            "key": key,
            "label": spec["label"],
            "rule": rule,
            "rows": rows,
            "db_items": db_items,
            "mapped": mapped,
            "actual_unmapped": sorted(actual_unmapped),
            "unexpected_unmapped": unexpected_unmapped,
            "missing_expected_unmapped": missing_expected_unmapped,
            "ready": ready,
        }

    def _print_plan(self, plan):
        unsafe = [row for row in plan["mapped"] if not row["safe"]]
        changed = [row for row in plan["mapped"] if row["changed"]]

        self.stdout.write("")
        self.stdout.write(self.style.HTTP_INFO(f'---- {plan["label"]} ----'))
        self.stdout.write(
            f'Rule: {plan["rule"].slug}; '
            f'абзацев источника: {len(plan["rows"])}; '
            f'Text-элементов в БД: {len(plan["db_items"])}; '
            f'сопоставлено: {len(plan["mapped"])}; '
            f'будет изменено: {len(changed)}.'
        )
        self.stdout.write(
            "Не импортируются из этой редакции и будут сохранены как есть: "
            + (
                ", ".join(map(str, plan["actual_unmapped"]))
                if plan["actual_unmapped"]
                else "нет"
            )
        )

        if plan["unexpected_unmapped"]:
            self.stdout.write(
                self.style.ERROR(
                    "Неожиданно не сопоставлены DB order: "
                    + ", ".join(map(str, plan["unexpected_unmapped"]))
                )
            )

        if plan["missing_expected_unmapped"]:
            self.stdout.write(
                self.style.ERROR(
                    "Ожидаемые необрабатываемые order изменились: "
                    + ", ".join(map(str, plan["missing_expected_unmapped"]))
                )
            )

        if unsafe:
            self.stdout.write(
                self.style.WARNING(
                    "Низкая уверенность. Эти элементы НЕ дают разрешить APPLY:"
                )
            )
            for row in unsafe:
                text = row["item"].text
                label = text.title or text.description or f"Text #{text.pk}"
                self.stdout.write(
                    f'  order={row["order"]:>2} '
                    f'similarity={row["score"]:.3f} | {label}'
                )

        self.stdout.write(
            f'Готово к APPLY: {"ДА" if plan["ready"] else "НЕТ"}.'
        )

    def _backup(self, backup_dir):
        database = settings.DATABASES["default"]
        source_path = Path(database["NAME"])
        output_dir = (
            Path(backup_dir).expanduser()
            if backup_dir
            else Path(settings.BASE_DIR) / "backups" / "sqlite"
        )

        try:
            destination, digest = create_sqlite_backup(
                source_path,
                output_dir,
            )
        except Exception as error:
            raise CommandError(
                f"Не удалось создать backup перед APPLY: {error}"
            ) from error

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("Резервная копия создана."))
        self.stdout.write(f"Файл: {destination}")
        self.stdout.write(f"SHA256: {digest}")

    def _assert_local_sqlite(self):
        connection = connections["default"]
        if connection.vendor != "sqlite":
            raise CommandError(
                "Команда предназначена только для локальной SQLite. "
                f"Текущий default DB vendor: {connection.vendor}."
            )
