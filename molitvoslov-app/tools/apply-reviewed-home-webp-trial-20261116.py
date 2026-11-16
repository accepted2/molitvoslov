#!/usr/bin/env python3
"""Apply ONLY five pre-screened Q95 WebP candidates to a trial checkout.

This is NOT a release step; always visually inspect the side-by-side PNGs
before --apply. Saint/evangelist icons, their backgrounds, calendar icons,
the newly identified page_bg4.png, fonts, Bible and calendar are untouched.

Read-only:
  py -3 -X utf8 tools/apply-reviewed-home-webp-trial-20261116.py --manifest reports/webp-quality-trial-.../manifest.json

Experimental apply:
  py -3 -X utf8 tools/apply-reviewed-home-webp-trial-20261116.py --manifest reports/webp-quality-trial-.../manifest.json --apply

Restore exact source bytes:
  py -3 -X utf8 tools/apply-reviewed-home-webp-trial-20261116.py --restore reports/webp-originals-before-q95-...

Requirements: Python 3.9+, Pillow. Creates SHA-256 checked backups under reports/
before touching any sources, then updates both identical .webp and _opt.webp
aliases to prevent accidentally packaging two versions of the same image.
"""
from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import os
import pathlib
import shutil
import sys

try:
    from PIL import Image, ImageChops, ImageStat
except ImportError as exc:
    raise SystemExit("Install Pillow: py -3 -m pip install --user Pillow") from exc

# Only these five qualify under the established home Q95 PSNR gate.
SAFE = ("canons", "communion", "hero", "page_bg2", "page_bg3")
MIN_PSNR = 36.5
MIN_QUALITY = 95


def sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def psnr(a: Image.Image, b: Image.Image) -> float:
    import math
    a, b = a.convert("RGBA"), b.convert("RGBA")
    scores = []
    for background in ((255, 255, 255, 255), (15, 12, 10, 255)):
        layer1 = Image.new("RGBA", a.size, background)
        layer2 = Image.new("RGBA", b.size, background)
        rgb1 = Image.alpha_composite(layer1, a).convert("RGB")
        rgb2 = Image.alpha_composite(layer2, b).convert("RGB")
        rms = ImageStat.Stat(ImageChops.difference(rgb1, rgb2)).rms
        mse = sum(v * v for v in rms) / len(rms)
        scores.append(999.0 if mse == 0 else 20 * math.log10(255 / math.sqrt(mse)))
    return min(scores)


def ensure_inside(file: pathlib.Path, directory: pathlib.Path) -> pathlib.Path:
    full = file.resolve()
    if directory.resolve() not in full.parents:
        raise RuntimeError("File is outside expected directory: " + str(full))
    return full


def generated_resources(root: pathlib.Path) -> pathlib.Path:
    return root / "android" / "app" / "build" / "generated" / "res" / "react" / "release"


def invalidate_generated(root: pathlib.Path) -> None:
    folder = generated_resources(root)
    if folder.is_dir():
        shutil.rmtree(folder)
        print("Invalidated only stale Android RELEASE generated resources:", folder)


def atomic_replace(file: pathlib.Path, source_bytes: bytes) -> None:
    temp = file.with_name(file.name + ".webp-quality-staging.tmp")
    if temp.exists():
        raise RuntimeError("Refusing to overwrite existing staging file: " + str(temp))
    try:
        temp.write_bytes(source_bytes)
        os.replace(temp, file)
    finally:
        if temp.exists():
            temp.unlink()


def source_aliases(root: pathlib.Path, name: str) -> list[pathlib.Path]:
    return [root / "assets" / "home" / (name + "_opt.webp"),
            root / "assets" / "home" / (name + ".webp")]


def restore(root: pathlib.Path, folder: pathlib.Path) -> None:
    report_root = root / "reports"
    folder = ensure_inside(folder, report_root)
    if not folder.name.startswith("webp-originals-before-q95-"):
        raise RuntimeError("Not a recognized Q95 originals backup.")
    manifest_file = folder / "backup-manifest.json"
    if not manifest_file.is_file():
        raise RuntimeError("Backup manifest missing.")
    manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    rows = manifest.get("files")
    if manifest.get("format") != "webp-originals-before-q95-v1" or len(rows or []) != len(SAFE) * 2:
        raise RuntimeError("Invalid backup manifest.")
    requested = {path.relative_to(root).as_posix()
                 for name in SAFE for path in source_aliases(root, name)}
    actual = {item["path"] for item in rows}
    if requested != actual:
        raise RuntimeError("Backup does not contain exactly the five approved image pairs.")
    pairs = []
    for item in rows:
        target = ensure_inside(root / item["path"], root / "assets" / "home")
        old = ensure_inside(folder / item["path"], folder)
        if not old.is_file() or sha256(old) != item["sha256"]:
            raise RuntimeError("Corrupt backup or hash mismatch: " + item["path"])
        pairs.append((target, old.read_bytes()))
    for dest, old in pairs:
        atomic_replace(dest, old)
    invalidate_generated(root)
    print("RESTORED: exact original bytes for five source image pairs.")
    print("Backup retained:", folder)


