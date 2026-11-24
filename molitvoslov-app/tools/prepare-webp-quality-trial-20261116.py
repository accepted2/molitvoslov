#!/usr/bin/env python3
"""Create reversible high-fidelity WebP *candidates*, without changing the app.

Requirements: Python 3.9+, Pillow with WebP support.
  py -3 -m pip install --user Pillow

Usage:
  py -3 -X utf8 tools/prepare-webp-quality-trial-20261116.py
  py -3 -X utf8 tools/prepare-webp-quality-trial-20261116.py --compare-unknown

Safety:
 - NEVER changes imported assets or src/ code, an APK, Android build, images,
   calendar, database, keystore, existing backups or user content.
 - Writes candidate files, pixel-quality metrics, SHA-256 manifest, and previews
   ONLY under a new reports/webp-quality-trial-* directory.
 - Keeps original dimensions, alpha channel and color profiles.
 - Does not downscale biblical images or change icons unless visual review
   explicitly accepts a later separately applied candidate.
 - Uses high quality WEBP, no forced lossy alpha; rejects weak pixel matches.
"""
from __future__ import annotations

import argparse
import csv
import datetime
import hashlib
import io
import json
import math
import pathlib
import sys
import zipfile

try:
    from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageStat, features
except ImportError as error:
    raise SystemExit(
        "Pillow is required for image quality comparison. Install with: "
        "py -3 -m pip install --user Pillow"
    ) from error

MIB = 1048576
HOME = ("akathists", "canons", "communion", "evening", "hero",
        "morning", "page_bg2", "page_bg3", "psalter")
EVANGELISTS = ("john-bg", "john-icon", "luke-bg", "luke-icon",
               "mark-bg", "mark-icon", "matthew-bg", "matthew-icon")
QUALITY_PRESETS = {
    "home": (90, 95),
    "evangelist-bg": (94, 97),
    "evangelist-icon": (96, 98),
}
PSNR_MIN = {
    "home": 36.5,
    "evangelist-bg": 38.0,
    "evangelist-icon": 40.0,
}
MANIFEST_VERSION = 1


def sha256(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1048576), b""):
            h.update(chunk)
    return h.hexdigest()


def composite(image: Image.Image, background: tuple[int, int, int]) -> Image.Image:
    rgba = image.convert("RGBA")
    back = Image.new("RGBA", image.size, (*background, 255))
    return Image.alpha_composite(back, rgba).convert("RGB")


def psnr(left: Image.Image, right: Image.Image) -> float:
    diff = ImageChops.difference(left, right)
    rms = ImageStat.Stat(diff).rms
    mse = sum(v*v for v in rms) / len(rms)
    return math.inf if mse == 0 else 20 * math.log10(255 / math.sqrt(mse))


def psnr_min_over_backgrounds(left: Image.Image, right: Image.Image) -> float:
    return min(
        psnr(composite(left, (255, 255, 255)), composite(right, (255, 255, 255))),
        psnr(composite(left, (15, 12, 10)), composite(right, (15, 12, 10))),
    )


def alpha_equal(left: Image.Image, right: Image.Image) -> bool:
    if ("A" not in left.getbands()) and ("A" not in right.getbands()):
        return True
    return ImageChops.difference(
        left.convert("RGBA").getchannel("A"),
        right.convert("RGBA").getchannel("A"),
    ).getbbox() is None


def save_preview(source: Image.Image, target: Image.Image,
                 file: pathlib.Path, title: str, quality: int) -> None:
    # Two horizontal previews with same scale; enough to inspect textures at
    # screenshot size. Original pixels are not modified.
    width = 460
    max_height = 500
    target_size = lambda im: (
        max(1, round(im.width*min(width/im.width, max_height/im.height, 1))),
        max(1, round(im.height*min(width/im.width, max_height/im.height, 1))),
    )
    size = target_size(source)
    a = composite(source, (250, 248, 244)).resize(size, Image.Resampling.LANCZOS)
    b = composite(target, (250, 248, 244)).resize(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (2*width+24, size[1]+65), (246, 242, 236))
    canvas.paste(a, (0, 55))
    canvas.paste(b, (width+24, 55))
    draw = ImageDraw.Draw(canvas)
    draw.text((8, 7), f"{title}  ORIGINAL", fill=(35, 27, 20))
    draw.text((width+30, 7), f"WEBP Q{quality}  CANDIDATE", fill=(35, 27, 20))
    file.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(file, "PNG", optimize=True)


