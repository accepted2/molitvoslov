"""Import the supplied Russian Penitential Canon as Text.translation.

Never creates a new Canon, never edits Church Slavonic or section identity.
Preflight validates the full source and the existing primary-variant structure.
Runs in dry-run mode unless --apply is explicitly supplied.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from api.models import Canon, CanonSection


DEFAULT_SOURCE = (
    Path(settings.BASE_DIR)
    / "api"
    / "data"
    / "canon_pokayan_ko_gospodu_ru_20261117.txt"
)

EXPECTED_GROUPS = (
    "Песнь 1",
    "Песнь 3",
    "Седален, глас 6-й",
    "Песнь 4",
    "Песнь 5",
    "Песнь 6",
    "Кондак",
    "Икос",
    "Песнь 7",
    "Песнь 8",
    "Песнь 9",
    "Молитва",
)
EXPECTED_GROUP_LENGTHS = (9, 9, 3, 9, 9, 9, 1, 1, 9, 7, 9, 1)
KIND_MAP = {
    "Ирмос": "irmos",
    "Припев": "refrain",
    "Тропарь": "troparion",
    "Слава": "glory",
    "И ныне": "now",
    "Слава и ныне": "glory_now",
    "Богородичен": "theotokion",
    "Седален": "sedalen",
    "Кондак": "kontakion",
    "Икос": "ikos",
    "Молитва": "prayer",
}
ENTRY_RE = re.compile(r"^(?:\[([^]]+)\]|\*\*([^*]+):\*\*)\s*(.+)$")
ODE_RE = re.compile(r"^Песнь ([1-9])$")


@dataclass(frozen=True)
class Entry:
    group: str
    kind: str
    text: str
    line: int

    @property
    def ode(self):
        match = ODE_RE.fullmatch(self.group)
        return int(match.group(1)) if match else None


def parse_source(source: str) -> list[Entry]:
    entries: list[Entry] = []
    groups: list[str] = []
    counts: dict[str, int] = {}
    current = None
    for number, raw in enumerate(source.splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("# ") and not line.startswith("## "):
            continue
        if line.startswith("## "):
            current = line[3:].strip()
            if current in groups:
                raise CommandError(f"Повтор заголовка {current!r}, строка {number}")
            groups.append(current)
            counts[current] = 0
            continue
        match = ENTRY_RE.fullmatch(line)
        if not match or not current:
            raise CommandError(f"Неверная разметка, строка {number}: {line[:100]}")
        caption = (match.group(1) or match.group(2)).strip()
        kind = KIND_MAP.get(caption)
        if not kind:
            raise CommandError(f"Неизвестный тип {caption!r}, строка {number}")
        value = match.group(3).strip()
        if not value:
            raise CommandError(f"Пустой текст, строка {number}")
        entries.append(Entry(current, kind, value, number))
        counts[current] += 1

    if tuple(groups) != EXPECTED_GROUPS:
        raise CommandError(
            "Неверные группы или порядок песней. Получено: " + repr(groups)
        )
    if tuple(counts[g] for g in groups) != EXPECTED_GROUP_LENGTHS:
        raise CommandError(
            "Неверное число элементов по группам: " + repr(counts)
        )
    if len(entries) != 76:
        raise CommandError(f"Ожидалось 76 элементов, найдено {len(entries)}")
    return entries


def combine_glory_and_now(entries: list[Entry]) -> list[Entry]:
    """Align the Russian editor's separate rubrics with Django's CS sections.

    Each ode has a combined 'Glory + next troparion' and
    'And now + next troparion' in one existing CanonSection. Only
    those exact adjacent pairs are joined; all source wording remains.
    Standalone post-sedalen 'Glory and now' stays a separate section.
    """
    merged: list[Entry] = []
    counts: dict[tuple[int, str], int] = {}
    index = 0
    while index < len(entries):
        entry = entries[index]
        if entry.ode is not None and entry.kind in {"glory", "now"}:
            following = entries[index + 1] if index + 1 < len(entries) else None
            if not following or following.kind != "troparion" or following.group != entry.group:
                raise CommandError(
                    f"После {entry.kind!r} в {entry.group} (строка {entry.line}) "
                    "ожидался тропарь того же песнопения."
                )
            merged.append(
                Entry(
                    group=entry.group,
                    kind=entry.kind,
                    text=entry.text + " " + following.text,
                    line=entry.line,
                )
            )
            counts[(entry.ode, entry.kind)] = (
                counts.get((entry.ode, entry.kind), 0) + 1
            )
            index += 2
        else:
            merged.append(entry)
            index += 1

    expected_odes = (1, 3, 4, 5, 6, 7, 8, 9)
    for ode in expected_odes:
        for kind in ("glory", "now"):
            if counts.get((ode, kind), 0) != 1:
                raise CommandError(
                    f"В песне {ode} ожидается одно объединение {kind}, "
                    f"получено {counts.get((ode, kind), 0)}."
                )
    if len(entries) != 76 or len(merged) != 60:
        raise CommandError(
            f"Неверное число фрагментов после объединения: "
            f"источник={len(entries)}, Django={len(merged)} (ожидается 76/60)."
        )
    return merged


def check_alignment(rows: list[CanonSection], entries: list[Entry]) -> list[str]:
    errors: list[str] = []
    if len(rows) != len(entries):
        errors.append(
            f"Число элементов различается: Django={len(rows)}, русский файл={len(entries)}"
        )
    for index, (row, entry) in enumerate(zip(rows, entries), 1):
        db_kind = row.section_type
        # The combined 'Слава и ныне' after the sedalen may be one
        # Church Slavonic GLORY or NOW section. Do not infer any other alias.
        compatible = (
            db_kind == entry.kind
            or entry.kind == "glory_now" and db_kind in {"glory", "now"}
        )
        ode_ok = row.ode_number == entry.ode
        if not compatible or not ode_ok:
            errors.append(
                f"#{index:02d} (строка {entry.line}):"
                f" RU={entry.group}/{entry.kind},"
                f" Django=order:{row.order}/ode:{row.ode_number}/"
                f"{db_kind}/heading:{row.heading[:45]!r}/"
                f"ЦС:{row.text.content[:55]!r}"
            )
    return errors


def select_canon(slug: str | None) -> Canon:
    if slug:
        canon = Canon.objects.filter(slug=slug).first()
        if not canon:
            raise CommandError(f"Канон со slug={slug!r} не найден.")
        return canon
    candidates = list(
        Canon.objects.filter(title__icontains="покаян")
        .filter(title__icontains="Иисус")
        .order_by("id")
    )
    if len(candidates) != 1:
        names = [f"{obj.slug} ({obj.title})" for obj in candidates]
        raise CommandError(
            f"Ожидался ровно один покаянный канон ко Христу, найдено {len(candidates)}. "
            f"Укажите --slug. Найдены: {names}"
        )
    return candidates[0]


class Command(BaseCommand):
    help = (
        "Привязывает русский перевод Покаянного канона к существующим "
        "элементам Django без изменения церковнославянского текста."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--input", default=str(DEFAULT_SOURCE),
            help="Исходный размеченный русский текст (UTF-8).",
        )
        parser.add_argument(
            "--slug", default=None,
            help="Точный slug существующего канона, если автоматический поиск неоднозначен.",
        )
        parser.add_argument(
            "--apply", action="store_true",
            help="Применить после проверки. Без этого параметра — только просмотр.",
        )
        parser.add_argument(
            "--replace-existing", action="store_true",
            help="Разрешить заменить отличающийся непустой русский перевод.",
        )

    def handle(self, *args, **options):
        input_path = Path(options["input"]).expanduser().resolve()
        if not input_path.is_file():
            raise CommandError(f"Русский файл не найден: {input_path}")
        original_entries = parse_source(input_path.read_text(encoding="utf-8-sig"))
        entries = combine_glory_and_now(original_entries)
        canon = select_canon(options["slug"])
        if "покаян" not in canon.title.casefold() or "иисус" not in canon.title.casefold():
            raise CommandError("Выбран не Покаянный канон ко Господу Иисусу Христу.")
        variants = list(
            CanonSection.objects.filter(canon=canon)
            .order_by("variant")
            .values_list("variant", flat=True)
            .distinct()
        )
        if not variants:
            raise CommandError("В каноне нет элементов.")
        primary = min(variants)
        rows = list(
            CanonSection.objects.filter(canon=canon, variant=primary)
            .select_related("text").order_by("order", "pk")
        )
        errors = check_alignment(rows, entries)
        if errors:
            self.stderr.write(
                f"Канон: {canon.title} (slug={canon.slug}), вариант {primary}."
            )
            self.stderr.write("\n".join(errors[:35]))
            self.stderr.write("Оригинал и переводы НЕ изменены.")
            raise CommandError("Сопоставление с ЦС-разметкой не прошло проверку.")

        if len({row.text_id for row in rows}) != len(rows):
            raise CommandError(
                "Некоторые элементы ссылаются на один Text. "
                "Импорт остановлен во избежание перезаписи соседних строк."
            )
        shared = (
            CanonSection.objects.filter(text_id__in=[row.text_id for row in rows])
            .exclude(canon=canon, variant=primary)
            .exists()
        )
        if shared:
            raise CommandError(
                "Некоторые Text используются в других канонах или вариантах."
            )

        conflicting = [
            (row, entry) for row, entry in zip(rows, entries)
            if row.text.translation.strip() and row.text.translation.strip() != entry.text
        ]
        if conflicting and not options["replace_existing"]:
            sample = "; ".join(
                f"order={row.order} ({row.section_type})"
                for row, _entry in conflicting[:10]
            )
            raise CommandError(
                f"Найдено {len(conflicting)} уже заполненных отличающихся переводов: "
                f"{sample}. Для осознанной замены добавьте --replace-existing."
            )

        changed = [
            (row, entry) for row, entry in zip(rows, entries)
            if row.text.translation != entry.text
        ]
        self.stdout.write(
            f"Канон: {canon.title}; slug={canon.slug}; вариант={primary}\n"
            f"Соответствие ЦС-разметке: {len(rows)}/{len(entries)}; "
            f"русских исходных фрагментов: {len(original_entries)}; "
            f"будет обновлено: {len(changed)}; без изменений: {len(rows) - len(changed)}"
        )
        if not options["apply"]:
            self.stdout.write(
                self.style.WARNING("ПРОВЕРКА: база не изменена. Применение: --apply")
            )
            return

        # Revalidate every source's current translation inside the transaction.
        with transaction.atomic():
            current = list(
                CanonSection.objects.filter(canon=canon, variant=primary)
                .select_related("text")
                .select_for_update()
                .order_by("order", "pk")
            )
            if check_alignment(current, entries):
                raise CommandError("Разметка изменилась во время импорта.")
            if [r.pk for r in current] != [r.pk for r in rows]:
                raise CommandError("Изменились элементы канона во время импорта.")
            for row, entry in zip(current, entries):
                if (row.text.translation.strip()
                    and row.text.translation.strip() != entry.text
                    and not options["replace_existing"]):
                    raise CommandError(
                        f"Русский текст элемента {row.order} уже изменён другим редактором."
                    )
                if row.text.translation != entry.text:
                    row.text.translation = entry.text
                    row.text.save(update_fields=["translation"])
        self.stdout.write(self.style.SUCCESS(
            f"ГОТОВО: {len(changed)} полей Text.translation обновлено. "
            f"Церковнославянские тексты и структура CanonSection не менялись."
        ))
        self.stdout.write(
            "Для офлайн-приложения отдельно экспортируйте обновлённый "
            "offlineContent.json из этой же базы и пересоберите APK."
        )