def prepare(root: pathlib.Path, manifest_file: pathlib.Path, apply: bool) -> None:
    report_root = root / "reports"
    manifest_file = ensure_inside(manifest_file, report_root)
    if manifest_file.name != "manifest.json" or not manifest_file.parent.name.startswith("webp-quality-trial-"):
        raise RuntimeError("Expected manifest.json inside reports/webp-quality-trial-*.")
    manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    if manifest.get("format") != "molitvoslov-webp-quality-trial" or manifest.get("version") != 1:
        raise RuntimeError("Unexpected quality-trial manifest version.")
    entries = {row["source"]: row for row in manifest.get("entries", [])}
    plan = []
    old_total = 0
    new_total = 0
    for name in SAFE:
        original, alias = source_aliases(root, name)
        relative = original.relative_to(root).as_posix()
        entry = entries.get(relative)
        if not entry or entry.get("kind") != "home":
            raise RuntimeError("Approved source not in manifest: " + relative)
        choices = [x for x in entry.get("candidates", []) if x.get("quality") == MIN_QUALITY]
        if len(choices) != 1:
            raise RuntimeError("Missing or duplicate Q95 candidate: " + relative)
        choice = choices[0]
        if choice.get("status") != "REVIEW_VISUALLY":
            raise RuntimeError("Candidate did not clear automated quality gate: " + relative)
        candidate = ensure_inside(manifest_file.parent / choice["path"], manifest_file.parent)
        preview = manifest_file.parent / "previews" / "q95" / "home" / (name + ".png")
        if not candidate.is_file() or not preview.is_file():
            raise RuntimeError("Candidate and visual preview are required: " + name)
        if candidate.suffix.lower() != ".webp" or not original.is_file() or not alias.is_file():
            raise RuntimeError("Original or candidate WebP missing: " + name)
        if sha256(original) != entry["source_sha256"] or sha256(alias) != entry["source_sha256"]:
            raise RuntimeError("Source aliases differ from approved originals: " + name)
        if sha256(candidate) != choice["sha256"] or candidate.stat().st_size != choice["bytes"]:
            raise RuntimeError("Candidate differs from generated manifest: " + name)
        if candidate.stat().st_size >= original.stat().st_size:
            raise RuntimeError("Candidate does not reduce size: " + name)
        with Image.open(original) as old_img, Image.open(candidate) as new_img:
            old_img.load()
            new_img.load()
            if old_img.size != new_img.size or list(old_img.size) != entry["dimensions"]:
                raise RuntimeError("Image dimensions changed: " + name)
            alpha_old = old_img.convert("RGBA").getchannel("A")
            alpha_new = new_img.convert("RGBA").getchannel("A")
            if ImageChops.difference(alpha_old, alpha_new).getbbox() is not None:
                raise RuntimeError("Transparency changed: " + name)
            quality_score = psnr(old_img, new_img)
            if quality_score < MIN_PSNR:
                raise RuntimeError(f"PSNR below {MIN_PSNR} dB ({quality_score:.2f}) for {name}")
        source_data = candidate.read_bytes()
        plan.append({"name": name, "files": (original, alias), "bytes": source_data,
                     "source_sha256": entry["source_sha256"], "candidate_sha256": choice["sha256"]})
        old_total += original.stat().st_size
        new_total += len(source_data)
        print(f"QUALIFIED: {name} Q95, {original.stat().st_size/1048576:.2f} -> "
              f"{len(source_data)/1048576:.2f} MiB; PSNR {quality_score:.2f} dB; "
              f"preview: {preview}")
    print(f"\nExpected APK image savings, before any Android res overhead: "
          f"{(old_total-new_total)/1048576:.2f} MiB.")
    if not apply:
        print("DRY RUN. Review all five side-by-side previews before --apply.")
        print("No app source, APK or other files changed.")
        return
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    backup = report_root / ("webp-originals-before-q95-" + stamp)
    backup.mkdir(parents=True, exist_ok=False)
    backup_rows = []
    for item in plan:
        for source in item["files"]:
            relative = source.relative_to(root)
            saved = backup / relative
            saved.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, saved)
            if sha256(saved) != item["source_sha256"]:
                raise RuntimeError("Backup SHA mismatch; refusing to apply: " + str(source))
            backup_rows.append({"path": relative.as_posix(), "sha256": item["source_sha256"]})
    (backup / "backup-manifest.json").write_text(
        json.dumps({"format": "webp-originals-before-q95-v1", "files": backup_rows},
                   indent=2), encoding="utf-8")
    applied = []
    try:
        for item in plan:
            for source in item["files"]:
                atomic_replace(source, item["bytes"])
                applied.append(source)
                if sha256(source) != item["candidate_sha256"]:
                    raise RuntimeError("Applied bytes differ from candidate: " + str(source))
    except Exception:
        for source in applied:
            saved = backup / source.relative_to(root)
            atomic_replace(source, saved.read_bytes())
        raise
    invalidate_generated(root)
    print("\nAPPLIED: five Q95 image variants to BOTH .webp and _opt.webp aliases.")
    print("ALL originals backed up with SHA-256:", backup)
    print("Restore with: py -3 -X utf8 tools/apply-reviewed-home-webp-trial-20261116.py --restore \""
          + str(backup) + "\"")
    print("Rebuild a new compact trial APK. Do not replace a tested APK yet.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=pathlib.Path)
    parser.add_argument("--manifest", type=pathlib.Path)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--restore", type=pathlib.Path)
    a = parser.parse_args()
    root = a.root.resolve() if a.root else pathlib.Path(__file__).resolve().parent.parent
    if a.restore:
        if a.apply or a.manifest:
            parser.error("--restore cannot be combined with --apply/--manifest")
        folder = a.restore if a.restore.is_absolute() else root / a.restore
        restore(root, folder)
    else:
        if not a.manifest:
            parser.error("--manifest is required for inspection or --apply")
        source = a.manifest if a.manifest.is_absolute() else root / a.manifest
        prepare(root, source, a.apply)


if __name__ == "__main__":
    main()