def audit_unknown_png(apk: pathlib.Path, root: pathlib.Path) -> None:
    if not apk.exists():
        print("UNKNOWN PNG audit skipped; APK missing:", apk)
        return
    with zipfile.ZipFile(apk) as z:
        name = "res/xE.png"
        if name not in z.namelist():
            print("UNKNOWN PNG audit skipped; not found:", name)
            return
        target = Image.open(io.BytesIO(z.read(name)))
        pixels = target.convert("RGBA")
        target_bytes = hashlib.sha256(pixels.tobytes()).hexdigest()
        matches = []
        for folder in (root/"assets", root/"src"):
            if not folder.is_dir():
                continue
            for img in folder.rglob("*"):
                if not img.is_file() or img.suffix.lower() not in (".png", ".webp", ".jpg", ".jpeg"):
                    continue
                try:
                    with Image.open(img) as source:
                        if source.size != target.size:
                            continue
                        if hashlib.sha256(source.convert("RGBA").tobytes()).hexdigest() == target_bytes:
                            matches.append(img.relative_to(root).as_posix())
                except (OSError, ValueError):
                    continue
        print("UNKNOWN PNG res/xE.png:", f"{target.width}x{target.height}")
        if matches:
            print("EXACT decoded pixel matches:", "; ".join(matches))
        else:
            print("No exact decoded pixel match. Android might have transformed pixels.")
        print("Nothing changed.")


