"""Import aligned Russian and complete traditional-script texts of the
Theotokos Paraklesis canon into the existing Django Text rows.

The supplied traditional text was completed after an earlier partial import.
Dry run by default. --traditional-only writes only traditional_content and
preserves translation, content, IDs, order, and headings.
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

DATA_DIR = Path(settings.BASE_DIR) / "api" / "data"
RU_SOURCE = DATA_DIR / "canon_bogoroditse_prilezhno_ru_20261117.txt"
CS_SOURCE = DATA_DIR / "canon_bogoroditse_prilezhno_csl_20261117.txt"

ENTRY_PATTERN = re.compile(r"^(?:\[([^\]]+)\]|\*\*([^*]+):\*\*)\s+(.+)$")
RU_ODE = re.compile(r"^Песнь\s+([1-9])$", flags=re.I)


@dataclass(frozen=True)
class Entry:
    group: int
    heading: str
    kind: str
    ode: int | None
    text: str
    line: int


def normalize(value: str) -> str:
    result = "".join(
        c for c in unicodedata.normalize("NFD", value)
        if not unicodedata.combining(c)
    )
    return result.casefold().replace("҃", "").replace("ѣ", "е").replace("і", "и").replace("ѵ", "и").strip()


def detect_kind(label: str) -> str:
    clean = normalize(label)
    compact = re.sub(r"[\s,.:;\-]+", "", clean)
    if compact.startswith("славаи") or compact.startswith("славаины"):
        return "glory_now"
    if compact.startswith("слава"):
        return "glory"
    if compact.startswith("иные") or compact.startswith("иныне"):
        return "now"
    if compact.startswith("ирмос"):
        return "irmos"
    if compact.startswith("припев"):
        return "refrain"
    if compact.startswith("тропар"):
        return "troparion"
    if compact.startswith("богородичен") or compact.startswith("бгородичен") or compact.startswith("бгородичен"):
        return "theotokion"
    if compact.startswith("кондак"):
        return "kontakion"
    if compact.startswith("стихир"):
        return "stichira"
    if compact.startswith("псалом") or compact.startswith("ѱалом"):
        return "psalm"
    if compact.startswith("молитв") or compact.startswith("млтва"):
        return "prayer"
    raise CommandError(f"Неизвестный тип фрагмента {label!r}")


def parse_source(raw: str, *, traditional: bool = False) -> list[Entry]:
    group_index = -1
    group_heading = ""
    ode = None
    entries: list[Entry] = []
    for line_number, raw_line in enumerate(raw.splitlines(), 1):
        line = raw_line.strip()
        if not line or line.startswith("# ") and not line.startswith("## "):
            continue
        if line.startswith(("## ", "### ")):
            level = 4 if line.startswith("### ") else 3
            group_heading = line[level:].strip()
            group_index += 1
            ru_ode = RU_ODE.fullmatch(group_heading) if not traditional else None
            if ru_ode:
                ode = int(ru_ode.group(1))
            elif traditional and group_heading.startswith("Пѣ́снь"):
                # Source is aligned by group number with Russian source.
                ode = {
                    3: 1, 4: 3, 5: 4, 6: 5, 7: 6,
                    9: 7, 10: 8, 11: 9,
                }.get(group_index)
            else:
                ode = None
            continue
        match = ENTRY_PATTERN.fullmatch(line)
        if not match or group_index < 0:
            raise CommandError(f"Неверная строка {line_number}: {line[:90]}")
        kind = detect_kind(match.group(1) or match.group(2))
        entries.append(Entry(
            group_index, group_heading, kind, ode, match.group(3).strip(), line_number
        ))
    return entries


def combine_doxologies(entries: list[Entry]) -> list[Entry]:
    result: list[Entry] = []
    i = 0
    while i < len(entries):
        entry = entries[i]
        if entry.ode is not None and entry.kind in ("glory", "now"):
            nxt = entries[i + 1] if i + 1 < len(entries) else None
            if nxt is None or nxt.group != entry.group or nxt.kind != "troparion":
                raise CommandError(
                    f"После {entry.kind} в строке {entry.line} отсутствует тропарь."
                )
            result.append(Entry(
                entry.group, entry.heading, entry.kind, entry.ode,
                entry.text + " " + nxt.text, entry.line,
            ))
            i += 2
        else:
            result.append(entry)
            i += 1
    return result


def parse_and_validate(ru_raw: str, cs_raw: str):
    ru_original = parse_source(ru_raw)
    cs_original = parse_source(cs_raw, traditional=True)
    if len(ru_original) != 93 or len(cs_original) != 93:
        raise CommandError(
            "Для полного импорта необходимы 93 исходных фрагмента в обеих версиях; "
            f"получено RU={len(ru_original)}, ЦС-трад={len(cs_original)}. "
            "Частичный источник запрещено записывать."
        )
    if len({e.group for e in ru_original}) != 14 or len({e.group for e in cs_original}) != 14:
        raise CommandError("Неверное количество содержательных разделов канона.")
    for i, (ru, cs) in enumerate(zip(ru_original, cs_original), 1):
        if (ru.group, ru.kind, ru.ode) != (cs.group, cs.kind, cs.ode):
            raise CommandError(
                f"Смещение ЦС от RU в элементе #{i}: "
                f"{ru.group}/{ru.kind}/{ru.ode} "
                f"!= {cs.group}/{cs.kind}/{cs.ode}. Никаких изменений."
            )
    if (
        ru_original[-1].kind != "prayer"
        or cs_original[-1].kind != "prayer"
        or not cs_original[-1].text.endswith("Гдⷭ҇ь съ Тобо́ю.")
    ):
        raise CommandError("Заключительная молитва ЦС-трад не полная.")
    ru_merged = combine_doxologies(ru_original)
    cs_merged = combine_doxologies(cs_original)
    if len(ru_merged) != 77 or len(cs_merged) != 77:
        raise CommandError(
            f"Объединённая структура неверна: RU={len(ru_merged)}/77, "
            f"ЦС={len(cs_merged)}/77."
        )
    for i, (ru, cs) in enumerate(zip(ru_merged, cs_merged), 1):
        if (ru.group, ru.kind, ru.ode) != (cs.group, cs.kind, cs.ode):
            raise CommandError(
                f"Смещение объединённых текстов #{i}: "
                f"{ru.group}/{ru.kind}/{ru.ode} != "
                f"{cs.group}/{cs.kind}/{cs.ode}."
            )
    return ru_original, ru_merged, cs_merged


def section_compatible(row, entry: Entry) -> bool:
    """Match the existing liturgical structure without changing its records.

    Two explicit importer conventions differ from the supplied text:
    1. The opening prayer is a troparion of the Theotokos (tone 4).
    2. The tone-2 troparion AFTER ode 3 is outside the ode numeration.
    Require the source position, heading AND Church Slavonic opening for
    these two exceptions so an unrelated row cannot be accepted by accident.
    """
    expected_kind = entry.kind
    actual_kind = row.section_type
    compatible = (
        actual_kind == expected_kind
        or expected_kind in {"stichira", "psalm"} and actual_kind == "other"
        or expected_kind == "glory_now" and actual_kind in {"glory", "now", "other"}
    )
    ode_ok = entry.ode is None or row.ode_number == entry.ode
    if compatible and ode_ok:
        return True

    title = normalize(row.heading or "")
    csl = normalize(row.text.content or "")
    if (
        entry.group == 0
        and entry.kind == "prayer"
        and entry.ode is None
        and actual_kind == "troparion"
        and row.ode_number is None
        and int(row.order) == 1
        and "богород" in title
        and "глас" in title
        and "4" in title
        and csl.startswith("к богородице прилежно")
    ):
        return True
    if (
        entry.group == 4
        and entry.kind == "troparion"
        and entry.ode == 3
        and actual_kind == "troparion"
        and row.ode_number is None
        and int(row.order) == 22
        and title.startswith("тропар")
        and "глас" in title
        and "2" in title
        and csl.startswith("моление теплое")
    ):
        return True
    return False


def alignment_errors(rows, entries: list[Entry]) -> list[str]:
    errors = []
    if len(rows) != len(entries):
        errors.append(
            f"Разное количество: существующих секций Django={len(rows)} "
            f"и объединённых русских фрагментов={len(entries)}"
        )
    for n, (row, entry) in enumerate(zip(rows, entries), 1):
        if not section_compatible(row, entry):
            errors.append(
                f"#{n:02d}: RU={entry.heading}/{entry.kind}/ode:{entry.ode} "
                f"→ Django={row.order}/{row.section_type}/ode:{row.ode_number}/"
                f"heading:{row.heading[:45]!r}/ЦС:{row.text.content[:45]!r}"
            )
    return errors


def find_target(slug: str | None) -> Canon:
    if slug:
        obj = Canon.objects.filter(slug=slug).first()
        if not obj:
            raise CommandError(f"Канон со slug {slug!r} не найден.")
        if "богород" not in normalize(obj.title):
            raise CommandError("Указанный канон не относится к Богородице.")
        return obj

    candidates = list(Canon.objects.filter(title__icontains="Богород"))
    if len(candidates) == 1:
        return candidates[0]
    names = "\n".join(f"  --slug={v.slug}  {v.title}" for v in candidates[:40])
    raise CommandError(
        "Канон не определён однозначно. Запустите с --slug, "
        "выбрав именно канон Феостирикта:\n" + (names or "Кандидатов нет.")
    )


def target_field_values(
    ru_text: str, traditional_text: str | None,
    *, traditional_only: bool = False,
) -> dict[str, str]:
    """Build only the fields explicitly requested by the import mode."""
    values = {} if traditional_only else {"translation": ru_text}
    if traditional_text is not None:
        values["traditional_content"] = traditional_text
    return values


class Command(BaseCommand):
    help = "Безопасный импорт полного RU и ЦС-трад канона Феостирикта."

    def add_arguments(self, parser):
        parser.add_argument("--slug", default=None)
        parser.add_argument("--ru", default=str(RU_SOURCE))
        parser.add_argument("--cs", default=str(CS_SOURCE))
        parser.add_argument("--apply", action="store_true")
        parser.add_argument("--allow-partial-csl", action="store_true",
            help="Совместимость со старой командой; при полном источнике импортируются 77/77.")
        parser.add_argument("--traditional-only", action="store_true",
            help="Обновлять исключительно traditional_content, сохраняя русский перевод.")
        parser.add_argument("--replace-existing", action="store_true")

    def handle(self, *args, **options):
        ru_path = Path(options["ru"])
        cs_path = Path(options["cs"])
        if not ru_path.is_file() or not cs_path.is_file():
            raise CommandError("Не найдены исходные файлы RU и ЦС из api/data.")
        originals, ru_entries, cs_entries = parse_and_validate(
            ru_path.read_text(encoding="utf-8-sig"),
            cs_path.read_text(encoding="utf-8-sig"),
        )
        canon = find_target(options["slug"])
        variants = list(
            CanonSection.objects.filter(canon=canon)
            .values_list("variant", flat=True).distinct().order_by("variant")
        )
        if not variants:
            raise CommandError("В каноне нет секций.")
        primary_variant = min(variants)
        all_rows = list(
            CanonSection.objects.filter(canon=canon, variant=primary_variant)
            .select_related("text").order_by("order", "pk")
        )
        # The Django importer may keep empty title-only "other" sections.
        # They are presentation headings, not hymns; never write over them.
        def is_empty_heading(row):
            return (row.section_type == "other"
                    and bool((row.heading or "").strip())
                    and not (row.text.content or "").strip())

        rows = [row for row in all_rows if not is_empty_heading(row)]
        errors = alignment_errors(rows, ru_entries)
        if errors:
            self.stderr.write("\n".join(errors[:40]))
            self.stderr.write(
                "Ни одна строка не изменена. Нужна корректировка "
                "сопоставления существующих секций."
            )
            raise CommandError("Сопоставление с Django не пройдено.")
        if len({row.text_id for row in rows}) != len(rows):
            raise CommandError("Один Text используется несколькими секциями.")
        if CanonSection.objects.filter(
            text_id__in=[row.text_id for row in rows]
        ).exclude(canon=canon, variant=primary_variant).exists():
            raise CommandError("Text используются в других канонах/вариантах.")

        traditional_only = bool(options["traditional_only"])
        # The fully completed source now contains all 77 sections. Existing
        # calls with --allow-partial-csl remain accepted for compatibility.
        include_traditional = traditional_only or bool(options["allow_partial_csl"])
        targets = [
            (row, ru.text, cs_entries[i].text if include_traditional else None)
            for i, (row, ru) in enumerate(zip(rows, ru_entries))
        ]
        conflicting = [
            (row, field)
            for row, ru_text, cs_text in targets
            for field, new_value in target_field_values(
                ru_text, cs_text, traditional_only=traditional_only
            ).items()
            if new_value is not None
            and (getattr(row.text, field) or "").strip()
            and getattr(row.text, field) != new_value
        ]
        changes = [
            (row, field, value)
            for row, ru_text, cs_text in targets
            for field, value in target_field_values(
                ru_text, cs_text, traditional_only=traditional_only
            ).items()
            if value is not None and getattr(row.text, field) != value
        ]
        self.stdout.write(
            f"Канон: {canon.title}; slug={canon.slug}; вариант={primary_variant}; "
            f"отдельных заголовков без текста: {len(all_rows)-len(rows)}\n"
            f"RU: {len(originals)} исходных → {len(ru_entries)} секций; "
            f"ЦС-трад: {len(cs_entries)} из {len(ru_entries)} секций (полный канон).\n"
            f"Режим: {'только ЦС-трад' if traditional_only else 'RU + по запросу ЦС-трад'}.\n"
            f"Отличающихся текстовых полей для обновления: {len(changes)}. "
            f"Конфликтов: {len(conflicting)}."
        )
        if conflicting and not options["replace_existing"]:
            sample = ", ".join(
                f"{row.order}:{field}" for row, field in conflicting[:15]
            )
            raise CommandError(
                "Уже заполненные отличающиеся переводы: " + sample +
                ". Для замены явно задайте --replace-existing."
            )
        if not options["apply"]:
            self.stdout.write(self.style.WARNING(
                "ПРОВЕРКА: база не изменена. "
                "Для записи только ЦС-трад: --apply --traditional-only."
            ))
            return

        with transaction.atomic():
            locked_all = list(
                CanonSection.objects.filter(
                    canon=canon, variant=primary_variant,
                ).select_related("text").select_for_update().order_by("order", "pk")
            )
            locked = [r for r in locked_all if not is_empty_heading(r)]
            if [r.pk for r in locked] != [r.pk for r in rows] or alignment_errors(
                locked, ru_entries,
            ):
                raise CommandError("Структура изменилась до записи — отменено.")
            for i, row in enumerate(locked):
                cs_value = cs_entries[i].text if include_traditional else None
                values = target_field_values(
                    ru_entries[i].text, cs_value,
                    traditional_only=traditional_only,
                )
                updated = {}
                for field, value in values.items():
                    before = getattr(row.text, field)
                    if before == value:
                        continue
                    if before.strip() and not options["replace_existing"]:
                        raise CommandError(f"Другой редактор обновил {row.order}:{field}.")
                    updated[field] = value
                for key, value in updated.items():
                    setattr(row.text, key, value)
                if updated:
                    row.text.save(update_fields=list(updated))

        self.stdout.write(self.style.SUCCESS(
            ("ГОТОВО: ЦС-трад полностью заполнен (77/77); "
             "русский и основной ЦС не изменены."
             if traditional_only else
             "ГОТОВО: русский перевод обновлён. " +
             ("Полный ЦС-трад также обновлён (77/77)."
              if include_traditional else "ЦС-трад не изменён."))
        ))
