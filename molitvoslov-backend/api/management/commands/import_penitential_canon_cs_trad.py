"""Import the supplied penitential canon in Church-Slavonic-style spelling.

This is the user's Russian-language rendering in CS glyphs; it is NOT claimed
to be an independently verified Church Slavonic liturgical translation.

The final prayer of the uploaded source is truncated. By default --apply
REFUSES to write an incomplete canon. Explicit --allow-partial imports only
the 59 complete sections and leaves the unfinished prayer untouched.
"""
from __future__ import annotations

import unicodedata
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from api.models import CanonSection
from api.management.commands.import_penitential_canon_ru import (
    check_alignment,
    combine_glory_and_now,
    parse_source,
    select_canon,
)


DEFAULT_SOURCE = (
    Path(settings.BASE_DIR)
    / "api"
    / "data"
    / "canon_pokayan_ko_gospodu_cs_trad_20261117.txt"
)


def complete_final_prayer(text: str) -> bool:
    """Fail closed on truncated copy/paste, preserving the existing prayer."""
    simple = "".join(
        char for char in unicodedata.normalize("NFD", text)
        if not unicodedata.combining(char)
    ).strip()
    # The complete Russian prayer supplied earlier is >1000 characters.
    # Treat a very short traditional version or text lacking an ending as
    # incomplete, without inventing a missing continuation.
    return len(text) >= 600 and simple.endswith((".", "!", "?"))


def imported_entries(source: str):
    originals = parse_source(source)
    combined = combine_glory_and_now(originals)
    if len(originals) != 76 or len(combined) != 60:
        raise CommandError("Ожидалось 76 исходных и 60 объединённых фрагментов.")
    if combined[-1].kind != "prayer":
        raise CommandError("Последняя запись должна быть заключительной молитвой.")
    finished = complete_final_prayer(combined[-1].text)
    if not finished:
        # Keep the complete texts from the 59 preceding sections. The
        # truncated final prayer must never be written to the database.
        return originals, combined, combined[:-1], False
    return originals, combined, combined, True


class Command(BaseCommand):
    help = (
        "Записывает присланную версию Покаянного канона в Text.traditional_content "
        "существующих 60 секций; не изменяет ЦС и RU."
    )

    def add_arguments(self, parser):
        parser.add_argument("--input", default=str(DEFAULT_SOURCE))
        parser.add_argument(
            "--slug",
            default="kanon-pokayannyy-ko-gospodu-iisusu-khristu",
        )
        parser.add_argument("--apply", action="store_true")
        parser.add_argument(
            "--allow-partial",
            action="store_true",
            help="Явно разрешить импорт только 59 завершённых элементов.",
        )
        parser.add_argument(
            "--replace-existing",
            action="store_true",
            help="Разрешить замену уже заполненного traditional_content.",
        )

    def handle(self, *args, **options):
        source_path = Path(options["input"]).resolve()
        if not source_path.is_file():
            raise CommandError(f"Исходный файл не найден: {source_path}")
        original, all_entries, ready, complete = imported_entries(
            source_path.read_text(encoding="utf-8-sig")
        )
        canon = select_canon(options["slug"])
        title = canon.title.casefold()
        if "покаян" not in title or "иисус" not in title:
            raise CommandError("Выбран не Покаянный канон ко Господу Иисусу Христу.")

        variants = list(
            CanonSection.objects.filter(canon=canon)
            .order_by("variant").values_list("variant", flat=True).distinct()
        )
        if not variants:
            raise CommandError("В каноне нет элементов.")
        primary = min(variants)
        rows = list(
            CanonSection.objects.filter(canon=canon, variant=primary)
            .select_related("text").order_by("order", "pk")
        )
        errors = check_alignment(rows, all_entries)
        if errors:
            self.stderr.write("\n".join(errors[:35]))
            raise CommandError(
                "Несовпадение со структурой ЦС. Данные не записаны."
            )
        if len({row.text_id for row in rows}) != len(rows):
            raise CommandError("Несколько секций ссылаются на один Text.")
        if CanonSection.objects.filter(
            text_id__in=[row.text_id for row in rows]
        ).exclude(canon=canon, variant=primary).exists():
            raise CommandError("Некоторые Text общие для других канонов/вариантов.")

        if not complete:
            self.stdout.write(self.style.WARNING(
                "НЕПОЛНЫЙ ИСХОДНИК: заключительная молитва обрывается. "
                "59/60 элементов готовы; 60-й НЕ будет изменён."
            ))

        changes = [
            (row, entry) for row, entry in zip(rows, ready)
            if row.text.traditional_content != entry.text
        ]
        conflicting = [
            (row, entry) for row, entry in changes
            if (row.text.traditional_content or "").strip()
        ]
        self.stdout.write(
            f"Канон: {canon.title}; slug={canon.slug}; вариант={primary}\n"
            f"Разметка: {len(original)} источников -> {len(all_entries)} секций; "
            f"можно обновить: {len(changes)}/{len(ready)}; "
            f"заключительная молитва: {'полная' if complete else 'ОБОРВАНА'}"
        )
        if conflicting and not options["replace_existing"]:
            raise CommandError(
                f"{len(conflicting)} элементов уже имеют другое "
                "традиционное написание. Для замены нужно --replace-existing."
            )

        if not options["apply"]:
            self.stdout.write(
                self.style.WARNING("Только проверка. Django не изменён.")
            )
            return

        if not complete and not options["allow_partial"]:
            raise CommandError(
                "Полный импорт запрещён: последняя молитва обрывается. "
                "Для строго частичного импорта добавьте --allow-partial. "
                "После получения окончания молитвы импортируйте повторно."
            )

        with transaction.atomic():
            locked = list(
                CanonSection.objects.filter(canon=canon, variant=primary)
                .select_related("text").select_for_update()
                .order_by("order", "pk")
            )
            if len(locked) != len(rows) or (
                [row.pk for row in locked] != [row.pk for row in rows]
            ) or check_alignment(locked, all_entries):
                raise CommandError("Структура канона изменилась: отмена.")
            for row, entry in zip(locked, ready):
                before = (row.text.traditional_content or "")
                if (
                    before.strip() and before != entry.text
                    and not options["replace_existing"]
                ):
                    raise CommandError(
                        f"У секции {row.order} уже есть иной текст."
                    )
                if before != entry.text:
                    row.text.traditional_content = entry.text
                    row.text.save(update_fields=["traditional_content"])

        self.stdout.write(self.style.SUCCESS(
            f"Записано/обновлено {len(changes)} из {len(ready)} элементов. "
            f"ЦС, RU, секции и порядок не менялись."
        ))
        if not complete:
            self.stdout.write(self.style.WARNING(
                "60-й элемент (молитва) ещё не заполнен: "
                "нужен конец исходного файла."
            ))
