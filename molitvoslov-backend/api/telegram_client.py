"""Минимальный Telegram Bot API клиент. Используется requests из requirements.txt."""
import logging
import os

import requests

from .telegram_daily import all_message_parts, build_daily_publication

logger = logging.getLogger(__name__)


class TelegramError(RuntimeError):
    pass


class TelegramClient:
    def __init__(self, token=None):
        self.token = (token or os.getenv("TELEGRAM_BOT_TOKEN", "")).strip()
        if not self.token:
            raise TelegramError("Задайте TELEGRAM_BOT_TOKEN в переменных среды.")
        self.session = requests.Session()
        self.root = f"https://api.telegram.org/bot{self.token}/"

    def call(self, method, payload, timeout=40):
        try:
            response = self.session.post(
                self.root + method, json=payload, timeout=timeout
            )
            response.raise_for_status()
            data = response.json()
        except (requests.RequestException, ValueError) as error:
            raise TelegramError(f"Ошибка Telegram API ({method}): {error}") from error
        if not data.get("ok"):
            raise TelegramError(
                f"Telegram API ({method}): {data.get('description', 'неизвестная ошибка')}"
            )
        return data.get("result")

    def send_text(self, chat_id, text):
        for part in all_message_parts([text]):
            self.call(
                "sendMessage",
                {"chat_id": chat_id, "text": part, "disable_web_page_preview": True},
            )

    def send_publication(self, chat_id, target_date, all_readings=False):
        icon_url, messages = build_daily_publication(
            target_date, all_readings=all_readings
        )
        if icon_url:
            try:
                self.call(
                    "sendPhoto",
                    {"chat_id": chat_id, "photo": icon_url},
                )
            except TelegramError as error:
                logger.warning("Икону не удалось отправить: %s", error)
        for text in messages:
            self.send_text(chat_id, text)

    def get_updates(self, offset=None):
        payload = {"timeout": 25, "allowed_updates": ["message"]}
        if offset is not None:
            payload["offset"] = offset
        return self.call("getUpdates", payload, timeout=35)


def allowed_chat_ids():
    value = os.getenv("TELEGRAM_ALLOWED_CHAT_IDS", "")
    return {int(item.strip()) for item in value.split(",") if item.strip()}


def target_chat_ids():
    value = os.getenv("TELEGRAM_CHAT_IDS", "")
    return [int(item.strip()) for item in value.split(",") if item.strip()]
