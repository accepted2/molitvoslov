"""Import feast links and main feast for 2027. Existing CalendarFeast contents stay intact.

python manage.py import_calendar_feasts_2027 --file calendar_2027.json
python manage.py import_calendar_feasts_2027 --file calendar_2027.json --apply
"""

import json
import sqlite3
from collections import Counter
from datetime import date
from pathlib import Path
from django.core.management.base import BaseCommand, CommandError
from django.db import connections, transaction
from api.calendar_models import CalendarDay, CalendarFeast


def backup_sqlite():
    connection = connections["default"]
    if connection.vendor != "sqlite":
        raise CommandError("Запись разрешена только в локальную SQLite.")
    path = Path(connection.settings_dict["NAME"])
    if not path.is_file():
        raise CommandError(f"Не найдена SQLite: {path}")
    folder = path.parent / "backups" / "calendar_2027"
    folder.mkdir(parents=True, exist_ok=True)
    from datetime import datetime

    dest = folder / f"before_feasts_2027_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.sqlite3"
    with sqlite3.connect(str(path)) as source, sqlite3.connect(str(dest)) as target:
        source.backup(target)
    return dest


class Command(BaseCommand):
    help = "Импортирует только связи святых с днями и главную память из JSON. Не изменяет чтения, посты и тексты карточек."

    def add_arguments(self, parser):
        parser.add_argument("--file", default="calendar_2027.json")
        parser.add_argument(
            "--apply", action="store_true", help="Записать изменения (по умолчанию только проверка)"
        )
        parser.add_argument(
            "--replace-existing",
            action="store_true",
            help="Разрешить заменить уже заполненные связи и главную память 2027 года",
        )

    def handle(self, *args, **opts):
        if connections["default"].vendor != "sqlite":
            raise CommandError("Эта команда предназначена для локальной SQLite.")
        src = Path(opts["file"])
        if not src.is_file():
            raise CommandError(f"Не найден файл: {src}")
        with src.open(encoding="utf-8") as fp:
            payload = json.load(fp)
        if payload.get("year") != 2027 or len(payload.get("days", {})) != 365:
            raise CommandError("Ожидается полный календарь за 2027 год (365 дней).")
        days = payload["days"]
        all_feasts = list(CalendarFeast.objects.all())
        by_pk = {f.pk: f for f in all_feasts}
        fields = {f.name for f in CalendarFeast._meta.fields}
        by_source = {}
        if "source_id" in fields:
            for feast in all_feasts:
                val = getattr(feast, "source_id", None)
                if val is not None:
                    by_source.setdefault(str(val), []).append(feast)
        by_slug = {}
        if "slug" in fields:
            for feast in all_feasts:
                slug = getattr(feast, "slug", None)
                if slug:
                    by_slug.setdefault(slug, []).append(feast)

        def find_card(item):
            # local_id from canonical catalog is original SQLite primary key; do not match merely by a title.
            local = item.get("local_id")
            if local is not None and local in by_pk:
                return by_pk[local]
            key = item.get("key", "")
            if key.startswith("feast:source-"):
                candidates = by_source.get(key.removeprefix("feast:source-"), [])
                if len(candidates) == 1:
                    return candidates[0]
            return None

        planned = {}
        missing = []
        no_main = []
        collision = []
        for stamp, data in sorted(days.items()):
            try:
                day = date.fromisoformat(stamp)
            except ValueError as exc:
                raise CommandError(f"Некорректная дата: {stamp}") from exc
            if day.year != 2027:
                raise CommandError(f"Дата вне 2027 года: {stamp}")
            matched = []
            resolved = {}
            for rec in data.get("feasts", []):
                f = find_card(rec)
                if f is None:
                    missing.append((stamp, rec.get("key"), rec.get("local_id"), rec.get("title")))
                    continue
                # Duplicate cards / occurrences shouldn't be duplicated in the M2M relation.
                if f.pk not in {x.pk for x in matched}:
                    matched.append(f)
                resolved[rec["key"]] = f
            main_key = data.get("main_feast")
            main = resolved.get(main_key)
            if main_key and not main:
                no_main.append((stamp, main_key))
            if not main_key:
                no_main.append((stamp, None))
            planned[day] = (matched, main)
        if missing or no_main:
            for x in missing[:12]:
                self.stderr.write(f"НЕ НАЙДЕНА КАРТОЧКА {x}")
            for x in no_main[:12]:
                self.stderr.write(f"НЕТ ГЛАВНОЙ КАРТОЧКИ {x}")
            raise CommandError(
                f"Прервано без записи: не найдено карточек={len(missing)}, проблем с главными={len(no_main)}. Проверь, что SQLite содержит импортированные карточки 2026 года с теми же ID."
            )
        for day, (records, main) in planned.items():
            if not records or main.pk not in {f.pk for f in records}:
                raise CommandError(f"Главная память отсутствует среди карточек: {day}")
        existing = {
            d.date_gregorian: d for d in CalendarDay.objects.filter(date_gregorian__year=2027)
        }
        protected = []
        for day, obj in existing.items():
            if not opts["replace_existing"] and (obj.main_feast_id or obj.feasts.exists()):
                protected.append(day)
        if protected:
            raise CommandError(
                f"В SQLite уже заполнено {len(protected)} дней 2027 года. Для осознанной замены связей используй --replace-existing. Существующие чтения и посты останутся неизменными."
            )
        self.stdout.write(
            f"ПРОВЕРЕНО: дней={len(planned)}, памятей={sum(len(r) for r,_ in planned.values())}, главных={sum(bool(m) for _,m in planned.values())}, существующих дней={len(existing)}"
        )
        if not opts["apply"]:
            self.stdout.write("DRY RUN: ничего не изменено. Для записи повтори с --apply.")
            return
        backup = backup_sqlite()
        self.stdout.write(f"РЕЗЕРВНАЯ КОПИЯ: {backup}")
        created = 0
        with transaction.atomic():
            for day, (records, main) in planned.items():
                obj = existing.get(day)
                if obj is None:
                    old = day - __import__("datetime").timedelta(days=13)
                    obj = CalendarDay.objects.create(
                        date_gregorian=day,
                        julian_month=old.month,
                        julian_day=old.day,
                        main_feast=main,
                    )
                    created += 1
                elif obj.main_feast_id != main.pk:
                    obj.main_feast = main
                    obj.save(update_fields=["main_feast"])
                obj.feasts.set([rec.pk for rec in records])
        self.stdout.write(
            self.style.SUCCESS(
                f"ГОТОВО: дней создано={created}; все 365 дней имеют карточки и главную память. Тексты, иконы, посты и чтения не изменены."
            )
        )
