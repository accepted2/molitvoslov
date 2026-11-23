"""Editor-uploaded calendar icons; use existing Cloudinary configuration."""
import os
import uuid

from django.core.exceptions import ValidationError

from .calendar_icon_storage import (
    CalendarIconStorageError,
    _cloudinary_credentials,
    cloudinary_configured,
)

MAX_ICON_BYTES = 8 * 1024 * 1024


def validate_icon_upload(file):
    if file is None:
        return
    if getattr(file, "size", 0) > MAX_ICON_BYTES:
        raise ValidationError("Икона должна быть не больше 8 МиБ.")
    position = file.tell()
    header = file.read(12)
    file.seek(position)
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return
    if header.startswith(b"\xff\xd8\xff"):
        return
    if header[:4] == b"RIFF" and header[8:12] == b"WEBP":
        return
    raise ValidationError("Загрузите изображение PNG, JPEG или WebP.")


def upload_editor_icon(file):
    validate_icon_upload(file)
    if not cloudinary_configured():
        raise CalendarIconStorageError(
            "Для загрузки икон настройте CLOUDINARY_URL либо CLOUD_NAME, "
            "CLOUD_API_KEY и CLOUD_API_SECRET. Можно также указать icon_url вручную."
        )
    try:
        import cloudinary
        import cloudinary.uploader
    except ImportError as error:
        raise CalendarIconStorageError("Пакет cloudinary не установлен.") from error

    if os.environ.get("CLOUDINARY_URL", "").strip():
        cloudinary.config(secure=True)
    else:
        cloudinary.config(**_cloudinary_credentials(), secure=True)

    file.seek(0)
    try:
        data = cloudinary.uploader.upload(
            file,
            public_id=f"molitvoslov/calendar/manual/{uuid.uuid4().hex}",
            resource_type="image",
            overwrite=False,
            tags=["molitvoslov", "calendar", "editorial"],
        )
    except Exception as error:
        raise CalendarIconStorageError(f"Загрузка иконы не удалась: {error}") from error

    url = str((data or {}).get("secure_url", "") or "").strip()
    if not url:
        raise CalendarIconStorageError("Хранилище не вернуло ссылку на икону.")
    return url
