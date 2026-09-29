import json
from urllib import error as urllib_error
from urllib import parse as urllib_parse
from urllib import request as urllib_request

from django.conf import settings


class StorageConfigurationError(RuntimeError):
    pass


def _storage_config():
    base_url = str(getattr(settings, "SUPABASE_URL", "") or "").rstrip("/")
    secret_key = str(
        getattr(settings, "SUPABASE_STORAGE_SECRET_KEY", "") or ""
    ).strip()
    bucket = str(
        getattr(settings, "MEMORIAL_STORAGE_BUCKET", "memorials") or "memorials"
    ).strip()

    if not base_url or not secret_key:
        raise StorageConfigurationError(
            "Облачное хранилище фото помянника ещё не настроено."
        )

    return base_url, secret_key, bucket


def _request(method, path, data=None, content_type=None, extra_headers=None):
    base_url, secret_key, _bucket = _storage_config()

    headers = {
        "apikey": secret_key,
        "Authorization": f"Bearer {secret_key}",
    }

    if content_type:
        headers["Content-Type"] = content_type

    if extra_headers:
        headers.update(extra_headers)

    request = urllib_request.Request(
        f"{base_url}/storage/v1{path}",
        data=data,
        headers=headers,
        method=method,
    )

    try:
        with urllib_request.urlopen(request, timeout=30) as response:
            raw = response.read()

            if not raw:
                return {}

            try:
                return json.loads(raw.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                return raw
    except urllib_error.HTTPError as exc:
        raw = exc.read()

        try:
            payload = json.loads(raw.decode("utf-8")) if raw else {}
        except (UnicodeDecodeError, json.JSONDecodeError):
            payload = {}

        message = (
            payload.get("message")
            or payload.get("error")
            or payload.get("statusCode")
            or str(exc)
        )

        raise RuntimeError(str(message)) from exc


def upload_bytes(storage_path, content, content_type):
    _base_url, _secret_key, bucket = _storage_config()

    encoded_bucket = urllib_parse.quote(bucket, safe="")
    encoded_path = urllib_parse.quote(storage_path, safe="/")

    return _request(
        "POST",
        f"/object/{encoded_bucket}/{encoded_path}",
        data=content,
        content_type=content_type,
        extra_headers={
            "x-upsert": "true",
            "cache-control": "3600",
        },
    )


def delete_object(storage_path):
    _base_url, _secret_key, bucket = _storage_config()

    encoded_bucket = urllib_parse.quote(bucket, safe="")
    encoded_path = urllib_parse.quote(storage_path, safe="/")

    return _request(
        "DELETE",
        f"/object/{encoded_bucket}/{encoded_path}",
    )


def create_signed_download_url(storage_path, expires_in=3600):
    base_url, _secret_key, bucket = _storage_config()

    encoded_bucket = urllib_parse.quote(bucket, safe="")
    encoded_path = urllib_parse.quote(storage_path, safe="/")

    payload = json.dumps(
        {
            "expiresIn": int(expires_in),
        }
    ).encode("utf-8")

    result = _request(
        "POST",
        f"/object/sign/{encoded_bucket}/{encoded_path}",
        data=payload,
        content_type="application/json",
    )

    signed_url = (
        result.get("signedURL")
        or result.get("signedUrl")
        or result.get("signed_url")
        or ""
    )

    if not signed_url:
        return ""

    if signed_url.startswith("http://") or signed_url.startswith("https://"):
        return signed_url

    if not signed_url.startswith("/"):
        signed_url = "/" + signed_url

    return f"{base_url}/storage/v1{signed_url}"
