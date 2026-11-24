#!/usr/bin/env python3
"""Reversible, lossless PNG -> WebP experiment for referenced Home/Bible artwork.

This script never removes or overwrites the original PNGs, changes resolution,
changes the image palette intentionally, or touches other project assets.

Usage:
  python tools/prepare_webp_lossless_20261113.py --apply
  python tools/prepare_webp_lossless_20261113.py --check
  python tools/prepare_webp_lossless_20261113.py --restore

Requires Pillow with WebP encoder support: python -m pip install Pillow
"""
from __future__ import annotations

import argparse
import os
import re
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFESTS = (
    ROOT / "src/data/homeArtwork.js",
    ROOT / "src/data/bibleArtwork.js",
)
# Static require() is required by Metro: dynamic paths do not work.
# Only the known artwork folders and only existing require() references qualify.
ASSET_REQUIRE = re.compile(
    r"""(?P<before>require\(['"])(?P<asset>\.\./\.\./assets/"""
    r"""(?:home|bible/evangelists)/[A-Za-z0-9_-]+\.(?:png|webp))"""
    r"""(?P<after>['"]\))"""
)


def mib(size: int) -> str:
    return f"{size / (1024 * 1024):.2f} MiB"


def discover():
    manifests = {}
    assets = {}
    for js_file in MANIFESTS:
        if not js_file.is_file():
            raise RuntimeError(f"Artwork map not found: {js_file}")
        source = js_file.read_bytes().decode("utf-8")
        manifests[js_file] = source
        matches = list(ASSET_REQUIRE.finditer(source))
        if not matches:
            raise RuntimeError(f"No static image references found in {js_file}")
        for match in matches:
            reference = match.group("asset")
            png_relative = str(Path(reference).with_suffix(".png")).replace("\\", "/")
            png_file = (js_file.parent / png_relative).resolve()
            if not png_file.is_relative_to(ROOT / "assets"):
                raise RuntimeError(f"Unexpected asset path: {png_file}")
            if not png_file.is_file():
                raise RuntimeError(f"Original PNG not found: {png_file}")
            assets[(js_file, reference)] = (png_file, png_relative)
    return manifests, assets


def validate_webp(original, candidate) -> bool:
    from PIL import Image
    with Image.open(original) as src, Image.open(candidate) as webp:
        if src.size != webp.size:
            return False
        if webp.format != "WEBP":
            return False
        return src.convert("RGBA").tobytes() == webp.convert("RGBA").tobytes()


def encode_lossless(src, dest):
    from PIL import Image, features
    if not features.check("webp"):
        raise RuntimeError("Pillow was installed without WebP support.")
    with Image.open(src) as img:
        if getattr(img, "n_frames", 1) != 1:
            raise RuntimeError(f"Animated PNG is not supported: {src}")
        save_options = {
            "format": "WEBP",
            "lossless": True,
            "quality": 100,
            "method": 5,
            "exact": True,
        }
        for key in ("icc_profile", "exif", "xmp"):
            if img.info.get(key):
                save_options[key] = img.info[key]
        img.save(dest, **save_options)


def atomic_rewrite(path, content):
    old = path.read_bytes()
    new = content.encode("utf-8")
    if new == old:
        return False
    temp = None
    try:
        with tempfile.NamedTemporaryFile(
            prefix=".artwork-map-", suffix=".js", dir=str(path.parent),
            delete=False,
        ) as handle:
            temp = Path(handle.name)
            handle.write(new)
        os.replace(str(temp), str(path))
    finally:
        if temp and temp.exists():
            temp.unlink()
    return True


def run(action):
    try:
        from PIL import Image  # noqa: F401
    except ImportError as exc:
        raise RuntimeError(
            "Pillow is missing. Run: py -3 -m pip install Pillow"
        ) from exc

    manifests, assets = discover()
    pngs = sorted({png for png, _ in assets.values()})
    converted = {}
    old_total = 0
    new_total = 0

    for png in pngs:
        webp = png.with_suffix(".webp")
        before = png.stat().st_size
        old_total += before

        if action == "restore":
            continue

        if action == "apply":
            temp = None
            try:
                with tempfile.NamedTemporaryFile(
                    prefix=".lossless-", suffix=".webp",
                    dir=str(png.parent), delete=False,
                ) as handle:
                    temp = Path(handle.name)
                encode_lossless(png, temp)
                if not validate_webp(png, temp):
                    raise RuntimeError(f"Pixel mismatch: {png}")
                encoded_bytes = temp.stat().st_size
                if encoded_bytes < before:
                    os.replace(str(temp), str(webp))
                    converted[png] = True
                else:
                    converted[png] = False
                    print(f"KEEP PNG: {png.relative_to(ROOT)} (WebP not smaller)")
            except Exception as exc:
                print(f"SKIP: {png.relative_to(ROOT)}: {exc}")
                converted[png] = False
            finally:
                if temp and temp.exists():
                    temp.unlink()
        else:
            # Check the local output, without writing anything.
            converted[png] = webp.exists() and validate_webp(png, webp)

        target = webp if converted[png] else png
        after = target.stat().st_size
        new_total += after
        print(f"{png.relative_to(ROOT)}: PNG {mib(before)} -> "
              f"{'WebP ' if converted[png] else 'PNG  '}{mib(after)}")

    modified = []
    if action in ("apply", "restore"):
        for js_file, source in manifests.items():
            def replace(match):
                ref = match.group("asset")
                png_file, png_ref = assets[(js_file, ref)]
                replacement = (
                    png_ref.replace(".png", ".webp")
                    if action == "apply" and converted[png_file]
                    else png_ref
                )
                return match.group("before") + replacement + match.group("after")

            updated = ASSET_REQUIRE.sub(replace, source)
            if atomic_rewrite(js_file, updated):
                modified.append(js_file.relative_to(ROOT))

    if action == "restore":
        print("\nPNG references restored. Existing WebP files are preserved.")
    else:
        active = sum(converted.values())
        print(f"\nSelected {active}/{len(pngs)} pixel-identical WebP assets.")
        print(f"Selected PNG originals: {mib(old_total)}")
        print(f"Selected image output: {mib(new_total)}")
        print(f"Estimated raw asset saving: {mib(old_total - new_total)}")
        print("Final APK saving must be measured with analyze-apk-size-20261113.ps1.")
    if modified:
        print("Updated artwork maps:")
        for path in modified:
            print(f"  {path}")
    print("Original PNG files were NOT deleted or modified.")
    print("Calendar icon assets were NOT changed.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--apply", action="store_true",
                       help="Encode, compare decoded pixels, and switch to smaller WebP")
    group.add_argument("--restore", action="store_true",
                       help="Switch artwork maps back to original PNG")
    group.add_argument("--check", action="store_true",
                       help="Verify existing WebP output without writing")
    args = parser.parse_args()
    try:
        run("apply" if args.apply else "restore" if args.restore else "check")
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        sys.exit(1)
