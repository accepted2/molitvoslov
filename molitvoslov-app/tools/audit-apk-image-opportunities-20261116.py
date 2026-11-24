#!/usr/bin/env python3
"""Read-only image audit: true APK duplicates, source mappings and pixel sizes.

Works with Python 3.8+ standard library. No Pillow, ImageMagick or native
build required. Does not alter APK, source assets or personal data.

Run:
  py -3 -X utf8 tools/audit-apk-image-opportunities-20261116.py --top 35
"""
from __future__ import annotations
import argparse
import collections
import hashlib
import pathlib
import struct
import zipfile

MIB = 1048576
EXTS = {'.webp', '.png', '.jpg', '.jpeg', '.gif', '.avif'}


def fmt(n: float) -> str:
    return f'{n/MIB:.2f} MiB'


def image_dimensions(data: bytes, extension: str = '') -> tuple[int, int] | None:
    if len(data) >= 24 and data[:8] == b'\x89PNG\r\n\x1a\n' and data[12:16] == b'IHDR':
        width, height = struct.unpack_from('>II', data, 16)
        return (width, height) if width and height else None
    if len(data) >= 30 and data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        typ = data[12:16]
        if typ == b'VP8X':
            w = 1 + int.from_bytes(data[24:27], 'little')
            h = 1 + int.from_bytes(data[27:30], 'little')
            return w, h
        if typ == b'VP8 ' and data[23:26] == b'\x9d\x01\x2a':
            w, h = struct.unpack_from('<HH', data, 26)
            return w & 0x3fff, h & 0x3fff
        if typ == b'VP8L' and data[20:21] == b'\x2f' and len(data) >= 25:
            b0, b1, b2, b3 = data[21:25]
            return 1 + (b0 | (b1 & 0x3f) << 8), 1 + (b1 >> 6 | b2 << 2 | (b3 & 0x0f) << 10)
    if len(data) >= 10 and data[:6] in (b'GIF87a', b'GIF89a'):
        return struct.unpack_from('<HH', data, 6)
    if len(data) > 4 and data[:2] == b'\xff\xd8':
        i = 2
        while i + 4 < len(data):
            if data[i] != 0xff:
                i += 1
                continue
            j = i + 1
            while j < len(data) and data[j] == 0xff:
                j += 1
            if j + 2 >= len(data):
                break
            marker = data[j]
            i = j + 1
            if marker in (0xd8, 0xd9, 0x01) or 0xd0 <= marker <= 0xd7:
                continue
            block_len = int.from_bytes(data[i:i+2], 'big')
            if block_len < 2 or i + block_len > len(data):
                break
            if marker in (0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
                          0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf) and block_len >= 7:
                height = int.from_bytes(data[i+3:i+5], 'big')
                width = int.from_bytes(data[i+5:i+7], 'big')
                return (width, height) if width and height else None
            i += block_len
    return None


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def lookup_sources(root: pathlib.Path) -> dict[tuple[int, str], list[str]]:
    source = collections.defaultdict(list)
    for base in (root / 'assets', root / 'src', root / 'android' / 'app' / 'src' / 'main' / 'res'):
        if not base.is_dir():
            continue
        for entry in base.rglob('*'):
            if entry.is_file() and entry.suffix.lower() in EXTS:
                data = entry.read_bytes()
                source[(len(data), sha(data))].append(entry.relative_to(root).as_posix())
    return source


def origin_category(paths: list[str]) -> str:
    if not paths:
        return 'Unmatched / transformed'
    file = paths[0]
    for prefix in ('assets/bible/evangelists/', 'assets/home/',
                   'assets/calendar-icons/', 'assets/onboarding/', 'assets/fonts/',
                   'android/app/src/main/res/'):
        if file.startswith(prefix):
            return prefix.rstrip('/')
    return 'Other source assets'


