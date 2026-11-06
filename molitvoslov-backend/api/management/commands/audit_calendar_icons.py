"""Безопасная инвентаризация и замена icon_url без пересоздания CalendarFeast.

CSV всегда связан с id + sync_uid/source_id + названием + ожидаемым старым URL.
По умолчанию только DRY-RUN. При --apply обновляем ТОЛЬКО icon_url в
локальной SQLite после резервной копии и проверки всех строк.
"""
from __future__ import annotations

import csv
from ipaddress import ip_address
from pathlib import Path
from urllib.parse import urlsplit

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Count
from django.utils import timezone

from api.calendar_models import CalendarFeast
from api.sqlite_backup import create_sqlite_backup


FIELDS = [
    "id", "sync_uid", "source_id", "title", "current_icon_url",
    "main_days", "linked_days", "new_icon_url", "image_width",
    "image_height", "source_page", "image_credit", "usage_rights",
    "subject_verified", "rights_verified", "approved",
]


def _public_https(value):
    try:
        parts = urlsplit(value.strip())
        host = parts.hostname or ""
        if parts.scheme != "https" or not host or parts.username or parts.password:
            return False
        if host in {"localhost", "localhost.localdomain"} or host.endswith(".local"):
            return False
        try:
            return ip_address(host).is_global
        except ValueError:
            return True
    except ValueError:
        return False


class Command(BaseCommand):
    help = "Реестр икон, проверка HD-замен и безопасная замена только icon_url."

    def add_arguments(self, parser):
        mode = parser.add_mutually_exclusive_group(required=True)
        mode.add_argument("--inventory", metavar="CSV")
        mode.add_argument("--manifest", metavar="CSV")
        parser.add_argument("--apply", action="store_true")

    def _inventory(self, path):
        path.parent.mkdir(parents=True, exist_ok=True)
        qs = CalendarFeast.objects.order_by("pk").annotate(
            main_days=Count("main_days", distinct=True),
            linked_days=Count("calendar_days", distinct=True),
        )
        total = 0
        with path.open("w", encoding="utf-8-sig", newline="") as file:
            writer = csv.DictWriter(file, fieldnames=FIELDS, delimiter=";")
            writer.writeheader()
            for feast in qs.iterator(chunk_size=300):
                writer.writerow({
                    "id": feast.pk,
                    "sync_uid": str(feast.sync_uid) if feast.sync_uid else "",
                    "source_id": "" if feast.source_id is None else feast.source_id,
                    "title": feast.title,
                    "current_icon_url": feast.icon_url,
                    "main_days": feast.main_days,
                    "linked_days": feast.linked_days,
                })
                total += 1
        self.stdout.write(self.style.SUCCESS(f"Реестр: {total} памятей -> {path}"))

    def _plan(self, path):
        if not path.is_file():
            raise CommandError(f"CSV не найден: {path}")
        with path.open("r", encoding="utf-8-sig", newline="") as file:
            reader = csv.DictReader(file, delimiter=";")
            if not set(FIELDS).issubset(reader.fieldnames or []):
                raise CommandError("Неверные колонки. Сначала выполните --inventory.")
            rows = [dict(row) for row in reader if (row.get("new_icon_url") or "").strip()]
        seen = set()
        changes = []
        for row in rows:
            try:
                pk = int(row["id"])
            except (TypeError, ValueError):
                raise CommandError(f"Неправильный id: {row.get('id')}") from None
            if pk in seen:
                raise CommandError(f"Повторный id={pk} в CSV.")
            seen.add(pk)
            feast = CalendarFeast.objects.filter(pk=pk).first()
            if feast is None:
                raise CommandError(f"Нет памяти id={pk}.")
            expected_uid = str(feast.sync_uid) if feast.sync_uid else ""
            expected_source = str(feast.source_id) if feast.source_id is not None else ""
            if not (expected_uid or expected_source):
                raise CommandError(f"id={pk}: нет устойчивого sync_uid/source_id.")
            if (
                expected_uid != (row["sync_uid"] or "").strip()
                or expected_source != (row["source_id"] or "").strip()
                or feast.title != row["title"]
                or feast.icon_url != row["current_icon_url"]
            ):
                raise CommandError(
                    f"id={pk}: CONFLICT — изменился UID, source_id, название или старый URL. "
                    "Снова выгрузите реестр; совпадение по одному названию запрещено."
                )
            if any((row[name] or "").strip().lower() != "yes" for name in
                   ("subject_verified", "rights_verified", "approved")):
                raise CommandError(f"id={pk}: нужны subject_verified/rights_verified/approved=yes.")
            if not row["usage_rights"].strip() or not _public_https(row["source_page"]):
                raise CommandError(f"id={pk}: укажите права и публичную страницу источника.")
            url = row["new_icon_url"].strip()
            if len(url) > 1000 or not _public_https(url):
                raise CommandError(f"id={pk}: нужен публичный HTTPS URL до 1000 символов.")
            try:
                width, height = int(row["image_width"]), int(row["image_height"])
            except (TypeError, ValueError):
                raise CommandError(f"id={pk}: укажите проверенные размеры оригинала.") from None
            if min(width, height) < 800 or max(width, height) < 1100:
                raise CommandError(f"id={pk}: исходное изображение слишком маленькое.")
            if feast.icon_url != url:
                changes.append((feast, url))
        return changes

    def handle(self, *args, **options):
        if options["inventory"]:
            if options["apply"]:
                raise CommandError("Нельзя применять --inventory.")
            return self._inventory(Path(options["inventory"]).expanduser())
        changes = self._plan(Path(options["manifest"]).expanduser())
        self.stdout.write(f"Проверено замен: {len(changes)}.")
        if not options["apply"]:
            for feast, url in changes[:20]:
                self.stdout.write(f"DRY-RUN id={feast.pk}, UID={feast.sync_uid}: {url[:120]}")
            self.stdout.write("База НЕ изменена. Применение требует --apply.")
            return
        if not changes:
            return
        db = settings.DATABASES["default"]
        if db["ENGINE"] != "django.db.backends.sqlite3":
            raise CommandError("--apply разрешён только на локальной SQLite.")
        backup, digest = create_sqlite_backup(
            Path(db["NAME"]), Path(settings.BASE_DIR) / "backups" / "sqlite"
        )
        self.stdout.write(f"BACKUP: {backup} SHA256: {digest}")
        with transaction.atomic():
            for feast, url in changes:
                done = CalendarFeast.objects.filter(
                    pk=feast.pk, icon_url=feast.icon_url
                ).update(icon_url=url, updated_at=timezone.now())
                if done != 1:
                    raise CommandError(f"Конфликт id={feast.pk}; вся транзакция отменена.")
        self.stdout.write(self.style.SUCCESS(f"Заменено icon_url: {len(changes)}."))
        self.stdout.write(
            "После проверки SQLite используйте существующий "
            "sync_calendar_to_supabase --feast-icons-only; затем пересоберите offline JSON и APK."
        )
