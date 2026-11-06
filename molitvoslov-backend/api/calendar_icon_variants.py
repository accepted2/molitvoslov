"""Одна средняя WebP-копия на икону для полностью офлайнового APK.

Оригиналы хранятся вне APK. Для приложения создаётся только WebP
480x640 с полями, без обрезки и искусственного увеличения.
Связь со святой памятью задаётся asset_id (sync_uid/source_id).
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from ipaddress import ip_address
from urllib.parse import urlsplit

CANVASES = {"offline": (480, 640)}
WEBP_QUALITY = 80
BG_COLOR = (244, 239, 229)


def public_https(value):
    """Проверка ссылки для публичной иконы без обращения к сети или Django."""
    try:
        parts = urlsplit(str(value).strip())
        host = parts.hostname or ""
        if parts.scheme != "https" or not host or parts.username or parts.password:
            return False
        if host in {"localhost", "localhost.localdomain"} or host.endswith(".local"):
            return False
        try:
            return ip_address(host).is_global
        except ValueError:
            return True
    except ValueError:
        return False


class LowResolutionIcon(ValueError):
    pass


def render_icon_variants(original_path, output_dir, *, asset_id):
    from PIL import Image, ImageOps, UnidentifiedImageError

    source = Path(original_path)
    if not source.is_file():
        raise FileNotFoundError(source)
    if source.stat().st_size > 30 * 1024 * 1024:
        raise ValueError("Файл более 30 МБ.")
    safe_id = "".join(
        c if c.isascii() and (c.isalnum() or c in "-_") else "-"
        for c in str(asset_id)
    )[:80].strip("-_")
    if not safe_id:
        raise ValueError("Требуется идентификатор изображения (sync_uid или source_id).")
    destination = Path(output_dir)
    try:
        with Image.open(source) as image:
            image.verify()
        with Image.open(source) as image:
            if image.format not in {"PNG", "JPEG", "WEBP"}:
                raise ValueError("Поддерживаются только PNG/JPG/WebP.")
            image = ImageOps.exif_transpose(image)
            width, height = image.size
            if min(width, height) < 800 or max(width, height) < 1100:
                raise LowResolutionIcon(
                    f"Оригинал {width}×{height} недостаточно качественный. "
                    "Нужен новый оригинал, а не увеличение старой превью-копии."
                )
            image = image.convert("RGBA")
            destination.mkdir(parents=True, exist_ok=True)
            variants = {}
            for kind, size in CANVASES.items():
                full = image.copy()
                # thumbnail() только уменьшает, но никогда не увеличивает размер.
                full.thumbnail(size, Image.Resampling.LANCZOS)
                canvas = Image.new("RGBA", size, (*BG_COLOR, 255))
                at = ((size[0] - full.width) // 2, (size[1] - full.height) // 2)
                canvas.alpha_composite(full, dest=at)
                target = destination / f"{safe_id}-{kind}.webp"
                canvas.convert("RGB").save(target, "WEBP", quality=WEBP_QUALITY, method=6)
                variants[kind] = str(target)
    except (OSError, UnidentifiedImageError) as error:
        raise ValueError("Не удалось прочитать исходную икону.") from error

    info = {
        "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "original_width": width,
        "original_height": height,
        "variants": variants,
        "canvases": {key: list(value) for key, value in CANVASES.items()},
        "method": "contain, no crop, no upscale",
        "webp_quality": WEBP_QUALITY,
        "target": "offline APK",
        "file_bytes": Path(variants["offline"]).stat().st_size,
    }
    (destination / f"{safe_id}-metadata.json").write_text(
        json.dumps(info, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return info


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Стандартизировать проверенную икону.")
    parser.add_argument("--source", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--asset-id", required=True, help="sync_uid / source_id")
    options = parser.parse_args()
    result = render_icon_variants(
        options.source, options.out, asset_id=options.asset_id
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