def inspect(apk: pathlib.Path, root: pathlib.Path, top: int = 35) -> dict:
    if not apk.is_file():
        raise FileNotFoundError(f'APK missing: {apk}')
    known = lookup_sources(root)
    rows = []
    dupe_groups = collections.defaultdict(list)
    with zipfile.ZipFile(apk, 'r') as z:
        for entry in z.infolist():
            ext = pathlib.PurePosixPath(entry.filename).suffix.lower()
            if entry.is_dir() or ext not in EXTS:
                continue
            data = z.read(entry)
            key = (len(data), sha(data))
            paths = known.get(key, [])
            row = {
                'name': entry.filename,
                'packed': entry.compress_size,
                'raw': len(data),
                'size': image_dimensions(data, ext),
                'paths': paths,
                'category': origin_category(paths),
                'sha': key[1],
            }
            rows.append(row)
            dupe_groups[key].append(row)
    rows.sort(key=lambda r: r['packed'], reverse=True)
    total = sum(x['packed'] for x in rows)
    actual_dupes = [items for items in dupe_groups.values() if len(items)>1]
    avoidable_bytes = sum(
        sum(x['packed'] for x in group) - max(x['packed'] for x in group)
        for group in actual_dupes
    )
    categories = collections.Counter()
    for row in rows:
        categories[row['category']] += row['packed']
    print('APK:', apk)
    print('Images inside APK:', len(rows), '| compressed:', fmt(total))
    print('Exact duplicate-byte groups:', len(actual_dupes),
          '| additional entries:', sum(len(x)-1 for x in actual_dupes))
    print('Sum of redundant duplicate ZIP entries:', fmt(avoidable_bytes),
          '(upper bound only; source references must remain valid)')
    print('\nAPK image footprint by source directory:')
    for category, size in categories.most_common():
        print(' ', category.ljust(35), fmt(size))
    print('\nTop duplicate image groups by estimated excess compressed size:')
    ranked_dupes = sorted(
        actual_dupes,
        key=lambda x: sum(r['packed'] for r in x) - max(r['packed'] for r in x),
        reverse=True
    )
    for group in ranked_dupes[:12]:
        extra = sum(r['packed'] for r in group) - max(r['packed'] for r in group)
        print(' ', fmt(extra).rjust(11), '|', len(group), 'entries |',
              ', '.join(r['name'] for r in group[:4]))
        if group[0]['paths']:
            print('   source:', ' ; '.join(group[0]['paths'][:2]))
    print(f'\nTop {top} individual APK images (real ZIP bytes, width x height):')
    for idx, row in enumerate(rows[:top], 1):
        dims = f'{row["size"][0]} x {row["size"][1]}' if row['size'] else 'unknown dimensions'
        paths = ' ; '.join(row['paths'][:2]) if row['paths'] else 'unknown / transformed'
        print(f' {idx:>2}. {fmt(row["packed"]):>10} | {dims:<15} | {row["name"]}')
        print('     ', paths)
    large = [x for x in rows if x['packed'] > MIB and x['size'] and
             max(x['size']) > 1920]
    print('\nOver 1 MiB and wider/taller than 1920px:', len(large),
          '(candidate for visual-quality review, not automatic resizing)')
    print('READ ONLY: no assets changed; do not delete obfuscated APK resources.')
    return {
        'total': total, 'rows': rows, 'duplicate_groups': len(actual_dupes),
        'additional_entries': sum(len(x)-1 for x in actual_dupes),
        'duplicate_compressed_bytes': avoidable_bytes,
        'category_bytes': categories,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=pathlib.Path)
    parser.add_argument('--root', type=pathlib.Path)
    parser.add_argument('--top', type=int, default=35)
    ns = parser.parse_args()
    if not 1 <= ns.top <= 200:
        parser.error('--top should be from 1 to 200')
    root = ns.root.resolve() if ns.root else pathlib.Path(__file__).resolve().parent.parent
    apk = ns.apk or root / 'reports' / 'size-trial-compact-native-1.0.30-31.apk'
    if not apk.is_absolute():
        apk = root / apk
    inspect(apk, root, ns.top)


if __name__ == '__main__':
    main()
