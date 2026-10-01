import os
import uuid
from datetime import date

from django.core.management.base import BaseCommand, CommandError
from django.db import connections, transaction

from api.calendar_models import CalendarDay, CalendarFeast, CalendarFastType


REMOTE_ALIAS = "supabase_sync"

CALENDAR_FEAST_NAMESPACE = uuid.UUID("5f5f2404-7d94-4c8a-8c3e-57ad1a8777d2")

FAST_FIELDS = [
    "code",
    "type_title",
    "name",
    "description",
    "type_title_uk",
    "name_uk",
    "description_uk",
    "order",
    "is_active",
]

FEAST_FIELDS = [
    "source_id",
    "date_type",
    "celebration_type",
    "celebration_rank",
    "title",
    "short_title",
    "title_uk",
    "short_title_uk",
    "julian_month",
    "julian_day",
    "easter_offset",
    "icon_url",
    "troparion_title",
    "troparion_content",
    "troparion_title_uk",
    "troparion_content_uk",
    "troparion_echo",
    "kontakion_title",
    "kontakion_content",
    "kontakion_title_uk",
    "kontakion_content_uk",
    "kontakion_echo",
    "life_title",
    "life_content",
    "description",
    "life_title_uk",
    "life_content_uk",
    "description_uk",
    "all_dates",
]

DAY_FIELDS = [
    "julian_month",
    "julian_day",
    # Старые поля сохраняем для совместимости со старыми версиями API/app.
    "fast_type_code",
    "fast_type_title",
    "fast_name",
    "fast_description",
    "fast_type_title_uk",
    "fast_name_uk",
    "fast_description_uk",
    "summary",
    "short_summary",
    "summary_uk",
    "short_summary_uk",
    "gospel_title",
    "gospel_reading",
    "apostolic_title",
    "apostolic_reading",
    "gospel_title_uk",
    "gospel_reading_uk",
    "apostolic_title_uk",
    "apostolic_reading_uk",
    "source_payload",
]


def parse_iso_date(value, option_name):
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError) as error:
        raise CommandError(
            f"{option_name}: используйте дату в формате YYYY-MM-DD."
        ) from error


def deterministic_feast_uid(source_id):
    return uuid.uuid5(
        CALENDAR_FEAST_NAMESPACE,
        f"church-site-calendar-feast:{source_id}",
    )


