import os

from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import connections
from django.db.migrations.executor import MigrationExecutor


REMOTE_ALIAS = "supabase_sync"
TARGET_MIGRATION = "0045_traditional_church_slavonic_titles"
ALLOWED_PENDING = {
    ("api", "0043_text_ukrainian_translation"),
    ("api", "0044_content_ukrainian_fields"),
    ("api", "0045_traditional_church_slavonic_titles"),
}


class Command(BaseCommand):
    help = (
        "Безопасно применяет только ожидаемые content-схема миграции "
        "api.0043-api.0045 к Supabase через отдельный alias. "
        "Default DB должна оставаться локальной SQLite."
    )

    def add_arguments(self, parser):
        mode = parser.add_mutually_exclusive_group(required=True)
        mode.add_argument("--dry-run", action="store_true")
        mode.add_argument("--apply", action="store_true")

    def handle(self, *args, **options):
        self._assert_local_source()
        self._configure_supabase_connection()

        connection = connections[REMOTE_ALIAS]

        try:
            connection.ensure_connection()
            executor = MigrationExecutor(connection)
        except Exception as error:
            raise CommandError(
                f"Не удалось подключиться к Supabase: {error}"
            ) from error

        plan = executor.migration_plan(
            [("api", TARGET_MIGRATION)]
        )

        forward = [
            (migration.app_label, migration.name)
            for migration, backwards in plan
            if not backwards
        ]

        backwards = [
            (migration.app_label, migration.name)
            for migration, backwards in plan
            if backwards
        ]

        if backwards:
            raise CommandError(
                "План содержит обратные миграции. Применение остановлено."
            )

        unexpected = [
            item
            for item in forward
            if item not in ALLOWED_PENDING
        ]

        self.stdout.write("")
        self.stdout.write(
            self.style.MIGRATE_HEADING(
                "Supabase content schema migration plan"
            )
        )

        if not forward:
            self.stdout.write(
                self.style.SUCCESS(
                    "api.0043-api.0045 уже применены. Изменений нет."
                )
            )
            return

        for app_label, name in forward:
            self.stdout.write(f"  APPLY {app_label}.{name}")

        if unexpected:
            raise CommandError(
                "В плане есть неожиданные миграции: "
                + ", ".join(
                    f"{app}.{name}"
                    for app, name in unexpected
                )
                + ". APPLY заблокирован."
            )

        if options["dry_run"]:
            self.stdout.write("")
            self.stdout.write(
                self.style.WARNING(
                    "DRY-RUN: Supabase не изменён. "
                    "План состоит только из разрешённых миграций 0043-0045."
                )
            )
            return

        call_command(
            "migrate",
            "api",
            TARGET_MIGRATION,
            database=REMOTE_ALIAS,
            interactive=False,
            verbosity=1,
        )

        verify = MigrationExecutor(
            connections[REMOTE_ALIAS]
        ).migration_plan(
            [("api", TARGET_MIGRATION)]
        )

        remaining = [
            (migration.app_label, migration.name)
            for migration, backwards in verify
            if not backwards
        ]

        if remaining:
            raise CommandError(
                "После APPLY остались ожидающие миграции: "
                + ", ".join(
                    f"{app}.{name}"
                    for app, name in remaining
                )
            )

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                "Готово: api.0043, api.0044 и api.0045 "
                "применены к Supabase и проверены."
            )
        )

    def _assert_local_source(self):
        engine = connections["default"].settings_dict.get("ENGINE", "")

        if engine != "django.db.backends.sqlite3":
            raise CommandError(
                "Источник должен оставаться локальной SQLite. "
                "Supabase не должен быть default."
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
