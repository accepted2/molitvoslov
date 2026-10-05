from pathlib import Path

from bs4 import BeautifulSoup
from django.core.management.base import BaseCommand, CommandError
from django.db import connections, transaction

from api.models import PrayerRule, PrayerRuleItem
from api.vendor.cslavonic_ucs_decode import ucs_decode


RULE_SPECS = {
    "morning": {
        "slug": "molitvy-utrennie",
        "anchor": "1",
        "label": "Утренние молитвы",
    },
    "evening": {
        "slug": "molitvy-na-son-griadushchim",
        "anchor": "3",
        "label": "Вечерние молитвы",
    },
}


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


def parse_section_blocks(soup, anchor_name):
    heading = find_section_heading(soup, anchor_name)

    blocks = []
    current_title = ""
    current_paragraphs = []

    def flush():
        nonlocal current_title, current_paragraphs
        if not current_title and not current_paragraphs:
            return

        raw_content = "\n\n".join(current_paragraphs).strip()
        if raw_content:
            blocks.append(
                {
                    "raw_title": current_title,
                    "raw_content": raw_content,
                    "title": ucs_to_unicode(current_title),
                    "content": ucs_to_unicode(raw_content),
                }
            )

        current_title = ""
        current_paragraphs = []

    sibling = heading.find_next_sibling()

    while sibling is not None and sibling.name != "h2":
        if sibling.name == "h3":
            flush()
            current_title = clean_html_text(sibling)

        elif sibling.name == "p":
            value = clean_html_text(sibling)
            if value:
                current_paragraphs.append(value)

        sibling = sibling.find_next_sibling()

    flush()
    return blocks


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


class Command(BaseCommand):
    help = (
        "Импортирует церковнославянский текст утреннего и вечернего "
        "молитвенного правила из legacy UCS HTML. По умолчанию DRY-RUN. "
        "Русский и украинский переводы не изменяются."
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
            "--mapping",
            choices=["auto", "blocks", "paragraphs"],
            default="auto",
            help=(
                "Сопоставление с существующими Text-элементами. "
                "auto выбирает вариант только при точном совпадении количества."
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
            raise CommandError(
                "Book.html должен читаться как UTF-8."
            ) from error

        soup = BeautifulSoup(html, "html.parser")
        selected = (
            ["morning", "evening"]
            if options["rule"] == "both"
            else [options["rule"]]
        )

        plans = []
        for key in selected:
            plans.append(
                self._build_plan(
                    key=key,
                    soup=soup,
                    requested_mapping=options["mapping"],
                )
            )

        self.stdout.write("")
        self.stdout.write(
            self.style.MIGRATE_HEADING(
                "Церковнославянский UCS -> Unicode: молитвенные правила"
            )
        )

        for plan in plans:
            self._print_plan(plan)

        if options["dry_run"]:
            self.stdout.write("")
            self.stdout.write(
                self.style.WARNING(
                    "DRY-RUN завершён. Локальная база не изменена."
                )
            )
            return

        invalid = [plan for plan in plans if not plan["ready"]]
        if invalid:
            labels = ", ".join(plan["label"] for plan in invalid)
            raise CommandError(
                "APPLY остановлен: нет безопасного точного сопоставления для: "
                f"{labels}. Сначала пришлите вывод --dry-run."
            )

        with transaction.atomic():
            seen_text_values = {}

            for plan in plans:
                for source, item in zip(plan["source_rows"], plan["db_items"]):
                    text = item.text
                    new_content = source["content"]

                    previous = seen_text_values.get(text.pk)
                    if previous is not None and previous != new_content:
                        raise CommandError(
                            "Один и тот же Text используется в нескольких местах, "
                            "но источник даёт разные ЦС-тексты. "
                            f"Text id={text.pk}, item order={item.order}."
                        )

                    seen_text_values[text.pk] = new_content

                    changed_fields = []
                    if text.content != new_content:
                        text.content = new_content
                        changed_fields.append("content")

                    if text.language != "cu":
                        text.language = "cu"
                        changed_fields.append("language")

                    if changed_fields:
                        text.save(update_fields=changed_fields)

        updated = sum(
            1
            for plan in plans
            for source, item in zip(plan["source_rows"], plan["db_items"])
            if item.text.content == source["content"]
        )

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                "APPLY завершён. Церковнославянский Unicode-текст записан "
                f"в существующие Text без изменения translation/translation_uk. "
                f"Сопоставлено элементов: {updated}."
            )
        )

    def _build_plan(self, key, soup, requested_mapping):
        spec = RULE_SPECS[key]

        rule = (
            PrayerRule.objects
            .filter(slug=spec["slug"])
            .first()
        )
        if rule is None:
            raise CommandError(
                f'В локальной базе не найден PrayerRule slug="{spec["slug"]}".'
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

        block_rows = parse_section_blocks(soup, spec["anchor"])
        paragraph_rows = parse_section_paragraphs(soup, spec["anchor"])

        candidates = {
            "blocks": block_rows,
            "paragraphs": paragraph_rows,
        }

        mapping = requested_mapping
        if mapping == "auto":
            exact = [
                name
                for name, rows in candidates.items()
                if len(rows) == len(db_items)
            ]

            if len(exact) == 1:
                mapping = exact[0]
            elif len(exact) > 1:
                mapping = "blocks"
            else:
                mapping = ""

        source_rows = candidates.get(mapping, [])
        ready = bool(mapping) and len(source_rows) == len(db_items)

        return {
            "key": key,
            "label": spec["label"],
            "rule": rule,
            "db_items": db_items,
            "block_rows": block_rows,
            "paragraph_rows": paragraph_rows,
            "mapping": mapping or "none",
            "source_rows": source_rows,
            "ready": ready,
        }

    def _print_plan(self, plan):
        self.stdout.write("")
        self.stdout.write(self.style.HTTP_INFO(f'---- {plan["label"]} ----'))
        self.stdout.write(
            f'Rule: {plan["rule"].slug}; '
            f'Text-элементов в БД: {len(plan["db_items"])}; '
            f'блоков из HTML: {len(plan["block_rows"])}; '
            f'абзацев из HTML: {len(plan["paragraph_rows"])}.'
        )
        self.stdout.write(
            f'Сопоставление: {plan["mapping"]}; '
            f'готово к APPLY: {"ДА" if plan["ready"] else "НЕТ"}.'
        )

        if not plan["ready"]:
            return

        limit = min(8, len(plan["source_rows"]))
        for index in range(limit):
            source = plan["source_rows"][index]
            item = plan["db_items"][index]
            db_title = (
                item.text.title
                or item.text.description
                or f"Text #{item.text_id}"
            )
            source_title = source["title"] or "(без заголовка)"
            self.stdout.write(
                f'  {index + 1:02d}. DB order={item.order}: '
                f'{db_title}  <=  {source_title}'
            )

        if len(plan["source_rows"]) > limit:
            self.stdout.write(
                f'  ... и ещё {len(plan["source_rows"]) - limit}'
            )

    def _assert_local_sqlite(self):
        connection = connections["default"]
        if connection.vendor != "sqlite":
            raise CommandError(
                "Команда предназначена только для локальной SQLite. "
                f"Текущий default DB vendor: {connection.vendor}."
            )
