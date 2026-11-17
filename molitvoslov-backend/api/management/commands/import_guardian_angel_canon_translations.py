"""Safely import the complete Guardian Angel canon (Russian and traditional
Church Slavonic) into EXISTING CanonSection/Text records.

Dry-run by default. Preserve original Church Slavonic, record IDs, headings,
order, and translations outside the explicitly chosen mode. After the user's
final-prayer continuation, both versions have 65 aligned complete sections.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from api.models import Canon, CanonSection

DATA = Path(settings.BASE_DIR) / "api" / "data"
RU_PATH = DATA / "canon_angelu_khranitelyu_ru_20261117.txt"
TRAD_PATH = DATA / "canon_angelu_khranitelyu_trad_20261117.txt"
EXPECTED_ODE_BY_GROUP = {2: 1, 3: 3, 5: 4, 6: 5, 7: 6, 10: 7, 11: 8, 12: 9}
RUBRIC = re.compile(r"^(?:\[([^\]]+)\]|\*\*([^*]+):\*\*)\s+(.+)$")


def normalize(value: str) -> str:
    value = "".join(
        char for char in unicodedata.normalize("NFD", value)
        if not unicodedata.combining(char)
    )
    value = value.lower().translate(str.maketrans({
        "і": "и", "ї": "и", "ѣ": "е", "ѳ": "ф",
        "ѡ": "о", "ѻ": "о", "ꙋ": "у", "ѵ": "и",
    }))
    return re.sub(r"\s+", " ", value).strip()


def rubric_type(label: str) -> str:
    name = re.sub(r"[\s.,:;–—\-]+", "", normalize(label))
    for prefix, kind in (
        ("славаи", "glory_now"),
        ("слава", "glory"),
        ("иныне", "now"),
        ("ирмос", "irmos"),
        ("припев", "refrain"),
        ("тропар", "troparion"),
        ("бгородичен", "theotokion"),
        ("богородичен", "theotokion"),
        ("седален", "sedalen"),
        ("кондак", "kontakion"),
        ("икос", "ikos"),
        ("молитв", "prayer"),
        ("млтва", "prayer"),
        ("иису", "jesus"),
    ):
        if name.startswith(prefix):
            return kind
    raise CommandError(f"Неизвестная рубрика: {label!r}")


@dataclass(frozen=True)
class Segment:
    kind: str
    text: str
    group: int
    ode: int | None
    heading: str
    line: int


def parse_source(raw: str, *, traditional: bool) -> list[Segment]:
    result: list[Segment] = []
    group = -1
    ode: int | None = None
    heading = ""
    for lineno, value in enumerate(raw.lstrip("\ufeff").splitlines(), 1):
        line = value.strip()
        if not line or (line.startswith("# ") and not line.startswith("## ")):
            continue
        if line.startswith(("## ", "### ")):
            group += 1
            heading = line[4:] if line.startswith("### ") else line[3:]
            ode = EXPECTED_ODE_BY_GROUP.get(group)
            if ode is not None:
                normalized = normalize(heading)
                if not normalized.startswith(("песнь", "песн")):
                    raise CommandError(f"Ожидалась песнь №{ode} в строке {lineno}.")
                if not traditional and not re.fullmatch(
                    rf"песнь\s+{ode}", normalized
                ):
                    raise CommandError(f"Неверный номер песни в строке {lineno}.")
            elif line.startswith("### "):
                raise CommandError(f"Лишняя песнь в строке {lineno}.")
            continue
        match = RUBRIC.fullmatch(line)
        if match is None or group < 0:
            raise CommandError(f"Неверная строка {lineno}: {line[:100]}")
        result.append(
            Segment(
                rubric_type(match.group(1) or match.group(2)),
                match.group(3).strip(),
                group, ode, heading, lineno,
            )
        )
    if group != 13:
        raise CommandError(f"Ожидалось 14 разделов, получено {group+1}.")
    return result


def merge_doxologies(source: list[Segment]) -> list[Segment]:
    merged: list[Segment] = []
    i = 0
    while i < len(source):
        segment = source[i]
        if segment.ode is not None and segment.kind in {"glory", "now"}:
            following = source[i+1] if i+1 < len(source) else None
            if following is None or (
                following.kind != "troparion"
                or following.group != segment.group
            ):
                raise CommandError(
                    f"За {segment.kind} в строке {segment.line} не следует тропарь."
                )
            merged.append(Segment(
                segment.kind, segment.text+" "+following.text,
                segment.group, segment.ode, segment.heading, segment.line,
            ))
            i += 2
        else:
            merged.append(segment)
            i += 1
    return merged


def parse_and_validate(ru_source: str, traditional_source: str):
    ru = parse_source(ru_source, traditional=False)
    trad = parse_source(traditional_source, traditional=True)
    if len(ru) != 81 or len(trad) != 81:
        raise CommandError(f"Нужно 81+81 частей, получено {len(ru)}+{len(trad)}.")
    for index, (r, c) in enumerate(zip(ru, trad), 1):
        if (r.kind, r.group, r.ode) != (c.kind, c.group, c.ode):
            raise CommandError(
                f"Несовпадение RU/ЦС в части #{index}: "
                f"{r.kind}/{r.group}/{r.ode} != {c.kind}/{c.group}/{c.ode}"
            )
    if ru[-1].kind != "prayer" or not ru[-1].text.endswith("Аминь."):
        raise CommandError("Русская молитва неполная.")
    if (
        trad[-1].kind != "prayer"
        or not trad[-1].text.startswith("А҆́гг҃ле Хрⷭ҇то́въ")
        or not trad[-1].text.endswith("А҆ми́нь.")
        or len(trad[-1].text) < 1300
    ):
        raise CommandError("Заключительная ЦС-трад молитва неполная или отличается от источника.")

    ru_ready = merge_doxologies(ru)
    trad_ready = merge_doxologies(trad)
    if len(ru_ready) != 65 or len(trad_ready) != 65:
        raise CommandError(
            f"После объединения ожидалось 65/65; "
            f"получено RU={len(ru_ready)}, ЦС-трад={len(trad_ready)}."
        )
    if [
        (x.kind, x.group, x.ode) for x in ru_ready
    ] != [
        (x.kind, x.group, x.ode) for x in trad_ready
    ]:
        raise CommandError("Смещение RU и ЦС после объединения.")
    return ru, ru_ready, trad_ready

def empty_heading_only(row) -> bool:
    return (
        row.section_type == "other"
        and bool((row.heading or "").strip())
        and not bool((row.text.content or "").strip())
    )


def compatible(row, expected: Segment) -> bool:
    kind = row.section_type
    ode = row.ode_number
    if expected.ode is not None and ode != expected.ode:
        return False
    if expected.kind == "glory_now":
        return kind in {"glory", "now", "other"}
    if expected.kind == "jesus":
        # Two special invocations "Господи Иисусе Христе..." (odes 1, 9)
        # can be stored as refrain or "other"; never accept unrelated texts.
        if expected.ode not in (1, 9) or kind not in {"refrain", "other", "troparion"}:
            return False
        source = normalize(row.text.content)
        label = normalize(row.heading)
        return "иису" in source or "иису" in label or (
            "гд" in source[:20] and "хр" in source[:45]
        )
    if expected.kind == "theotokion":
        return kind in {"theotokion", "troparion"}
    return kind == expected.kind


def alignment_errors(rows, ready: list[Segment]) -> list[str]:
    errors = []
    if len(rows) != len(ready):
        errors.append(
            f"Число текстовых секций Django={len(rows)}, "
            f"по исходнику RU={len(ready)}"
        )
    for index, (row, expected) in enumerate(zip(rows, ready), 1):
        if not compatible(row, expected):
            errors.append(
                f"#{index:02d} RU={expected.heading}/{expected.kind}/"
                f"ode={expected.ode} -> DB order={row.order}, "
                f"kind={row.section_type}, ode={row.ode_number}, "
                f"heading={row.heading[:55]!r}, "
                f"ЦС={row.text.content[:65]!r}"
            )
    return errors


def target_canon(slug: str | None) -> Canon:
    if slug:
        obj = Canon.objects.filter(slug=slug).first()
        if obj is None:
            raise CommandError(f"Канон slug={slug} не найден.")
        if not ("ангел" in normalize(obj.title)
                and "хранител" in normalize(obj.title)):
            raise CommandError("По slug выбран не канон Ангелу Хранителю.")
        return obj
    # Do not depend on SQLite's limited casefolding for Cyrillic LIKE.
    candidates = [
        canon for canon in Canon.objects.all().only("id", "title", "slug")
        if "ангел" in normalize(canon.title)
        and "хранител" in normalize(canon.title)
    ]
    if len(candidates) != 1:
        options = "\n".join(
            f"  --slug={canon.slug}  {canon.title}" for canon in candidates
        )
        raise CommandError(
            "Неоднозначный канон Ангелу Хранителю. "
            "Укажи --slug из списка:\n"+(options or "(совпадений нет)")
        )
    return candidates[0]


class Command(BaseCommand):
    help = "Безопасный RU/ЦС-трад импорт полного канона Ангелу Хранителю (65+65)."

    def add_arguments(self, parser):
        parser.add_argument("--slug", default=None)
        parser.add_argument("--ru", default=str(RU_PATH))
        parser.add_argument("--trad", default=str(TRAD_PATH))
        parser.add_argument("--apply", action="store_true")
        parser.add_argument("--traditional-only", action="store_true")
        parser.add_argument("--allow-partial-csl", action="store_true")
        parser.add_argument("--replace-existing", action="store_true")

    def handle(self, *args, **options):
        ru_path = Path(options["ru"])
        trad_path = Path(options["trad"])
        if not ru_path.is_file() or not trad_path.is_file():
            raise CommandError("Не найдены файлы RU и ЦС-трад в api/data.")
        _, ru_ready, trad_ready = parse_and_validate(
            ru_path.read_text(encoding="utf-8-sig"),
            trad_path.read_text(encoding="utf-8-sig"),
        )
        traditional_only = bool(options["traditional_only"])
        partial = bool(options["allow_partial_csl"])
        # Legacy --allow-partial-csl is accepted, but the complete
        # source is now always validated as 65/65 before ANY write.
        include_traditional = traditional_only or partial
        canon = target_canon(options["slug"])
        variants = list(
            CanonSection.objects.filter(canon=canon)
            .values_list("variant", flat=True).distinct()
        )
        if not variants:
            raise CommandError("У канона нет секций.")
        variant = min(variants)
        all_rows = list(
            CanonSection.objects.filter(canon=canon, variant=variant)
            .select_related("text").order_by("order", "pk")
        )
        rows = [row for row in all_rows if not empty_heading_only(row)]
        problems = alignment_errors(rows, ru_ready)
        if problems:
            self.stderr.write("\n".join(problems[:45]))
            raise CommandError("Не удалось сопоставить секции; база НЕ изменена.")
        if len({row.text_id for row in rows}) != len(rows):
            raise CommandError("У нескольких секций общий Text: импорт отменён.")
        if CanonSection.objects.filter(
            text_id__in=[row.text_id for row in rows]
        ).exclude(canon=canon, variant=variant).exists():
            raise CommandError("Text используются другими канонами/вариантами.")

        target = []
        for i, row in enumerate(rows):
            updates = {}
            if not traditional_only:
                updates["translation"] = ru_ready[i].text
            if include_traditional:
                updates["traditional_content"] = trad_ready[i].text
            target.append((row, updates))

        changes = [
            (row, field) for row, updates in target
            for field, value in updates.items()
            if getattr(row.text, field) != value
        ]
        conflicts = [
            (row, field) for row, updates in target
            for field, value in updates.items()
            if (getattr(row.text, field) or "").strip()
            and getattr(row.text, field) != value
        ]
        self.stdout.write(
            f"Канон: {canon.title}; slug={canon.slug}; вариант={variant}\n"
            f"RU: 81 исходный фрагмент -> 65 секций (полный перевод)\n"
            f"ЦС-трад: 81 исходный фрагмент -> 65 секций (полный текст).\n"
            f"Дополнительных пустых заголовков: {len(all_rows) - len(rows)}. "
            f"Режим: {'только ЦС-трад' if traditional_only else 'RU'+(' + ЦС-трад' if include_traditional else '')}.\n"
            f"Изменений: {len(changes)}; конфликтов: {len(conflicts)}."
        )
        if conflicts and not options["replace_existing"]:
            labels = ", ".join(
                f"{row.order}:{field}" for row, field in conflicts[:22]
            )
            raise CommandError(
                "Ранее заполненные поля отличаются: " + labels +
                ". Проверь до --replace-existing."
            )
        if not options["apply"]:
            self.stdout.write(self.style.WARNING(
                "ПРОВЕРКА: база не изменена."
            ))
            return
        with transaction.atomic():
            locked_all = list(
                CanonSection.objects.filter(canon=canon, variant=variant)
                .select_related("text").select_for_update()
                .order_by("order", "pk")
            )
            locked = [row for row in locked_all if not empty_heading_only(row)]
            if [row.pk for row in locked] != [row.pk for row in rows]:
                raise CommandError("Секции были изменены. Транзакция отменена.")
            if alignment_errors(locked, ru_ready):
                raise CommandError("Структура изменилась. Транзакция отменена.")
            for row, updates in zip(locked, (u for _, u in target)):
                changed = {}
                for field, value in updates.items():
                    previous = getattr(row.text, field)
                    if previous == value:
                        continue
                    if (previous or "").strip() and not options["replace_existing"]:
                        raise CommandError(
                            f"Параллельная правка {row.order}:{field}, отмена."
                        )
                    changed[field] = value
                for field, value in changed.items():
                    setattr(row.text, field, value)
                if changed:
                    row.text.save(update_fields=list(changed))
        self.stdout.write(self.style.SUCCESS(
            ("ГОТОВО: ЦС-трад заполнен 65/65, RU не изменён. "
             if traditional_only else
             "ГОТОВО: русский перевод обработан 65/65. " +
             ("ЦС-трад заполнен 65/65. " if include_traditional else
              "ЦС-трад не изменён. ")) +
            "Основной ЦС и остальные каноны не менялись."
        ))
