#!/usr/bin/env python3
"""Verify the 17 lossless Home/Bible WebPs selected for a phone APK.

Source: check image bytes, source requires and pixel identity.
--export-dir: inspect assets actually produced by Metro Android export.
--apk: inspect the contents of the built APK, not merely the source directory.

Only known artwork is checked; calendar icons and personal photo uploads are
not part of this optimisation.
"""
from __future__ import annotations

import argparse
import hashlib
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPECTED = [
    *(f"home/{name}.png" for name in (
        "akathists", "canons", "communion", "evening", "hero",
        "morning", "page_bg2", "page_bg3", "psalter",
    )),
    *(f"bible/evangelists/{name}.png" for name in (
        "john-bg", "john-icon", "luke-bg", "luke-icon",
        "mark-bg", "mark-icon", "matthew-bg", "matthew-icon",
    )),
]
EXPECTED = [Path("assets") / relative for relative in EXPECTED]


def size_mib(n: int) -> str:
    return f"{n / 1024 / 1024:.2f} MiB"


def digest(path: Path) -> str:
    sha = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1 << 20), b""):
            sha.update(block)
    return sha.hexdigest()


def check_source() -> dict:
    try:
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError("Pillow is required: py -3 -m pip install Pillow") from exc
    maps = {
        "home/": (ROOT / "src/data/homeArtwork.js").read_text(encoding="utf-8"),
        "bible/evangelists/": (ROOT / "src/data/bibleArtwork.js").read_text(encoding="utf-8"),
    }
    outputs = {}
    original_size = optimised_size = 0
    for relative in EXPECTED:
        original = ROOT / relative
        converted = original.with_suffix(".webp")
        if not original.is_file() or not converted.is_file():
            raise RuntimeError("Missing PNG or converted WebP: " + str(relative))
        map_text = maps["home/" if relative.parts[1] == "home" else "bible/evangelists/"]
        asset_reference = "../../" + converted.relative_to(ROOT).as_posix()
        png_reference = "../../" + relative.as_posix()
        if f"require('{asset_reference}')" not in map_text:
            raise RuntimeError("APK map does not reference the WebP: " + str(relative))
        if f"require('{png_reference}')" in map_text:
            raise RuntimeError("Original PNG still referenced: " + str(relative))
        with Image.open(original) as png, Image.open(converted) as webp:
            if webp.format != "WEBP" or png.size != webp.size:
                raise RuntimeError("Wrong format or dimensions: " + str(relative))
            if png.convert("RGBA").tobytes() != webp.convert("RGBA").tobytes():
                raise RuntimeError("Image pixels differ: " + str(relative))
        a, b = original.stat().st_size, converted.stat().st_size
        if b >= a:
            raise RuntimeError("WebP isn't smaller than PNG: " + str(relative))
        original_size += a
        optimised_size += b
        outputs[relative.as_posix()] = digest(converted)
    print(f"WEBP SOURCE PASS: {len(outputs)}/17 lossless and referenced")
    print(f"  Original PNG: {size_mib(original_size)}")
    print(f"  Chosen WebP: {size_mib(optimised_size)}")
    print(f"  Raw saving: {size_mib(original_size - optimised_size)}")
    return outputs


def verify_packaged(files, expected: dict, location: str):
    """Every chosen image must be present in the actual build output."""
    outstanding = set(expected.values())
    original_pngs = {digest(ROOT / relative): relative for relative in expected}
    matched = set()
    duplicates = set()
    found_webp = 0
    samples = []
    for name, data in files:
        # Android/Metro may export resources under extensionless hash names.
        # Identify the actual binary format, never trust the ZIP entry name.
        is_webp = data[:4] == b"RIFF" and data[8:12] == b"WEBP"
        is_png = data[:8] == bytes.fromhex("89504e470d0a1a0a")
        if not (is_webp or is_png):
            continue
        signature = hashlib.sha256(data).hexdigest()
        if is_png and signature in original_pngs:
            duplicates.add(original_pngs[signature])
        if is_webp:
            found_webp += 1
            if len(samples) < 10:
                samples.append(name)
            if signature in outstanding:
                matched.add(signature)
    if len(matched) != len(outstanding):
        missing = [file for file, signature in expected.items() if signature not in matched]
        raise RuntimeError(
            f"{location}: only {len(matched)}/{len(outstanding)} exact optimised "
            f"WebPs found. Missing: {missing}. Examples: {samples}"
        )
    if duplicates:
        raise RuntimeError(
            f"{location}: {len(duplicates)} original PNGs are ALSO packaged, "
            f"so lossless WebP does not reduce package size. Duplicates: "
            f"{sorted(duplicates)}"
        )
    print(f"WEBP PACKAGE PASS: {len(matched)}/17 exact WebP files in {location} "
          f"({found_webp} WebP binaries, no original PNG duplicates)")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--export-dir", type=Path, default=None)
    parser.add_argument("--apk", type=Path, default=None)
    options = parser.parse_args()
    expected = check_source()
    if options.export_dir:
        directory = options.export_dir.resolve()
        if not directory.is_dir():
            raise RuntimeError("Metro export folder missing: " + str(directory))
        files = ((str(p.relative_to(directory)), p.read_bytes())
                 for p in directory.rglob("*") if p.is_file())
        verify_packaged(files, expected, str(directory))
    if options.apk:
        apk = options.apk.resolve()
        if not apk.is_file():
            raise RuntimeError("APK not found: " + str(apk))
        with zipfile.ZipFile(apk) as archive:
            files = ((item.filename, archive.read(item)) for item in archive.infolist()
                     if not item.is_dir())
            verify_packaged(files, expected, str(apk))
        print("APK SHA256:", digest(apk))
        print("APK size:", size_mib(apk.stat().st_size))


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, zipfile.BadZipFile) as error:
        print("WEBP VERIFICATION FAILED:", error, file=sys.stderr)
        sys.exit(1)