def prepare(root: pathlib.Path, report_dir: pathlib.Path) -> None:
    if not features.check("webp"):
        raise RuntimeError("Installed Pillow has no WebP support.")
    if not (root/"src"/"data"/"homeArtwork.js").is_file():
        raise RuntimeError("Expected Molitvoslov project sources not found.")
    if report_dir.exists():
        raise RuntimeError("Trial directory already exists; refusing to overwrite: "+str(report_dir))
    report_dir.mkdir(parents=True, exist_ok=False)
    manifest = {
        "format": "molitvoslov-webp-quality-trial",
        "version": MANIFEST_VERSION,
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "preserves_sources": True,
        "entries": [],
    }
    total_src = 0
    totals = {label: 0 for label in QUALITY_PRESETS}
    written = 0
    rows = []
    try:
        for section, filenames in (
            ("home", HOME), ("bible/evangelists", EVANGELISTS)
        ):
            for name in filenames:
                kind = "home" if section == "home" else (
                    "evangelist-icon" if name.endswith("-icon") else "evangelist-bg"
                )
                # Source _opt is the renamed artifact imported into release by
                # the earlier PNG/WebP collision fix. Originals remain intact.
                original = root/"assets"/section/(name+"_opt.webp")
                if not original.is_file():
                    raise RuntimeError("Source optimized WebP missing: "+str(original))
                file_size = original.stat().st_size
                total_src += file_size
                with Image.open(original) as base:
                    base.load()
                    base_size = base.size
                    entry = {
                        "source": original.relative_to(root).as_posix(),
                        "source_sha256": sha256(original),
                        "source_bytes": file_size,
                        "kind": kind,
                        "dimensions": list(base.size),
                        "candidates": [],
                    }
                    for quality in QUALITY_PRESETS[kind]:
                        temp_dir = report_dir/"candidates"/("q"+str(quality))/section
                        temp_dir.mkdir(parents=True, exist_ok=True)
                        dest = temp_dir/(name+"_size.webp")
                        kwargs = {
                            "format": "WEBP", "quality": quality, "method": 6,
                            "lossless": False, "exact": True,
                            "alpha_quality": 100,
                        }
                        if base.info.get("icc_profile"):
                            kwargs["icc_profile"] = base.info["icc_profile"]
                        if base.info.get("exif"):
                            kwargs["exif"] = base.info["exif"]
                        base.save(dest, **kwargs)
                        with Image.open(dest) as candidate:
                            candidate.load()
                            if candidate.size != base_size:
                                raise RuntimeError("Pixel dimensions changed: "+str(dest))
                            if not alpha_equal(base, candidate):
                                raise RuntimeError("Alpha channel changed: "+str(dest))
                            score = psnr_min_over_backgrounds(base, candidate)
                            if score < PSNR_MIN[kind]:
                                status = "LOW_PSNR_REVIEW"
                            elif dest.stat().st_size >= file_size:
                                status = "NO_SIZE_SAVING"
                            else:
                                status = "REVIEW_VISUALLY"
                            saved = file_size-dest.stat().st_size
                            rel = dest.relative_to(report_dir).as_posix()
                            item = {
                                "quality": quality,
                                "path": rel,
                                "sha256": sha256(dest),
                                "bytes": dest.stat().st_size,
                                "saved_bytes": saved,
                                "psnr_min_db": round(score, 2) if math.isfinite(score) else 999.0,
                                "status": status,
                            }
                            entry["candidates"].append(item)
                            totals[kind] += dest.stat().st_size
                            rows.append({
                                "asset": entry["source"], "category": kind,
                                "resolution": f"{base.width}x{base.height}",
                                "original_mib": round(file_size/MIB, 3),
                                "quality": quality,
                                "candidate_mib": round(dest.stat().st_size/MIB, 3),
                                "saving_mib": round(saved/MIB, 3),
                                "psnr_min_db": item["psnr_min_db"],
                                "status": status,
                            })
                            written += 1
                            # Always provide same-size side-by-side preview,
                            # even when candidate fails quality criteria.
                            save_preview(
                                base, candidate,
                                report_dir/"previews"/("q"+str(quality))/
                                section/(name+".png"),
                                section+"/"+name, quality,
                            )
                    manifest["entries"].append(entry)
                qlist = ", ".join(
                    f"Q{x['quality']} {x['bytes']/MIB:.2f} MiB "
                    f"(PSNR {x['psnr_min_db']} dB; {x['status']})"
                    for x in entry["candidates"]
                )
                print(f"{section}/{name}: source {file_size/MIB:.2f} MiB => {qlist}")

        manifest["source_total_bytes"] = total_src
        manifest["total_candidates"] = written
        with (report_dir/"manifest.json").open("w",encoding="utf8") as f:
            json.dump(manifest,f,ensure_ascii=False,indent=2)
        with (report_dir/"summary.csv").open("w",newline="",encoding="utf-8-sig") as f:
            writer=csv.DictWriter(f,fieldnames=[
                "asset","category","resolution","original_mib","quality",
                "candidate_mib","saving_mib","psnr_min_db","status"
            ])
            writer.writeheader()
            writer.writerows(rows)
        print("\nSOURCE WEBPs:",f"{total_src/MIB:.2f} MiB")
        for quality in sorted({q for v in QUALITY_PRESETS.values() for q in v}):
            option_sizes = []
            pass_count = 0
            saved = 0
            for entry in manifest["entries"]:
                opt = next((x for x in entry["candidates"] if x["quality"]==quality),None)
                if opt is not None:
                    saved+=entry["source_bytes"]-opt["bytes"]
                    pass_count+=int(opt["status"]=="REVIEW_VISUALLY")
                    option_sizes.append(opt["bytes"])
            if option_sizes:
                print(f"Q{quality}: {len(option_sizes)} candidates, "
                      f"{pass_count} above minimum PSNR & smaller, "
                      f"{saved/MIB:.2f} MiB raw possible saving")
        print("PREVIEWS:",report_dir/"previews")
        print("MANIFEST:",report_dir/"manifest.json")
        print("CSV:",report_dir/"summary.csv")
        print("READ ONLY APP: only report candidates and previews created; no app files changed.")
    except BaseException:
        # Incomplete candidate runs should never look like validated trials.
        if (report_dir/"manifest.json").exists():
            (report_dir/"manifest.json").unlink()
        raise


def main() -> None:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root",type=pathlib.Path)
    parser.add_argument("--compare-unknown",action="store_true")
    parser.add_argument("--apk",type=pathlib.Path)
    args=parser.parse_args()
    root=args.root.resolve() if args.root else pathlib.Path(__file__).resolve().parent.parent
    if args.compare_unknown:
        apk=args.apk or root/"reports"/"size-trial-compact-native-1.0.30-31.apk"
        if not apk.is_absolute():
            apk=root/apk
        audit_unknown_png(apk,root)
        return
    now=datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    trial=root/"reports"/("webp-quality-trial-"+now)
    prepare(root,trial)


if __name__=="__main__":
    main()
