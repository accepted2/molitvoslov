import os
import re
from urllib.parse import urlparse


class CalendarIconStorageError(RuntimeError):
    pass


def _cloudinary_credentials():
    return {
        "cloud_name": os.environ.get("CLOUD_NAME", "").strip(),
        "api_key": os.environ.get("CLOUD_API_KEY", "").strip(),
        "api_secret": os.environ.get("CLOUD_API_SECRET", "").strip(),
    }


def cloudinary_configured():
    if os.environ.get("CLOUDINARY_URL", "").strip():
        return True

    credentials = _cloudinary_credentials()
    return all(credentials.values())


def azbyka_icon_public_id(source_page_url):
    path = urlparse(source_page_url or "").path.rstrip("/")
    slug = path.rsplit("/", 1)[-1] if path else "calendar-icon"
    slug = re.sub(r"[^a-zA-Z0-9_-]+", "-", slug).strip("-_")
    if not slug:
        slug = "calendar-icon"
    return f"molitvoslov/calendar/azbyka/{slug}"


def upload_azbyka_icon(source_url, source_page_url):
    if not source_url:
        return ""

    if not cloudinary_configured():
        raise CalendarIconStorageError(
            "Cloudinary не настроен. Задайте CLOUDINARY_URL либо "
            "CLOUD_NAME + CLOUD_API_KEY + CLOUD_API_SECRET."
        )

    try:
        import cloudinary
        import cloudinary.uploader
    except ImportError as error:
        raise CalendarIconStorageError(
            "Python-пакет cloudinary не установлен. " "Выполните pip install -r requirements.txt."
        ) from error

    try:
        if os.environ.get("CLOUDINARY_URL", "").strip():
            cloudinary.config(secure=True)
        else:
            cloudinary.config(
                **_cloudinary_credentials(),
                secure=True,
            )

        result = cloudinary.uploader.upload(
            source_url,
            public_id=azbyka_icon_public_id(source_page_url),
            resource_type="image",
            overwrite=True,
            unique_filename=False,
            invalidate=True,
            tags=["molitvoslov", "calendar", "azbyka"],
        )
    except Exception as error:
        raise CalendarIconStorageError(
            f"Cloudinary не смог загрузить {source_url}: {error}"
        ) from error

    secure_url = (result or {}).get("secure_url", "").strip()
    if not secure_url:
        raise CalendarIconStorageError("Cloudinary завершил upload без secure_url.")

    return secure_url
