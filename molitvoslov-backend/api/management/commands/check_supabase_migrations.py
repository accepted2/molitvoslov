import os

from django.core.management.base import BaseCommand, CommandError
from django.db import connections
from django.db.migrations.executor import MigrationExecutor


REMOTE_ALIAS = "supabase_sync"


class Command(BaseCommand):
    help = (
        "Показывает состояние миграций схемы Supabase, используя отдельный "
        "alias supabase_sync. Ничего не изменяет."
    )

    def handle(self, *args, **options):
        self._assert_local_source()
        self._configure_supabase_connection()

        try:
            connection = connections[REMOTE_ALIAS]
            connection.ensure_connection()
            executor = MigrationExecutor(connection)
        except Exception as error:
            raise CommandError(
                f"Не удалось подключиться к Supabase: {error}"
            ) from error

        applied = executor.loader.applied_migrations
        leaf_nodes = executor.loader.graph.leaf_nodes()
        plan = executor.migration_plan(leaf_nodes)

        api_applied = sorted(
            name
            for app_label, name in applied
            if app_label == "api"
        )

        self.stdout.write("")
        self.stdout.write(self.style.MIGRATE_HEADING("Supabase migration status"))
        self.stdout.write(
            "Последняя применённая api-миграция: "
            + (api_applied[-1] if api_applied else "нет")
        )

        if not plan:
            self.stdout.write(self.style.SUCCESS("Ожидающих миграций нет."))
            return

        self.stdout.write(self.style.WARNING("Ожидающие миграции:"))

        for migration, backwards in plan:
            direction = "UNAPPLY" if backwards else "APPLY"
            self.stdout.write(
                f"  {direction} {migration.app_label}.{migration.name}"
            )

        self.stdout.write("")
        self.stdout.write(
            self.style.WARNING(
                "Команда только проверяет состояние. Supabase не изменён."
            )
        )

    def _assert_local_source(self):
        engine = connections["default"].settings_dict.get("ENGINE", "")
        if engine != "django.db.backends.sqlite3":
            raise CommandError(
                "Источник должен оставаться локальной SQLite."
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
