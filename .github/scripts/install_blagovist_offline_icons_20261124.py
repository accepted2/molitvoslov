#!/usr/bin/env python3
"""Replace obsolete calendar icon assets with verified offline Blagovist WebP files.

This only changes icons, not calendar months, hymns, readings or app UI.
Staging and validation complete before any old tracked icon is removed.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import io
import json
import os
import re
import shutil
import tempfile
import time
from pathlib import Path
from urllib.parse import urlparse

import requests
from PIL import Image, ImageOps, UnidentifiedImageError

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "molitvoslov-app"
DATA = APP / "src/data/calendar"
ASSETS = APP / "assets/calendar-icons"
MODULE = APP / "src/data/calendarIconAssets.js"
AUDIT = APP / "src/data/calendarIconOfflineAudit.json"
CANONICAL = re.compile(r"^blv-[a-z0-9-]+$", re.I)
USER_AGENT = "MolitvoslovOfflineCalendar/1.0 (calendar icon packaging)"
MIN_SHORT_SIDE, MIN_LONG_SIDE = 230, 340
MAX_DOWNLOAD = 16 * 1024 * 1024


def sources():
    selected = {}
    shards = sorted(DATA.glob("uocIconCandidates*.json"), key=lambda p: int(re.search(r"(\d+)", p.stem).group(1)))
    if len(shards) != 12:
        raise RuntimeError("Expected 12 vetted icon shards, got %d" % len(shards))
    for path in shards:
        records = json.loads(path.read_text(encoding="utf-8"))
        for card_id, ru, uk, url in records["items"]:
            if card_id in selected:
                raise RuntimeError("Duplicate canonical ID: " + card_id)
            selected[card_id] = (url, ru, uk)
    # Curated source galleries supersede the thumbnail/candidate when reviewed.
    aliases = {}
    curated = json.loads((DATA / "uocIconCuratedExceptions.json").read_text(encoding="utf-8"))
    for card_id, ru, uk, url, note in curated["items"]:
        selected[card_id] = (url, ru, uk)
        if note == "same_saint_alias_card":
            aliases[card_id] = url
    for card_id, (url, _ru, _uk) in selected.items():
        p = urlparse(url)
        if not CANONICAL.fullmatch(card_id):
            raise RuntimeError("Unsafe icon identity: " + card_id)
        if p.scheme != "https" or p.netloc.lower() not in ("blagovist.info", "www.blagovist.info") or not p.path.startswith("/wp-content/uploads/"):
            raise RuntimeError("Unexpected icon URL for " + card_id)
    if len(selected) < 2700:
        raise RuntimeError("Unexpectedly small curated icon catalogue")
    return selected, aliases


def fetch_icon(url, output):
    last_error = "unknown error"
    for attempt in range(3):
        try:
            with requests.get(url, headers={"User-Agent": USER_AGENT, "Accept": "image/*"}, timeout=(12, 35), stream=True) as resp:
                resp.raise_for_status()
                end = urlparse(resp.url)
                if end.scheme != "https" or end.netloc.lower() not in ("blagovist.info", "www.blagovist.info"):
                    raise ValueError("Redirect outside approved source")
                content = bytearray()
                for block in resp.iter_content(65536):
                    content.extend(block)
                    if len(content) > MAX_DOWNLOAD:
                        raise ValueError("Image exceeds 16 MiB")
                if not str(resp.headers.get("Content-Type", "")).lower().startswith("image/"):
                    raise ValueError("Server returned non-image content")
            with Image.open(io.BytesIO(content)) as src:
                image = ImageOps.exif_transpose(src)
                image.load()
                width, height = image.size
                if min(width, height) < MIN_SHORT_SIDE or max(width, height) < MIN_LONG_SIDE:
                    raise ValueError("Too small: %dx%d" % (width, height))
                image.thumbnail((900, 1200), Image.Resampling.LANCZOS)
                if image.mode == "RGBA":
                    bg = Image.new("RGB", image.size, (247, 236, 220))
                    bg.paste(image, mask=image.getchannel("A"))
                    image = bg
                else:
                    image = image.convert("RGB")
                target = io.BytesIO()
                image.save(target, "WEBP", quality=88, method=5)
                raw = target.getvalue()
            digest = hashlib.sha256(raw).hexdigest()
            filename = digest[:24] + ".webp"
            dest = output / filename
            try:
                with dest.open("xb") as fp:
                    fp.write(raw)
            except FileExistsError:
                if hashlib.sha256(dest.read_bytes()).hexdigest() != digest:
                    raise ValueError("Filename hash collision")
            return {"file": filename, "sha256": digest, "width": width,
                    "height": height, "bytes": len(raw)}
        except (requests.RequestException, UnidentifiedImageError, OSError, ValueError) as exc:
            last_error = str(exc)[:200]
            if attempt < 2:
                time.sleep((attempt + 1) * 1.25)
    return {"error": last_error}


def make_module(cards):
    lines = [
        "// AUTOGENERATED: offline-only Blagovist icons. Do not hand-edit.",
        "// No network fallback, no URL matching and no old Azbyka assets.",
        "const bySourceId = {",
    ]
    for card_id in sorted(cards):
        file = cards[card_id]["file"]
        lines.append("  %s: require(%s)," % (
            json.dumps(card_id), json.dumps("../../assets/calendar-icons/" + file)))
    lines += [
        "};",
        "",
        "export const getBundledCalendarIconSource = (feast) => {",
        "  if (!feast) return null;",
        "  const id = String(feast.source_id || feast.card_id || feast.blagovist_card_id || '');",
        "  return Object.prototype.hasOwnProperty.call(bySourceId, id) ? bySourceId[id] : null;",
        "};",
        "",
        "export const bundledCalendarIconCount = %d;" % len({x["file"] for x in cards.values()}),
        "",
    ]
    return "\n".join(lines)


def verify_only():
    report = json.loads(AUDIT.read_text(encoding="utf-8"))
    code = MODULE.read_text(encoding="utf-8")
    if "{uri:" in code or "byUrl" in code or "selectUocIcon" in code:
        raise RuntimeError("Unexpected network fallback in icon module")
    entries = report["mapped"]
    files = {x["file"] for x in entries.values()}
    actual = {p.name for p in ASSETS.glob("*.webp")}
    if not files or actual != files:
        raise RuntimeError("Referenced local image files differ from packaged assets")
    if len({x["sha256"] for x in entries.values()}) != len(files):
        raise RuntimeError("Duplicate image content remains in asset folder")
    for name in sorted(files):
        file = ASSETS / name
        if hashlib.sha256(file.read_bytes()).hexdigest()[:24] != name[:24]:
            raise RuntimeError("Asset hash mismatch: " + name)
    for card_id in entries:
        if card_id not in code:
            raise RuntimeError("Missing JS icon binding: " + card_id)
    if len(entries) < 2400:
        raise RuntimeError("Too few bundled icons")
    print("PASS: %d mapped IDs and %d unique offline WebP; no obsolete assets or runtime URLs" %
          (len(entries), len(files)))
    print("UNRESOLVED: %d source candidates (no old-image fallback)" % len(report["unresolved"]))


def prepare():
    selected, aliases = sources()
    unique_urls = sorted({info[0] for info in selected.values()})
    print("Downloading %d unique source images for %d canonical icons" %
          (len(unique_urls), len(selected)), flush=True)
    with tempfile.TemporaryDirectory(prefix="molitvoslov-icons-") as td:
        stage = Path(td)
        with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
            results = dict(zip(unique_urls, pool.map(lambda url: fetch_icon(url, stage), unique_urls)))
        mapped, unresolved, digest_owners = {}, {}, {}
        for card_id, (url, ru, uk) in sorted(selected.items()):
            result = results[url]
            if "error" in result:
                unresolved[card_id] = {"reason": result["error"], "title_ru": ru}
                continue
            digest = result["sha256"]
            owner = digest_owners.get(digest)
            # Different saints must never inherit the same image by accident.
            # Nicholas' two confirmed same-saint alias records are an exception
            # and share one physical file, not duplicate WebP copies.
            if owner is not None and not (aliases.get(card_id) == url
                                          and aliases.get(owner) == url):
                unresolved[card_id] = {"reason": "duplicate image for " + owner, "title_ru": ru}
                continue
            digest_owners.setdefault(digest, card_id)
            mapped[card_id] = {**result, "source_url": url, "title_ru": ru, "title_uk": uk}
        if len(mapped) < 2400:
            raise RuntimeError("Refusing replacement: only %d/%d icons passed; old library preserved" %
                               (len(mapped), len(selected)))
        packaged = {item["file"] for item in mapped.values()}
        if not packaged or not all((stage / f).is_file() for f in packaged):
            raise RuntimeError("Incomplete staged icons")
        manifest = {
            "schema": "blagovist-offline-icons-v1",
            "source_candidates": len(selected),
            "mapped": mapped,
            "unresolved": unresolved,
            "unique_webp": len(packaged),
        }
        script = make_module(mapped)
        # The replacement begins only AFTER all downloads, image quality checks
        # and reference generation have succeeded. Git commit remains separate.
        backup = ASSETS.with_name("calendar-icons-pre-blagovist-staging")
        if backup.exists():
            raise RuntimeError("Stale icon backup directory: " + str(backup))
        if ASSETS.exists():
            ASSETS.rename(backup)
        try:
            ASSETS.mkdir(parents=True, exist_ok=False)
            for name in sorted(packaged):
                shutil.copy2(stage / name, ASSETS / name)
            MODULE.write_text(script, encoding="utf-8")
            AUDIT.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
                             encoding="utf-8")
            verify_only()
        except Exception:
            if ASSETS.exists():
                shutil.rmtree(ASSETS)
            if backup.exists():
                backup.rename(ASSETS)
            raise
        else:
            if backup.exists():
                shutil.rmtree(backup)
        print("COMPLETE: replaced old icon library with %d canonical offline icons, %d distinct WebP" %
              (len(mapped), len(packaged)), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify-only", action="store_true")
    parser.add_argument("--probe", action="store_true")
    args = parser.parse_args()
    if args.verify_only:
        verify_only()
    elif args.probe:
        data, _ = sources()
        sample = sorted({row[0] for row in data.values()})[:4]
        with tempfile.TemporaryDirectory() as td:
            outcomes = [fetch_icon(url, Path(td)) for url in sample]
        for u, result in zip(sample, outcomes):
            print(u, result)
        if any("error" in r for r in outcomes):
            raise RuntimeError("Cannot download images from the configured source")
    else:
        prepare()


if __name__ == "__main__":
    main()
