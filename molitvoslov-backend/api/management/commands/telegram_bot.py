"""Команды: /start, /today, /all, /date YYYY-MM-DD, /id, /help.

Запуск: python manage.py telegram_bot
Для постоянной работы нужен отдельный worker/процесс (не gunicorn web).
"""
import logging
import time
from datetime import date, datetime
from zoneinfo import ZoneInfo

from django.core.management.base import BaseCommand, CommandError
from django.db import close_old_connections

from api.telegram_client import (
    TelegramClient, TelegramError, allowed_chat_ids,
)

logger = logging.getLogger(__name__)

HELP = (
    "☦️ Православный календарь\n"
    "/today — сегодня: полное Евангелие, Апостол, притча Соломона, "
    "житие, тропарь и кондак\n"
    "/all — все чтения дня, включая праздничные\n"
    "/date 2026-11-06 — публикация за выбранную дату\n"
    "/id — показать ID чата\n"
    "/help — помощь"
)


class Command(BaseCommand):
    help = "Запустить Telegram-бота на long polling."

    def handle(self, *args, **kwargs):
        try:
            api = TelegramClient()
        except TelegramError as error:
            raise CommandError(str(error)) from error
        self.stdout.write("Telegram-бот запущен (long polling).")
        offset = None
        while True:
            try:
                updates = api.get_updates(offset=offset)
                for update in updates:
                    offset = update["update_id"] + 1
                    message = update.get("message") or {}
                    chat = message.get("chat") or {}
                    chat_id = chat.get("id")
                    if chat_id is None:
                        continue
                    try:
                        self.process(api, chat_id, chat, message)
                    except (LookupError, TelegramError, ValueError) as error:
                        logger.exception("Ошибка обработки команды")
                        api.send_text(chat_id, f"Не удалось подготовить сообщение: {error}")
                    finally:
                        close_old_connections()
            except KeyboardInterrupt:
                self.stdout.write("Бот остановлен.")
                return
            except (TelegramError, OSError) as error:
                # При сетевых ошибках продолжать опрос после короткой задержки.
                logger.warning("Ошибка Telegram: %s", error)
                close_old_connections()
                time.sleep(5)

    def process(self, api, chat_id, chat, message):
        allowed = allowed_chat_ids()
        if allowed and chat_id not in allowed:
            return
        if not allowed and chat.get("type") != "private":
            return  # Группы/каналы работают только через явный список разрешённых ID.
        text = str(message.get("text") or "").strip()
        if not text:
            return
        command, _, args = text.partition(" ")
        command = command.split("@", 1)[0].lower()
        if command in ("/start", "/help"):
            api.send_text(chat_id, HELP)
        elif command == "/id":
            api.send_text(chat_id, f"ID этого чата: {chat_id}")
        elif command in ("/today", "/all", "сегодня"):
            today = datetime.now(ZoneInfo("Europe/Kyiv")).date()
            api.send_publication(chat_id, today, all_readings=command == "/all")
        elif command == "/date":
            try:
                target = date.fromisoformat(args.strip())
            except ValueError:
                api.send_text(chat_id, "Укажите дату: /date 2026-11-06")
                return
            api.send_publication(chat_id, target)
        else:
            api.send_text(chat_id, HELP)
