#!/usr/bin/env python3
"""Read-only image footprint audit for Android APK.

Matches obfuscated Android res/* names to original local assets by SHA-256,
not filename. Works without Pillow, Gradle, npm, git, adb or network.

Examples:
  python -X utf8 tools/audit-apk-image-assets-20261116.py
  python -X utf8 tools/audit-apk-image-assets-20261116.py --top 40
  python -X utf8 tools/audit-apk-image-assets-20261116.py --apk reports/size-trial-compact-native-1.0.30-31.apk

Compares exact file contents. Android/aapt2 may transform some PNG resources;
unmatched entries are UNKNOWN, not necessarily unused or duplicate assets.
Nothing in the APK, sources, calendar, images or personal data is modified.
"""
from __future__ import annotations

import argparse
import collections
import hashlib
import pathlib
import zipfile
import zlib

EXTS = {".png", ".webp", ".jpg", ".jpeg", ".gif", ".avif"}
MIB = 1024 * 1024


def mib(bytes_: int | float) -> str:
    return f"{bytes_ / MIB:,.2f}"


def hash_bytes(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def inventory_sources(root: pathlib.Path) -> dict[tuple[int, str], list[str]]:
    """Use byte count+SHA to avoid matching unrelated image basenames."""
    result: dict[tuple[int, str], list[str]] = collections.defaultdict(list)
    for folder in (root / "assets", root / "src", root / "android" / "app" / "src" / "main" / "res"):
        if not folder.is_dir():
            continue
        for entry in folder.rglob("*"):
            if not entry.is_file() or entry.suffix.lower() not in EXTS:
                continue
            data = entry.read_bytes()
            result[(len(data), hash_bytes(data))].append(
                entry.relative_to(root).as_posix()
            )
    return result


def inspect(apk: pathlib.Path, root: pathlib.Path, top: int = 30) -> dict:
    if not apk.is_file():
        raise FileNotFoundError(f"APK not found: {apk}")
    originals = inventory_sources(root)
    images = []
    with zipfile.ZipFile(apk, "r") as archive:
        for entry in archive.infolist():
            if entry.is_dir() or pathlib.PurePosixPath(entry.filename).suffix.lower() not in EXTS:
                continue
            # ZIP entry images are generally stored without additional ZIP
            # compression. We still measure compressed and uncompressed sizes
            # separately to reflect the exact APK footprint.
            packed = entry.compress_size
            content = archive.read(entry)
            original_paths = originals.get((len(content), hash_bytes(content)), [])
            images.append({
                "zip_name": entry.filename,
                "packed": packed,
                "raw": len(content),
                "source_paths": original_paths,
            })
    images.sort(key=lambda x: x["packed"], reverse=True)
    count = len(images)
    total = sum(x["packed"] for x in images)
    matched = [x for x in images if x["source_paths"]]
    unique_match = sum(x["packed"] for x in matched)
    unknown = total - unique_match
    by_ext = collections.Counter()
    for x in images:
        by_ext[pathlib.PurePosixPath(x["zip_name"]).suffix.lower()] += x["packed"]
    # A single SHA can appear more than once in Android resources under
    # different resource IDs; detect such exact duplicates in the APK.
    file_hashes: dict[tuple[int, str], list[str]] = collections.defaultdict(list)
    with zipfile.ZipFile(apk, "r") as archive:
        for x in images:
            file_hashes[(x["raw"], hash_bytes(archive.read(x["zip_name"])))].append(x["zip_name"])
    repeated_groups = [names for names in file_hashes.values() if len(names) > 1]
    duplicates = sum(len(names) - 1 for names in repeated_groups)

    print("APK:", apk)
    print("Image resource entries:", count)
    print("Total images inside APK (ZIP-compressed):", mib(total), "MiB")
    print("Matched to source bytes:", mib(unique_match), "MiB")
    print("Unmatched (may be transformed or from Android libraries):", mib(unknown), "MiB")
    print("PNG/JPG/WebP etc totals:")
    for ext, bytes_ in by_ext.most_common():
        print(f"  {ext:<6} {mib(bytes_):>8} MiB")
    print(f"Exact duplicate image byte groups INSIDE APK: {len(repeated_groups)} "
          f"({duplicates} additional entries)")
    for group in repeated_groups[:10]:
        print("  DUPLICATE:", " | ".join(group[:5]))
    print(f"\nLargest {top} APK images:")
    for i, x in enumerate(images[:top], 1):
        sources = " ; ".join(x["source_paths"][:3]) if x["source_paths"] else "(no exact source-byte match)"
        if len(x["source_paths"]) > 3:
            sources += f" ; +{len(x['source_paths'])-3} more"
        print(f"{i:>2}. {mib(x['packed']):>6} MiB  {x['zip_name']}")
        print("    source:", sources)
    print("\nREAD ONLY: No files changed. Unmatched resources MUST NOT be deleted based on this audit.")
    return {
        "image_count": count, "compressed_bytes": total,
        "matched_bytes": unique_match, "unmatched_bytes": unknown,
        "duplicates": duplicates, "images": images,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apk", type=pathlib.Path, default=None)
    parser.add_argument("--root", type=pathlib.Path, default=None)
    parser.add_argument("--top", type=int, default=30)
    opts = parser.parse_args()
    root = opts.root.resolve() if opts.root else pathlib.Path(__file__).resolve().parent.parent
    apk = opts.apk or (root / "reports" / "size-trial-compact-native-1.0.30-31.apk")
    if not apk.is_absolute():
        apk = root / apk
    if opts.top < 1 or opts.top > 200:
        parser.error("--top must be between 1 and 200")
    inspect(apk, root, opts.top)


if __name__ == "__main__":
    main()
