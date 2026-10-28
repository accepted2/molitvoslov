from __future__ import annotations
import collections
import hashlib
import io
import json
import re
import zipfile
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "molitvoslov-app"
ICONS = APP / "assets/calendar-icons"
MANIFEST = APP / "src/data/calendarIconAssets.js"
APK = APP / "android/app/build/outputs/apk/release/app-release.apk"

def mib(n): return round(n / 1048576, 2)
def main():
    files = sorted(ICONS.glob("*.webp"))
    dims = collections.Counter()
    hashes = collections.defaultdict(list)
    size_total = 0
    too_small = []
    for f in files:
        raw = f.read_bytes()
        size_total += len(raw)
        hashes[hashlib.sha256(raw).hexdigest()].append(f.name)
        with Image.open(io.BytesIO(raw)) as im:
            dims[(im.width // 100 * 100, im.height // 100 * 100)] += 1
            if im.width < 500 or im.height < 650:
                too_small.append((f.name, im.width, im.height, round(len(raw)/1024)))
    duplicate_groups = [v for v in hashes.values() if len(v) > 1]
    print("WEBP files:", len(files), "total MiB:", mib(size_total))
    print("Pixel-identical duplicate groups:", len(duplicate_groups), "extra copies:", sum(len(v)-1 for v in duplicate_groups))
    for group in duplicate_groups[:12]: print("DUPLICATE:", ", ".join(group[:8]))
    print("Icons smaller than 500 px wide or 650 px tall:", len(too_small))
    print("Smallest examples:", sorted(too_small, key=lambda x:x[1]*x[2])[:20])
    print("Common approximate dimensions:", dims.most_common(12))
    if MANIFEST.exists():
        s=MANIFEST.read_text(encoding="utf-8")
        paths = re.findall(r'require\("..\/..\/assets\/calendar-icons\/([^"]+)"\)',s)
        print("Icon references in manifest:",len(paths),"unique referenced files:",len(set(paths)))
    master=APP/"src/data/calendar_2026.json"
    months=sorted((APP/"src/data/calendar").glob("2026-??.json"))
    print("Master year JSON MiB:",mib(master.stat().st_size) if master.exists() else "missing")
    print("12 monthly JSON total MiB:",mib(sum(p.stat().st_size for p in months)))
    if APK.exists():
        with zipfile.ZipFile(APK) as z:
            names=z.namelist()
            print("APK MiB:",mib(APK.stat().st_size))
            print("calendar_2026.json directly packaged:",any(n.endswith("/calendar_2026.json") for n in names))
            print("Raw .webp entries:",len([n for n in names if n.endswith(".webp")]))
            large=sorted((x for x in z.infolist() if not x.is_dir()),key=lambda x:x.compress_size,reverse=True)[:12]
            print("Largest APK entries (compressed MiB):")
            for x in large: print("  ",mib(x.compress_size),x.filename)
    else: print("APK not found; build first for ZIP contents audit")
if __name__=="__main__":main()
