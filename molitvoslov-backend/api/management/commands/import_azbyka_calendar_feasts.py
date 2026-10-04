import time
from pathlib import Path

import requests
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connections, transaction

from api.azbyka_calendar_feasts import (
    AzbykaFeastError,
    fetch_day_hymn_groups,
    fetch_day_saint_links,
    fetch_saint_content,
    find_best_hymn_group,
    find_best_source,
)
from api.calendar_models import CalendarDay, CalendarFeast
from api.sqlite_backup import create_sqlite_backup


IMPORT_FIELDS = [
    "troparion_title",
    "troparion_content",
    "troparion_echo",
    "kontakion_title",
    "kontakion_content",
    "kontakion_echo",
    "life_title",
    "life_content",
]


class Command(BaseCommand):
    help = (
        "Заполнить тропарь, кондак и житие памятей выбранного дня "
        "из календаря azbyka.ru. Работает только с локальной SQLite."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--date",
            required=True,
            metavar="YYYY-MM-DD",
            help="Календарный день.",
        )

        mode = parser.add_mutually_exclusive_group(required=True)
        mode.add_argument("--dry-run", action="store_true")
        mode.add_argument("--apply", action="store_true")

        parser.add_argument(
            "--overwrite",
            action="store_true",
            help=(
                "Разрешить заменять уже заполненные RU тропарь/кондак/житие. "
                "Без флага заполняются только пустые поля."
            ),
        )
        parser.add_argument(
            "--timeout",
            type=float,
            default=20,
            help="HTTP timeout, сек. По умолчанию 20.",
        )
        parser.add_argument(
            "--delay",
            type=float,
            default=0.25,
            help="Пауза между страницами святых, сек. По умолчанию 0.25.",
        )
        parser.add_argument(
            "--backup-dir",
            default="",
            help=(
                "Каталог backup перед первым изменением. "
                "По умолчанию <backend>/backups/sqlite."
            ),
        )

    def handle(self, *args, **options):
        self._assert_local_sqlite()

        from datetime import date

        try:
            target_date = date.fromisoformat(options["date"])
        except ValueError as error:
            raise CommandError("--date: используйте YYYY-MM-DD.") from error

        day = (
            CalendarDay.objects
            .select_related("main_feast")
            .prefetch_related("feasts")
            .filter(date_gregorian=target_date)
            .first()
        )
        if day is None:
            raise CommandError(f"Локально нет CalendarDay {target_date}.")

        local_feasts = list(day.feasts.all())

        # main_feast должен участвовать даже если по старым данным он
        # по ошибке отсутствует в M2M feasts.
        if day.main_feast and all(item.pk != day.main_feast.pk for item in local_feasts):
            local_feasts.insert(0, day.main_feast)

        if not local_feasts:
            raise CommandError(f"У {target_date} нет локальных памятей.")

        timeout = max(1.0, options["timeout"])
        delay = max(0.0, options["delay"])
        overwrite = options["overwrite"]
        apply_changes = options["apply"]

        session = requests.Session()
        backup_done = False
        source_cache = {}
        updated = 0
        unchanged = 0
        unmatched = 0
        failed = 0

        try:
            try:
                sources = fetch_day_saint_links(
                    target_date,
                    session=session,
                    timeout=timeout,
                )
                hymn_groups = fetch_day_hymn_groups(
                    target_date,
                    session=session,
                    timeout=timeout,
                )
            except AzbykaFeastError as error:
                raise CommandError(str(error)) from error

            self.stdout.write(
                f"Дата: {target_date}. "
                f"Локальных памятей: {len(local_feasts)}. "
                f"На Azbyka найдено святых: {len(sources)}. "
                f"Режим: {'APPLY' if apply_changes else 'DRY-RUN'}. "
                f"Overwrite: {'да' if overwrite else 'нет'}."
            )

            for feast in local_feasts:
                local_label = feast.short_title or feast.title
                match = find_best_source(local_label, sources)

                if match.source is None:
                    unmatched += 1
                    self.stdout.write(
                        self.style.WARNING(
                            f"SKIP [{feast.pk}] {local_label}: {match.reason}"
                        )
                    )
                    continue

                source = match.source

                try:
                    if source.url not in source_cache:
                        source_cache[source.url] = fetch_saint_content(
                            source.url,
                            session=session,
                            timeout=timeout,
                        )
                        if delay:
                            time.sleep(delay)

                    parsed = source_cache[source.url]
                except AzbykaFeastError as error:
                    failed += 1
                    self.stdout.write(
                        self.style.ERROR(
                            f"ERROR [{feast.pk}] {local_label}: {error}"
                        )
                    )
                    continue

                # Для тропаря/кондака предпочитаем страницу конкретного
                # календарного дня: там нередко есть богослужебный текст,
                # которого нет на отдельной странице святого. Житие берём
                # с персональной страницы святого.
                hymn_group, hymn_match = find_best_hymn_group(
                    source.title,
                    hymn_groups,
                )

                desired = {
                    field: getattr(parsed, field)
                    for field in IMPORT_FIELDS
                    if getattr(parsed, field) not in ("", None)
                }

                if hymn_group is not None:
                    for field in (
                        "troparion_title",
                        "troparion_content",
                        "troparion_echo",
                        "kontakion_title",
                        "kontakion_content",
                        "kontakion_echo",
                    ):
                        value = getattr(hymn_group, field)
                        if value not in ("", None):
                            desired[field] = value

                changes = {}
                for field, value in desired.items():
                    current = getattr(feast, field)

                    if overwrite:
                        if current != value:
                            changes[field] = value
                    elif current in ("", None):
                        changes[field] = value

                self.stdout.write(
                    f"[{feast.pk}] {local_label}"
                )
                self.stdout.write(
                    f"  -> Azbyka: {source.title} "
                    f"(совпадение {match.score:.2f})"
                )
                self.stdout.write(f"  URL: {source.url}")

                found = []
                if desired.get("troparion_content"):
                    found.append("тропарь")
                if desired.get("kontakion_content"):
                    found.append("кондак")
                if desired.get("life_content"):
                    found.append("житие")

                self.stdout.write(
                    "  Найдено: " + (", ".join(found) if found else "ничего")
                )
                if hymn_group is not None:
                    self.stdout.write(
                        f"  Богослужебные тексты дня: {hymn_group.title} "
                        f"(совпадение {hymn_match.score:.2f})"
                    )

                if not changes:
                    unchanged += 1
                    self.stdout.write(
                        "  Изменений: 0 "
                        "(поля уже заполнены либо на источнике нет данных)"
                    )
                    continue

                self.stdout.write(
                    "  Изменятся поля: " + ", ".join(changes)
                )

                if not apply_changes:
                    continue

                if not backup_done:
                    destination, digest = self._backup(options["backup_dir"])
                    backup_done = True
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"BACKUP перед изменениями: {destination}"
                        )
                    )
                    self.stdout.write(f"SHA256: {digest}")

                with transaction.atomic():
                    CalendarFeast.objects.filter(pk=feast.pk).update(**changes)

                updated += 1

        finally:
            session.close()

        self.stdout.write("")
        self.stdout.write("Итог:")
        self.stdout.write(f"  Обновлено памятей: {updated}")
        self.stdout.write(f"  Без изменений: {unchanged}")
        self.stdout.write(f"  Не сопоставлено безопасно: {unmatched}")
        self.stdout.write(f"  Ошибок сети/парсинга: {failed}")

        if not apply_changes:
            self.stdout.write(
                self.style.WARNING("DRY-RUN: локальная база не изменена.")
            )

    def _assert_local_sqlite(self):
        engine = connections["default"].settings_dict.get("ENGINE", "")
        if engine != "django.db.backends.sqlite3":
            raise CommandError(
                "Команда работает только с локальной SQLite. "
                "Уберите SUPABASE_DB_PASSWORD."
            )

    def _backup(self, output_dir):
        database_path = Path(settings.DATABASES["default"]["NAME"])
        destination_dir = (
            Path(output_dir).expanduser()
            if output_dir
            else Path(settings.BASE_DIR) / "backups" / "sqlite"
        )
        return create_sqlite_backup(database_path, destination_dir)
