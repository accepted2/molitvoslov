from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from api.sqlite_backup import create_sqlite_backup


class Command(BaseCommand):
    help = "Создать безопасную полную резервную копию локальной SQLite базы."

    def add_arguments(self, parser):
        parser.add_argument(
            "--output-dir",
            default="",
            help=(
                "Каталог для копии. По умолчанию: "
                "<backend>/backups/sqlite."
            ),
        )

    def handle(self, *args, **options):
        database = settings.DATABASES["default"]

        if database.get("ENGINE") != "django.db.backends.sqlite3":
            raise CommandError(
                "Команда работает только с локальной SQLite. "
                "Уберите SUPABASE_DB_PASSWORD."
            )

        source_path = Path(database["NAME"])
        output_dir = (
            Path(options["output_dir"]).expanduser()
            if options["output_dir"]
            else Path(settings.BASE_DIR) / "backups" / "sqlite"
        )

        try:
            destination, digest = create_sqlite_backup(source_path, output_dir)
        except Exception as error:
            raise CommandError(f"Не удалось создать резервную копию: {error}") from error

        self.stdout.write(self.style.SUCCESS("Резервная копия создана."))
        self.stdout.write(f"Файл: {destination}")
        self.stdout.write(f"SHA256: {digest}")
