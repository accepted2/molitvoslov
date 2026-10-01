from collections import defaultdict

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils.text import slugify

from api.calendar_models import CalendarDay, CalendarFastType


FAST_FIELDS = [
    "fast_type_title",
    "fast_name",
    "fast_description",
    "fast_type_title_uk",
    "fast_name_uk",
    "fast_description_uk",
]


def has_any_fast_data(day):
    return bool(
        (day.fast_type_code or "").strip()
        or any((getattr(day, field) or "").strip() for field in FAST_FIELDS)
    )


def make_code(day):
    existing = (day.fast_type_code or "").strip()
    if existing:
        return existing

    basis = (
        (day.fast_name or "").strip()
        or (day.fast_type_title or "").strip()
        or (day.fast_name_uk or "").strip()
        or (day.fast_type_title_uk or "").strip()
        or f"calendar-fast-{day.pk}"
    )

    slug = slugify(basis, allow_unicode=False)
    return f"manual-{slug or day.pk}"


def completeness_score(day):
    score = 0

    if (day.fast_type_code or "").strip():
        score += 5

    for field in FAST_FIELDS:
        value = (getattr(day, field) or "").strip()
        if value:
            score += 1
            if field.endswith("description"):
                score += min(len(value) // 80, 5)

    return score


class Command(BaseCommand):
    help = (
        "Один раз создаёт CalendarFastType из уже существующих полей поста "
        "в CalendarDay и привязывает дни к созданным типам поста."
    )

    def add_arguments(self, parser):
        mode = parser.add_mutually_exclusive_group(required=True)

        mode.add_argument(
            "--dry-run",
            action="store_true",
            help="Только показать, что будет создано и привязано.",
        )

        mode.add_argument(
            "--apply",
            action="store_true",
            help="Создать типы поста и привязать дни.",
        )

        parser.add_argument(
            "--force",
            action="store_true",
            help=(
                "Разрешить запуск, даже если CalendarFastType уже содержит записи. "
                "Без --force команда защищает уже отредактированный справочник."
            ),
        )

    def handle(self, *args, **options):
        existing_fast_types = CalendarFastType.objects.count()

        if existing_fast_types and not options["force"]:
            raise CommandError(
                f"CalendarFastType уже содержит записей: {existing_fast_types}. "
                "Чтобы случайно не перезаписать ручные правки, команда остановлена. "
                "Если это осознанно — повторите с --force."
            )

        days = list(
            CalendarDay.objects
            .select_related("fast_type")
            .order_by("date_gregorian")
        )

        source_days = [day for day in days if has_any_fast_data(day)]

        if not source_days:
            raise CommandError(
                "В CalendarDay не найдено ни одного дня с существующими данными поста."
            )

        groups = defaultdict(list)

        for day in source_days:
            groups[make_code(day)].append(day)

        self.stdout.write(f"Дней с данными поста: {len(source_days)}")
        self.stdout.write(f"Уникальных типов/кодов поста: {len(groups)}")
        self.stdout.write("")

        planned = []
        warnings = []

        for order, code in enumerate(sorted(groups), start=1):
            group = groups[code]
            representative = max(group, key=completeness_score)

            values = {
                field: (getattr(representative, field) or "").strip()
                for field in FAST_FIELDS
            }

            variants = {}

            for field in FAST_FIELDS:
                non_empty = sorted(
                    {
                        (getattr(day, field) or "").strip()
                        for day in group
                        if (getattr(day, field) or "").strip()
                    }
                )

                if len(non_empty) > 1:
                    variants[field] = non_empty

            if variants:
                warnings.append((code, variants))

            planned.append(
                {
                    "code": code,
                    "order": order,
                    "values": values,
                    "days": group,
                    "representative": representative,
                }
            )

            label = (
                values["fast_name"]
                or values["fast_type_title"]
                or values["fast_name_uk"]
                or values["fast_type_title_uk"]
                or code
            )

            self.stdout.write(
                f"- {code}: {label} — дней {len(group)}"
            )

        if warnings:
            self.stdout.write("")
            self.stdout.write(
                self.style.WARNING(
                    f"Найдены различающиеся тексты внутри одинакового кода: {len(warnings)}"
                )
            )

            for code, variants in warnings[:20]:
                self.stdout.write(self.style.WARNING(f"  {code}:"))

                for field, values in variants.items():
                    self.stdout.write(
                        self.style.WARNING(
                            f"    {field}: {len(values)} вариантов"
                        )
                    )

            if len(warnings) > 20:
                self.stdout.write(
                    self.style.WARNING(
                        f"  ... и ещё {len(warnings) - 20}"
                    )
                )

        if options["dry_run"]:
            self.stdout.write("")
            self.stdout.write(
                self.style.WARNING(
                    "DRY-RUN: ничего не создано и дни не изменены."
                )
            )
            return

        created = 0
        updated = 0
        linked = 0

        with transaction.atomic():
            for item in planned:
                values = item["values"]

                fast_type, was_created = CalendarFastType.objects.update_or_create(
                    code=item["code"],
                    defaults={
                        "type_title": values["fast_type_title"],
                        "name": values["fast_name"],
                        "description": values["fast_description"],
                        "type_title_uk": values["fast_type_title_uk"],
                        "name_uk": values["fast_name_uk"],
                        "description_uk": values["fast_description_uk"],
                        "order": item["order"],
                        "is_active": True,
                    },
                )

                if was_created:
                    created += 1
                else:
                    updated += 1

                for day in item["days"]:
                    if day.fast_type_id != fast_type.id:
                        day.fast_type = fast_type
                        day.save(update_fields=["fast_type"])
                        linked += 1

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                "Готово. "
                f"Создано типов поста: {created}. "
                f"Обновлено существующих: {updated}. "
                f"Привязано дней: {linked}."
            )
        )

        if warnings:
            self.stdout.write(
                self.style.WARNING(
                    "Важно: для некоторых одинаковых кодов в исходных днях были "
                    "разные тексты. В справочник взят наиболее заполненный вариант. "
                    "Проверьте такие типы поста в админке."
                )
            )
