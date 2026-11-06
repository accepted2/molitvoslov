"""Отправка в канал/чаты по cron, Task Scheduler или вручную.

Пример: python manage.py telegram_publish_daily --date 2026-11-06 --preview
"""
from datetime import date, datetime
from zoneinfo import ZoneInfo

from django.core.management.base import BaseCommand, CommandError

from api.telegram_client import TelegramClient, TelegramError, target_chat_ids
from api.telegram_daily import all_message_parts, build_daily_publication


class Command(BaseCommand):
    help = "Опубликовать православные чтения в указанные Telegram-чаты."

    def add_arguments(self, parser):
        parser.add_argument("--date", help="Дата YYYY-MM-DD (по умолчанию сегодня по Киеву)")
        parser.add_argument(
            "--chat-id", action="append", dest="chat_ids",
            help="Telegram chat ID; повторяйте флаг для нескольких чатов.",
        )
        parser.add_argument(
            "--all-readings", action="store_true",
            help="Включить все дополнительные чтения дня.",
        )
        parser.add_argument(
            "--preview", action="store_true", help="Только вывести текст, не отправлять."
        )

    def handle(self, *args, **options):
        try:
            target = (
                date.fromisoformat(options["date"])
                if options["date"]
                else datetime.now(ZoneInfo("Europe/Kyiv")).date()
            )
        except ValueError as error:
            raise CommandError("Дата должна иметь формат YYYY-MM-DD") from error
        try:
            _, messages = build_daily_publication(
                target, all_readings=options["all_readings"]
            )
        except LookupError as error:
            raise CommandError(str(error)) from error

        if options["preview"]:
            for number, part in enumerate(all_message_parts(messages), 1):
                self.stdout.write(f"\n--- СООБЩЕНИЕ {number} ---\n{part}\n")
            return

        chat_ids = options["chat_ids"] or target_chat_ids()
        if not chat_ids:
            raise CommandError(
                "Укажите --chat-id либо переменную TELEGRAM_CHAT_IDS"
            )
        try:
            client = TelegramClient()
            for chat_id in chat_ids:
                client.send_publication(
                    chat_id, target, all_readings=options["all_readings"]
                )
                self.stdout.write(self.style.SUCCESS(f"Отправлено в {chat_id}"))
        except TelegramError as error:
            raise CommandError(str(error)) from error
