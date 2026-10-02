from __future__ import annotations

import hashlib
import io
import json
import sys
from pathlib import Path

import requests
from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "molitvoslov-app" / "src" / "data" / "calendar_2026.json"
MONTH_DIR = ROOT / "molitvoslov-app" / "src" / "data" / "calendar"
ASSET_DIR = ROOT / "molitvoslov-app" / "assets" / "calendar-icons"
ICON_MODULE = ROOT / "molitvoslov-app" / "src" / "data" / "calendarIconAssets.js"

YEAR = 2026
ICON_MAX_SIZE = (256, 384)
ICON_QUALITY = 80
USER_AGENT = "MolitvoslovOfflineCalendar/1.0"


def load_source() -> dict:
    if not SOURCE.exists():
        raise SystemExit(f"Calendar source not found: {SOURCE}")

    with SOURCE.open("r", encoding="utf-8") as file:
        data = json.load(file)

    if int(data.get("year") or 0) != YEAR:
        raise SystemExit(f"Expected calendar year {YEAR}, got {data.get('year')}")

    days = data.get("days") or {}
    if len(days) not in {365, 366}:
        raise SystemExit(f"Expected a full year, got {len(days)} days")

    return data


def build_month_files(data: dict) -> None:
    MONTH_DIR.mkdir(parents=True, exist_ok=True)

    for stale in MONTH_DIR.glob(f"{YEAR}-??.json"):
        stale.unlink()

    days = data.get("days") or {}

    for month in range(1, 13):
        prefix = f"{YEAR}-{month:02d}-"
        month_days = {
            key: value
            for key, value in days.items()
            if str(key).startswith(prefix)
        }

        payload = {
            "version": data.get("version", 1),
            "year": YEAR,
            "month": month,
            "generated_at": data.get("generated_at"),
            "days": month_days,
        }

        path = MONTH_DIR / f"{YEAR}-{month:02d}.json"
        path.write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )

        print(f"month {month:02d}: {len(month_days)} days -> {path.relative_to(ROOT)}")


def visible_feasts(data: dict) -> list[dict]:
    result = []
    seen = set()

    for day in (data.get("days") or {}).values():
        if not isinstance(day, dict):
            continue

        for language_data in day.values():
            if not isinstance(language_data, dict):
                continue

            feast = language_data.get("main_feast")
            if not feast:
                all_feasts = language_data.get("all_feasts") or []
                feast = all_feasts[0] if all_feasts else None

            if not isinstance(feast, dict):
                continue

            url = str(feast.get("icon_url") or "").strip()
            if not url.startswith(("http://", "https://")):
                continue

            source_id = feast.get("source_id")
            key = (str(source_id) if source_id is not None else "", url)
            if key in seen:
                continue

            seen.add(key)
            result.append(
                {
                    "source_id": source_id,
                    "url": url,
                }
            )

    return result


def download_icon(session: requests.Session, url: str, target: Path) -> None:
    response = session.get(url, timeout=25)
    response.raise_for_status()

    image = Image.open(io.BytesIO(response.content))
    image = ImageOps.exif_transpose(image)

    if image.mode not in {"RGB", "RGBA"}:
        image = image.convert("RGBA" if "A" in image.getbands() else "RGB")

    image.thumbnail(ICON_MAX_SIZE, Image.Resampling.LANCZOS)

    if image.mode == "RGBA":
        background = Image.new("RGB", image.size, (246, 227, 195))
        background.paste(image, mask=image.getchannel("A"))
        image = background
    else:
        image = image.convert("RGB")

    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, "WEBP", quality=ICON_QUALITY, method=6)


def js_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def build_icon_bundle(data: dict) -> None:
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    feasts = visible_feasts(data)

    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})

    source_entries: list[tuple[str, str]] = []
    url_entries: list[tuple[str, str]] = []
    used_files = set()
    failures = []

    for index, feast in enumerate(feasts, start=1):
        url = feast["url"]
        digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:20]
        filename = f"{digest}.webp"
        target = ASSET_DIR / filename

        try:
            if not target.exists() or target.stat().st_size == 0:
                download_icon(session, url, target)

            used_files.add(filename)
            relative_require = f"../../assets/calendar-icons/{filename}"

            source_id = feast.get("source_id")
            if source_id is not None:
                source_entries.append((str(source_id), relative_require))

            url_entries.append((url, relative_require))
            print(f"icon {index}/{len(feasts)}: {filename}")
        except Exception as error:
            failures.append((url, str(error)))
            print(f"WARNING icon failed: {url}: {error}", file=sys.stderr)

    for stale in ASSET_DIR.glob("*.webp"):
        if stale.name not in used_files:
            stale.unlink()

    source_map = {}
    for key, require_path in source_entries:
        source_map.setdefault(key, require_path)

    url_map = {}
    for key, require_path in url_entries:
        url_map.setdefault(key, require_path)

    lines = [
        "// AUTO-GENERATED by .github/scripts/build_calendar_offline_bundle.py",
        "// Do not edit manually.",
        "",
        "const bySourceId = {",
    ]

    for key in sorted(source_map, key=lambda item: (len(item), item)):
        lines.append(f"  {js_string(key)}: require({js_string(source_map[key])}),")

    lines.extend(["};", "", "const byUrl = {"])

    for key in sorted(url_map):
        lines.append(f"  {js_string(key)}: require({js_string(url_map[key])}),")

    lines.extend(
        [
            "};",
            "",
            "export const getBundledCalendarIconSource = (feast) => {",
            "  if (!feast) return null;",
            "",
            "  const sourceId = feast.source_id;",
            "  if (sourceId !== null && sourceId !== undefined) {",
            "    const localById = bySourceId[String(sourceId)];",
            "    if (localById) return localById;",
            "  }",
            "",
            "  const url = String(feast.icon_url || '').trim();",
            "  if (url && byUrl[url]) return byUrl[url];",
            "",
            "  return url ? {uri: url} : null;",
            "};",
            "",
            f"export const bundledCalendarIconCount = {len(used_files)};",
            "",
        ]
    )

    ICON_MODULE.write_text("\n".join(lines), encoding="utf-8")

    print(
        f"icons: {len(used_files)} bundled, {len(failures)} failed -> "
        f"{ICON_MODULE.relative_to(ROOT)}"
    )

    if failures:
        for url, error in failures:
            print(f"FAILED {url}: {error}", file=sys.stderr)
        raise SystemExit(f"Failed to bundle {len(failures)} calendar icons")


def main() -> None:
    data = load_source()
    build_month_files(data)
    build_icon_bundle(data)


if __name__ == "__main__":
    main()
