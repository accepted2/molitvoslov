import time
import uuid
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
from api.calendar_icon_storage import (
    CalendarIconStorageError,
    cloudinary_configured,
    upload_azbyka_icon,
)
from api.calendar_models import CalendarDay, CalendarFeast
from api.sqlite_backup import create_sqlite_backup


AZBYKA_DAY_FEAST_NAMESPACE = uuid.UUID("7d2f2de2-0c81-4ca9-a852-924a35d5e46b")

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

TEXT_FIELDS = {
    "troparion_title",
    "troparion_content",
    "kontakion_title",
    "kontakion_content",
    "life_title",
    "life_content",
}


def deterministic_azbyka_day_feast_uid(target_date, source_url):
    return uuid.uuid5(
        AZBYKA_DAY_FEAST_NAMESPACE,
        f"{target_date.isoformat()}:{source_url}",
    )


class Command(BaseCommand):
    help = (
        "Импортировать карточки святых/праздников выбранного дня "
        "из календаря azbyka.ru в локальную SQLite."
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
                "В обычном режиме разрешить заменять уже заполненные RU " "тропарь/кондак/житие."
            ),
        )
        parser.add_argument(
            "--replace-day-feasts",
            action="store_true",
            help=(
                "Не сопоставлять со старыми карточками. Создать/обновить "
                "отдельные карточки по списку Azbyka, отвязать от дня старые "
                "карточки и привязать новый набор. Старые CalendarFeast "
                "не удаляются из базы."
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
                "Каталог backup перед первым изменением. " "По умолчанию <backend>/backups/sqlite."
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
            CalendarDay.objects.select_related("main_feast")
            .prefetch_related("feasts")
            .filter(date_gregorian=target_date)
            .first()
        )
        if day is None:
            raise CommandError(f"Локально нет CalendarDay {target_date}.")

        local_feasts = list(day.feasts.all())
        if day.main_feast and all(item.pk != day.main_feast.pk for item in local_feasts):
            local_feasts.insert(0, day.main_feast)

        replace_day = options["replace_day_feasts"]
        if not replace_day and not local_feasts:
            raise CommandError(f"У {target_date} нет локальных памятей.")

        timeout = max(1.0, options["timeout"])
        delay = max(0.0, options["delay"])
        overwrite = options["overwrite"]
        apply_changes = options["apply"]

        if replace_day and overwrite:
            raise CommandError(
                "--overwrite не нужен вместе с --replace-day-feasts: "
                "новый набор и так строится заново по Azbyka."
            )

        session = requests.Session()

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

            if replace_day:
                self._replace_day_feasts(
                    day=day,
                    local_feasts=local_feasts,
                    sources=sources,
                    hymn_groups=hymn_groups,
                    session=session,
                    timeout=timeout,
                    delay=delay,
                    apply_changes=apply_changes,
                    backup_dir=options["backup_dir"],
                )
                return

            self._fill_existing_feasts(
                day=day,
                local_feasts=local_feasts,
                sources=sources,
                hymn_groups=hymn_groups,
                session=session,
                timeout=timeout,
                delay=delay,
                overwrite=overwrite,
                apply_changes=apply_changes,
                backup_dir=options["backup_dir"],
            )
        finally:
            session.close()

    def _load_source_record(
        self,
        source,
        hymn_groups,
        source_cache,
        session,
        timeout,
        delay,
    ):
        if source.url not in source_cache:
            source_cache[source.url] = fetch_saint_content(
                source.url,
                session=session,
                timeout=timeout,
            )
            if delay:
                time.sleep(delay)

        parsed = source_cache[source.url]
        hymn_group, hymn_match = find_best_hymn_group(
            source.title,
            hymn_groups,
        )

        desired = {}
        for field in IMPORT_FIELDS:
            if field in TEXT_FIELDS:
                desired[field] = getattr(parsed, field) or ""
            else:
                desired[field] = getattr(parsed, field)

        # Для тропаря/кондака страница конкретного дня приоритетнее
        # персональной страницы святого.
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

        return parsed, hymn_group, hymn_match, desired

    def _replace_day_feasts(
        self,
        day,
        local_feasts,
        sources,
        hymn_groups,
        session,
        timeout,
        delay,
        apply_changes,
        backup_dir,
    ):
        source_cache = {}
        prepared = []
        errors = []
        main_index = 0

        # Сначала полностью скачиваем и разбираем новый набор.
        # Если хоть одна персональная страница сломалась, существующие связи
        # дня не трогаем вообще.
        for source in sources:
            try:
                parsed, hymn_group, hymn_match, desired = self._load_source_record(
                    source=source,
                    hymn_groups=hymn_groups,
                    source_cache=source_cache,
                    session=session,
                    timeout=timeout,
                    delay=delay,
                )
                prepared.append(
                    {
                        "source": source,
                        "parsed": parsed,
                        "hymn_group": hymn_group,
                        "hymn_match": hymn_match,
                        "desired": desired,
                        "cloudinary_icon_url": None,
                    }
                )
            except AzbykaFeastError as error:
                errors.append(f"{source.title}: {error}")

        primary_indexes = [
            index for index, item in enumerate(prepared) if item["source"].is_primary
        ]

        if primary_indexes:
            main_index = primary_indexes[0]

        if len(primary_indexes) > 1:
            self.stdout.write(
                self.style.WARNING(
                    "WARN: Azbyka выделила несколько главных памятей; "
                    "используем первую выделенную."
                )
            )

        self.stdout.write(
            f"Дата: {day.date_gregorian}. "
            f"Сейчас привязано памятей: {len(local_feasts)}. "
            f"Azbyka даёт памятей: {len(sources)}. "
            f"Режим: {'APPLY' if apply_changes else 'DRY-RUN'}. "
            "Стратегия: заменить набор дня по Azbyka."
        )

        self.stdout.write("")
        self.stdout.write("Старые связи дня будут отвязаны:")
        for feast in local_feasts:
            self.stdout.write(f"  - [{feast.pk}] {feast.short_title or feast.title}")

        self.stdout.write("")
        self.stdout.write("Новый набор Azbyka:")
        for index, item in enumerate(prepared, start=1):
            source = item["source"]
            desired = item["desired"]
            found = []
            if desired.get("troparion_content"):
                found.append("тропарь")
            if desired.get("kontakion_content"):
                found.append("кондак")
            if desired.get("life_content"):
                found.append("житие")
            if item["parsed"].icon_source_url:
                found.append("икона")

            prefix = "MAIN" if index - 1 == main_index else "    "
            self.stdout.write(f"  {prefix} {index:02d}. {source.title}")
            self.stdout.write(f"       {source.url}")
            self.stdout.write(
                "       Найдено: " + (", ".join(found) if found else "только карточка")
            )
            if item["parsed"].icon_source_url:
                self.stdout.write(f"       Икона Azbyka: {item['parsed'].icon_source_url}")

            hymn_group = item["hymn_group"]
            hymn_match = item["hymn_match"]
            if hymn_group is not None:
                self.stdout.write(
                    f"       Тексты дня: {hymn_group.title} " f"(совпадение {hymn_match.score:.2f})"
                )

        if errors:
            self.stdout.write("")
            for error in errors:
                self.stdout.write(self.style.ERROR(f"  ERROR: {error}"))
            raise CommandError(
                "Новый набор неполный. Замена отменена; локальная база " "не изменена."
            )

        if not prepared:
            raise CommandError("Azbyka не дала ни одной пригодной карточки. Замена отменена.")

        if not apply_changes:
            self.stdout.write("")
            self.stdout.write(
                self.style.WARNING(
                    "DRY-RUN: старые связи не отвязаны, новые карточки " "не созданы."
                )
            )
            return

        destination, digest = self._backup(backup_dir)
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(f"BACKUP перед изменениями: {destination}"))
        self.stdout.write(f"SHA256: {digest}")

        self._upload_prepared_icons(prepared)

        with transaction.atomic():
            new_feasts = []

            for item in prepared:
                source = item["source"]
                desired = item["desired"]
                sync_uid = deterministic_azbyka_day_feast_uid(
                    day.date_gregorian,
                    source.url,
                )

                parsed = item["parsed"]

                # Обычно полное название берём с персональной страницы
                # Azbyka (<h1>), а название из календарного списка остаётся
                # коротким вариантом.
                #
                # Исключение: один пункт календаря содержит несколько
                # персональных ссылок. В таком случае parsed относится только
                # к первому святому, поэтому полное название оставляем общим.
                full_title = (
                    source.title if source.is_multi_link_group else (parsed.title or source.title)
                )

                existing = (
                    CalendarFeast.objects.filter(sync_uid=sync_uid).only("short_title").first()
                )

                defaults = {
                    "source_id": None,
                    "title": full_title,
                    "julian_month": day.julian_month,
                    "julian_day": day.julian_day,
                    **desired,
                }

                # short_title заполняем автоматически только при первом
                # импорте. Если пользователь потом сократил его вручную
                # в админке, повторный импорт эту редактуру не затрёт.
                if existing is None or not existing.short_title:
                    defaults["short_title"] = source.title
                if item["cloudinary_icon_url"]:
                    defaults["icon_url"] = item["cloudinary_icon_url"]

                feast, _created = CalendarFeast.objects.update_or_create(
                    sync_uid=sync_uid,
                    defaults=defaults,
                )
                new_feasts.append(feast)

            # Меняем только связи этого календарного дня.
            # Старые CalendarFeast намеренно НЕ удаляем: они могут быть
            # связаны с другими днями или понадобиться для отката.
            day.feasts.set(new_feasts)
            day.main_feast = new_feasts[main_index]
            day.save(update_fields=["main_feast"])

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                f"Готово. К {day.date_gregorian} привязано " f"{len(prepared)} карточек Azbyka."
            )
        )
        self.stdout.write(
            "Старые карточки из CalendarFeast не удалены; " "от этого дня они только отвязаны."
        )
        self.stdout.write(f"Главная память: {prepared[main_index]['source'].title}")

    def _upload_prepared_icons(self, prepared):
        with_icons = [item for item in prepared if item["parsed"].icon_source_url]

        if not with_icons:
            self.stdout.write(self.style.WARNING("Иконы: на страницах Azbyka не найдены."))
            return

        if not cloudinary_configured():
            self.stdout.write(
                self.style.WARNING(
                    "Иконы: Cloudinary не настроен. "
                    "Задайте CLOUDINARY_URL либо CLOUD_NAME + "
                    "CLOUD_API_KEY + CLOUD_API_SECRET. "
                    "Тексты будут сохранены без загрузки изображений."
                )
            )
            return

        uploaded = 0
        failed = 0

        self.stdout.write("")
        self.stdout.write("Загрузка икон в Cloudinary:")

        for item in with_icons:
            source = item["source"]
            source_icon_url = item["parsed"].icon_source_url

            try:
                cloudinary_url = upload_azbyka_icon(
                    source_icon_url,
                    source.url,
                )
            except CalendarIconStorageError as error:
                failed += 1
                self.stdout.write(self.style.WARNING(f"  WARN {source.title}: {error}"))
                continue

            item["cloudinary_icon_url"] = cloudinary_url
            uploaded += 1
            self.stdout.write(self.style.SUCCESS(f"  OK {source.title}: {cloudinary_url}"))

        self.stdout.write(f"Иконы Cloudinary: загружено {uploaded}, ошибок {failed}.")

    def _fill_existing_feasts(
        self,
        day,
        local_feasts,
        sources,
        hymn_groups,
        session,
        timeout,
        delay,
        overwrite,
        apply_changes,
        backup_dir,
    ):
        backup_done = False
        source_cache = {}
        updated = 0
        unchanged = 0
        unmatched = 0
        failed = 0

        self.stdout.write(
            f"Дата: {day.date_gregorian}. "
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
                    self.style.WARNING(f"SKIP [{feast.pk}] {local_label}: {match.reason}")
                )
                continue

            source = match.source

            try:
                parsed, hymn_group, hymn_match, desired = self._load_source_record(
                    source=source,
                    hymn_groups=hymn_groups,
                    source_cache=source_cache,
                    session=session,
                    timeout=timeout,
                    delay=delay,
                )
            except AzbykaFeastError as error:
                failed += 1
                self.stdout.write(self.style.ERROR(f"ERROR [{feast.pk}] {local_label}: {error}"))
                continue

            changes = {}
            for field, value in desired.items():
                if value in ("", None):
                    continue

                current = getattr(feast, field)

                if overwrite:
                    if current != value:
                        changes[field] = value
                elif current in ("", None):
                    changes[field] = value

            self.stdout.write(f"[{feast.pk}] {local_label}")
            self.stdout.write(f"  -> Azbyka: {source.title} " f"(совпадение {match.score:.2f})")
            self.stdout.write(f"  URL: {source.url}")

            found = []
            if desired.get("troparion_content"):
                found.append("тропарь")
            if desired.get("kontakion_content"):
                found.append("кондак")
            if desired.get("life_content"):
                found.append("житие")

            self.stdout.write("  Найдено: " + (", ".join(found) if found else "ничего"))
            if hymn_group is not None:
                self.stdout.write(
                    f"  Богослужебные тексты дня: {hymn_group.title} "
                    f"(совпадение {hymn_match.score:.2f})"
                )

            if not changes:
                unchanged += 1
                self.stdout.write(
                    "  Изменений: 0 " "(поля уже заполнены либо на источнике нет данных)"
                )
                continue

            self.stdout.write("  Изменятся поля: " + ", ".join(changes))

            if not apply_changes:
                continue

            if not backup_done:
                destination, digest = self._backup(backup_dir)
                backup_done = True
                self.stdout.write(self.style.SUCCESS(f"BACKUP перед изменениями: {destination}"))
                self.stdout.write(f"SHA256: {digest}")

            with transaction.atomic():
                CalendarFeast.objects.filter(pk=feast.pk).update(**changes)

            updated += 1

        self.stdout.write("")
        self.stdout.write("Итог:")
        self.stdout.write(f"  Обновлено памятей: {updated}")
        self.stdout.write(f"  Без изменений: {unchanged}")
        self.stdout.write(f"  Не сопоставлено безопасно: {unmatched}")
        self.stdout.write(f"  Ошибок сети/парсинга: {failed}")

        if not apply_changes:
            self.stdout.write(self.style.WARNING("DRY-RUN: локальная база не изменена."))

    def _assert_local_sqlite(self):
        engine = connections["default"].settings_dict.get("ENGINE", "")
        if engine != "django.db.backends.sqlite3":
            raise CommandError(
                "Команда работает только с локальной SQLite. " "Уберите SUPABASE_DB_PASSWORD."
            )

    def _backup(self, output_dir):
        database_path = Path(settings.DATABASES["default"]["NAME"])
        destination_dir = (
            Path(output_dir).expanduser()
            if output_dir
            else Path(settings.BASE_DIR) / "backups" / "sqlite"
        )
        return create_sqlite_backup(database_path, destination_dir)