class Command(BaseCommand):
    help = (
        "Синхронизировать отредактированный календарь из локальной SQLite "
        "в Supabase: типы поста, памяти/праздники, дни и связи."
    )

    def add_arguments(self, parser):
        selection = parser.add_mutually_exclusive_group(required=True)
        selection.add_argument(
            "--date",
            action="append",
            dest="dates",
            metavar="YYYY-MM-DD",
            help="Конкретная дата. Можно указать несколько раз.",
        )
        selection.add_argument("--year", type=int, help="Весь указанный год.")
        selection.add_argument(
            "--range",
            nargs=2,
            metavar=("START", "END"),
            help="Диапазон дат включительно.",
        )

        mode = parser.add_mutually_exclusive_group(required=True)
        mode.add_argument("--dry-run", action="store_true")
        mode.add_argument("--apply", action="store_true")

    def handle(self, *args, **options):
        self._assert_local_source()
        self._configure_supabase_connection()

        days = self._select_days(options)
        if not days:
            raise CommandError("В локальной SQLite не найдено выбранных дней.")

        feasts = self._collect_feasts(days)
        fast_types = self._collect_fast_types(days)

        self._ensure_local_uids(feasts, fast_types)
        self._check_remote()

        preview = self._preview(days, feasts, fast_types)
        self._print_preview(preview, days, feasts, fast_types)

        if options["dry_run"]:
            self.stdout.write(
                self.style.WARNING("DRY-RUN: Supabase не изменён.")
            )
            return

        counters = {
            "fast_create": 0,
            "fast_update": 0,
            "fast_same": 0,
            "feast_create": 0,
            "feast_update": 0,
            "feast_same": 0,
            "day_create": 0,
            "day_update": 0,
            "day_same": 0,
        }

        with transaction.atomic(using=REMOTE_ALIAS):
            remote_fast = self._sync_fast_types(fast_types, counters)
            remote_feasts = self._sync_feasts(feasts, counters)
            self._sync_days(days, remote_fast, remote_feasts, counters)

        problems = self._verify(days, feasts, fast_types)
        if problems:
            for problem in problems[:30]:
                self.stdout.write(self.style.ERROR(f"  - {problem}"))
            raise CommandError(
                f"После записи найдено расхождений: {len(problems)}."
            )

        self.stdout.write(
            self.style.SUCCESS(
                "Готово. Supabase синхронизирован и проверен.\n"
                f"Посты: +{counters['fast_create']} / "
                f"обновлено {counters['fast_update']} / "
                f"без изменений {counters['fast_same']}.\n"
                f"Памяти: +{counters['feast_create']} / "
                f"обновлено {counters['feast_update']} / "
                f"без изменений {counters['feast_same']}.\n"
                f"Дни: +{counters['day_create']} / "
                f"обновлено {counters['day_update']} / "
                f"без изменений {counters['day_same']}."
            )
        )

    def _assert_local_source(self):
        engine = connections["default"].settings_dict.get("ENGINE", "")
        if engine != "django.db.backends.sqlite3":
            raise CommandError(
                "Источник должен быть SQLite. "
                "Уберите SUPABASE_DB_PASSWORD; "
                "для назначения используйте SUPABASE_SYNC_DB_PASSWORD."
            )

    def _configure_supabase_connection(self):
        password = os.environ.get("SUPABASE_SYNC_DB_PASSWORD", "").strip()
        if not password:
            raise CommandError("Не задан SUPABASE_SYNC_DB_PASSWORD.")

        connections.databases[REMOTE_ALIAS] = {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.environ.get(
                "SUPABASE_SYNC_DB_NAME",
                os.environ.get("SUPABASE_DB_NAME", "postgres"),
            ),
            "USER": os.environ.get(
                "SUPABASE_SYNC_DB_USER",
                os.environ.get(
                    "SUPABASE_DB_USER",
                    "postgres.gguwppijpnpjpmpkiumd",
                ),
            ),
            "PASSWORD": password,
            "HOST": os.environ.get(
                "SUPABASE_SYNC_DB_HOST",
                os.environ.get(
                    "SUPABASE_DB_HOST",
                    "aws-1-eu-central-1.pooler.supabase.com",
                ),
            ),
            "PORT": os.environ.get(
                "SUPABASE_SYNC_DB_PORT",
                os.environ.get("SUPABASE_DB_PORT", "5432"),
            ),
            "CONN_MAX_AGE": 0,
            "CONN_HEALTH_CHECKS": True,
            "OPTIONS": {"sslmode": "require"},
            "TIME_ZONE": None,
            "AUTOCOMMIT": True,
            "ATOMIC_REQUESTS": False,
            "TEST": {
                "CHARSET": None,
                "COLLATION": None,
                "MIGRATE": True,
                "MIRROR": None,
                "NAME": None,
            },
        }

    def _check_remote(self):
        try:
            connections[REMOTE_ALIAS].ensure_connection()
            CalendarDay.objects.using(REMOTE_ALIAS).count()
            CalendarFeast.objects.using(REMOTE_ALIAS).count()
            CalendarFastType.objects.using(REMOTE_ALIAS).count()
        except Exception as error:
            raise CommandError(
                "Не удалось подключиться к Supabase или там не применены "
                f"миграции календаря/постов: {error}"
            ) from error

    def _select_days(self, options):
        qs = (
            CalendarDay.objects.using("default")
            .select_related("main_feast", "fast_type")
            .prefetch_related("feasts")
            .order_by("date_gregorian")
        )

        if options.get("dates"):
            dates = [parse_iso_date(v, "--date") for v in options["dates"]]
            return list(qs.filter(date_gregorian__in=dates))

        if options.get("year"):
            return list(qs.filter(date_gregorian__year=options["year"]))

        start_raw, end_raw = options["range"]
        start = parse_iso_date(start_raw, "--range START")
        end = parse_iso_date(end_raw, "--range END")
        if end < start:
            raise CommandError("END не может быть раньше START.")

        return list(qs.filter(date_gregorian__range=(start, end)))

    def _collect_feasts(self, days):
        result = {}
        for day in days:
            if day.main_feast:
                result[day.main_feast.pk] = day.main_feast
            for feast in day.feasts.all():
                result[feast.pk] = feast
        return result

    def _collect_fast_types(self, days):
        return {
            day.fast_type.pk: day.fast_type
            for day in days
            if day.fast_type_id and day.fast_type
        }

    def _ensure_local_uids(self, feasts, fast_types):
        for feast in feasts.values():
            if feast.sync_uid:
                continue
            feast.sync_uid = (
                deterministic_feast_uid(feast.source_id)
                if feast.source_id is not None
                else uuid.uuid4()
            )
            feast.save(update_fields=["sync_uid"])

        for fast in fast_types.values():
            if fast.sync_uid:
                continue
            fast.sync_uid = uuid.uuid4()
            fast.save(update_fields=["sync_uid"])

    def _fast_values(self, fast):
        return {field: getattr(fast, field) for field in FAST_FIELDS}

    def _feast_values(self, feast):
        return {field: getattr(feast, field) for field in FEAST_FIELDS}

    def _day_values(self, day):
        return {field: getattr(day, field) for field in DAY_FIELDS}

    def _find_remote_fast(self, fast):
        remote = (
            CalendarFastType.objects.using(REMOTE_ALIAS)
            .filter(sync_uid=fast.sync_uid)
            .first()
        )
        if remote:
            return remote
        return (
            CalendarFastType.objects.using(REMOTE_ALIAS)
            .filter(code=fast.code)
            .first()
        )

    def _find_remote_feast(self, feast):
        remote = (
            CalendarFeast.objects.using(REMOTE_ALIAS)
            .filter(sync_uid=feast.sync_uid)
            .first()
        )
        if remote:
            return remote
        if feast.source_id is not None:
            return (
                CalendarFeast.objects.using(REMOTE_ALIAS)
                .filter(source_id=feast.source_id)
                .first()
            )
        return None

    def _changed_fields(self, obj, values):
        return [
            field
            for field, expected in values.items()
            if getattr(obj, field) != expected
        ]

    def _preview(self, days, feasts, fast_types):
        result = {
            "fast_create": [],
            "fast_update": [],
            "feast_create": [],
            "feast_update": [],
            "day_create": [],
            "day_update": [],
        }

        for fast in fast_types.values():
            remote = self._find_remote_fast(fast)
            if remote is None:
                result["fast_create"].append(fast.code)
            else:
                values = self._fast_values(fast)
                values["sync_uid"] = fast.sync_uid
                changed = self._changed_fields(remote, values)
                if changed:
                    result["fast_update"].append(
                        f"{fast.code} ({', '.join(changed)})"
                    )

        for feast in feasts.values():
            remote = self._find_remote_feast(feast)
            label = feast.short_title or feast.title
            if remote is None:
                result["feast_create"].append(label)
            else:
                values = self._feast_values(feast)
                values["sync_uid"] = feast.sync_uid
                changed = self._changed_fields(remote, values)
                if changed:
                    result["feast_update"].append(
                        f"{label} ({', '.join(changed)})"
                    )

        for day in days:
            remote = (
                CalendarDay.objects.using(REMOTE_ALIAS)
                .select_related("main_feast", "fast_type")
                .prefetch_related("feasts")
                .filter(date_gregorian=day.date_gregorian)
                .first()
            )
            if remote is None:
                result["day_create"].append(day.date_gregorian.isoformat())
                continue

            changed = self._changed_fields(remote, self._day_values(day))

            local_fast_uid = (
                str(day.fast_type.sync_uid) if day.fast_type else None
            )
            remote_fast_uid = (
                str(remote.fast_type.sync_uid) if remote.fast_type else None
            )
            if local_fast_uid != remote_fast_uid:
                changed.append("fast_type")

            local_main_uid = (
                str(day.main_feast.sync_uid) if day.main_feast else None
            )
            remote_main_uid = (
                str(remote.main_feast.sync_uid) if remote.main_feast else None
            )
            if local_main_uid != remote_main_uid:
                changed.append("main_feast")

            local_feasts = sorted(str(x.sync_uid) for x in day.feasts.all())
            remote_feasts = sorted(
                str(x.sync_uid) for x in remote.feasts.all() if x.sync_uid
            )
            if local_feasts != remote_feasts:
                changed.append("feasts")

            if changed:
                result["day_update"].append(
                    f"{day.date_gregorian.isoformat()} "
                    f"({', '.join(changed)})"
                )

        return result

    def _print_preview(self, preview, days, feasts, fast_types):
        self.stdout.write(
            f"Источник SQLite: дней {len(days)}, "
            f"постов {len(fast_types)}, памятей {len(feasts)}"
        )
        self.stdout.write("План:")
        for key, title in [
            ("fast_create", "Посты CREATE"),
            ("fast_update", "Посты UPDATE"),
            ("feast_create", "Памяти CREATE"),
            ("feast_update", "Памяти UPDATE"),
            ("day_create", "Дни CREATE"),
            ("day_update", "Дни UPDATE"),
        ]:
            items = preview[key]
            self.stdout.write(f"  {title}: {len(items)}")
            for item in items[:20]:
                self.stdout.write(f"    - {item}")
            if len(items) > 20:
                self.stdout.write(f"    ... и ещё {len(items) - 20}")

    def _sync_fast_types(self, fast_types, counters):
        remote_map = {}
        for fast in fast_types.values():
            remote = self._find_remote_fast(fast)
            values = self._fast_values(fast)
            values["sync_uid"] = fast.sync_uid

            if remote is None:
                remote = CalendarFastType.objects.using(REMOTE_ALIAS).create(
                    sync_uid=fast.sync_uid,
                    **self._fast_values(fast),
                )
                counters["fast_create"] += 1
            else:
                changed = self._changed_fields(remote, values)
                if changed:
                    for field in changed:
                        setattr(remote, field, values[field])
                    remote.save(update_fields=changed)
                    counters["fast_update"] += 1
                else:
                    counters["fast_same"] += 1

            remote_map[fast.sync_uid] = remote
        return remote_map

    def _sync_feasts(self, feasts, counters):
        remote_map = {}
        for feast in feasts.values():
            remote = self._find_remote_feast(feast)
            values = self._feast_values(feast)
            values["sync_uid"] = feast.sync_uid

            if remote is None:
                remote = CalendarFeast.objects.using(REMOTE_ALIAS).create(
                    sync_uid=feast.sync_uid,
                    **self._feast_values(feast),
                )
                counters["feast_create"] += 1
            else:
                changed = self._changed_fields(remote, values)
                if changed:
                    for field in changed:
                        setattr(remote, field, values[field])
                    remote.save(update_fields=changed)
                    counters["feast_update"] += 1
                else:
                    counters["feast_same"] += 1

            remote_map[feast.sync_uid] = remote
        return remote_map

    def _sync_days(self, days, remote_fast, remote_feasts, counters):
        for day in days:
            remote = (
                CalendarDay.objects.using(REMOTE_ALIAS)
                .select_related("main_feast", "fast_type")
                .prefetch_related("feasts")
                .filter(date_gregorian=day.date_gregorian)
                .first()
            )

            was_created = remote is None
            desired = self._day_values(day)
            desired["main_feast"] = (
                remote_feasts[day.main_feast.sync_uid]
                if day.main_feast else None
            )
            desired["fast_type"] = (
                remote_fast[day.fast_type.sync_uid]
                if day.fast_type else None
            )

            content_changed = False

            if was_created:
                remote = CalendarDay.objects.using(REMOTE_ALIAS).create(
                    date_gregorian=day.date_gregorian,
                    **desired,
                )
                content_changed = True
            else:
                changed = self._changed_fields(remote, desired)
                if changed:
                    for field in changed:
                        setattr(remote, field, desired[field])
                    remote.save(update_fields=changed)
                    content_changed = True

            desired_feasts = [
                remote_feasts[x.sync_uid] for x in day.feasts.all()
            ]
            current_uids = sorted(
                str(x.sync_uid) for x in remote.feasts.all() if x.sync_uid
            )
            desired_uids = sorted(str(x.sync_uid) for x in desired_feasts)
            relations_changed = current_uids != desired_uids

            if relations_changed:
                remote.feasts.set(desired_feasts)

            if was_created:
                counters["day_create"] += 1
            elif content_changed or relations_changed:
                counters["day_update"] += 1
            else:
                counters["day_same"] += 1

    def _verify(self, days, feasts, fast_types):
        problems = []

        for fast in fast_types.values():
            remote = (
                CalendarFastType.objects.using(REMOTE_ALIAS)
                .filter(sync_uid=fast.sync_uid)
                .first()
            )
            if remote is None:
                problems.append(f"Пост {fast.code}: отсутствует")
                continue
            for field, expected in self._fast_values(fast).items():
                if getattr(remote, field) != expected:
                    problems.append(f"Пост {fast.code}: {field} отличается")

        for feast in feasts.values():
            remote = (
                CalendarFeast.objects.using(REMOTE_ALIAS)
                .filter(sync_uid=feast.sync_uid)
                .first()
            )
            if remote is None:
                problems.append(
                    f"Память {feast.short_title or feast.title}: отсутствует"
                )
                continue
            for field, expected in self._feast_values(feast).items():
                if getattr(remote, field) != expected:
                    problems.append(
                        f"Память {feast.pk}: {field} отличается"
                    )

        for day in days:
            remote = (
                CalendarDay.objects.using(REMOTE_ALIAS)
                .select_related("main_feast", "fast_type")
                .prefetch_related("feasts")
                .filter(date_gregorian=day.date_gregorian)
                .first()
            )
            if remote is None:
                problems.append(f"День {day.date_gregorian}: отсутствует")
                continue

            for field, expected in self._day_values(day).items():
                if getattr(remote, field) != expected:
                    problems.append(
                        f"День {day.date_gregorian}: {field} отличается"
                    )

            local_fast = (
                str(day.fast_type.sync_uid) if day.fast_type else None
            )
            remote_fast = (
                str(remote.fast_type.sync_uid) if remote.fast_type else None
            )
            if local_fast != remote_fast:
                problems.append(
                    f"День {day.date_gregorian}: fast_type отличается"
                )

            local_main = (
                str(day.main_feast.sync_uid) if day.main_feast else None
            )
            remote_main = (
                str(remote.main_feast.sync_uid) if remote.main_feast else None
            )
            if local_main != remote_main:
                problems.append(
                    f"День {day.date_gregorian}: main_feast отличается"
                )

            local_feasts = sorted(str(x.sync_uid) for x in day.feasts.all())
            remote_feasts = sorted(
                str(x.sync_uid) for x in remote.feasts.all() if x.sync_uid
            )
            if local_feasts != remote_feasts:
                problems.append(
                    f"День {day.date_gregorian}: feasts отличаются"
                )

        return problems
