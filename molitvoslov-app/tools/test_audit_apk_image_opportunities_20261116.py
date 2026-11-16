#!/usr/bin/env python3
"""Windows-compatible fixture check for read-only image size diagnostics."""
import contextlib
import importlib.util
import io
import pathlib
import struct
import tempfile
import zipfile

script = pathlib.Path(__file__).with_name('audit-apk-image-opportunities-20261116.py')
spec = importlib.util.spec_from_file_location('apk_image_opportunities', script)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

png = b'\x89PNG\r\n\x1a\n' + (13).to_bytes(4, 'big') + b'IHDR' + (
    struct.pack('>II', 1024, 768) + b'\x08\x06\x00\x00\x00') + b'xyz'
assert mod.image_dimensions(png, '.png') == (1024, 768)
# VP8X format: width and height stored little-endian as values minus one.
webp = (b'RIFF' + b'\x16\x00\x00\x00' + b'WEBP' + b'VP8X' +
        b'\x0a\x00\x00\x00' + b'\x00\x00\x00\x00' +
        (2559).to_bytes(3,'little') + (1439).to_bytes(3,'little'))
assert mod.image_dimensions(webp, '.webp') == (2560, 1440)
gif = b'GIF89a' + struct.pack('<HH', 320, 200) + b'xyz'
assert mod.image_dimensions(gif, '.gif') == (320, 200)
vp8l = (b'RIFF' + b'\x16\x00\x00\x00' + b'WEBP' + b'VP8L' +
        b'\x05\x00\x00\x00' + b'\x2f' + b'\x00\x00\x00\x00' + b'ignored')
assert mod.image_dimensions(vp8l, '.webp') == (1, 1)
with tempfile.TemporaryDirectory(prefix='apk-image-opportunities-') as folder:
    root = pathlib.Path(folder)
    (root / 'assets' / 'home').mkdir(parents=True)
    original = root / 'assets' / 'home' / 'hero_opt.webp'
    original.write_bytes(webp + b'x' * 1000)
    apk = root / 'trial.apk'
    with zipfile.ZipFile(apk, 'w', compression=zipfile.ZIP_STORED) as archive:
        archive.writestr('res/aaa.webp', original.read_bytes())
        archive.writestr('res/bbb.webp', original.read_bytes())
        archive.writestr('res/unknown.png', png)
        archive.writestr('assets/index.android.bundle', b'JS')
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        result = mod.inspect(apk, root, top=10)
    report = out.getvalue()
    assert result['additional_entries'] == 1
    assert result['duplicate_groups'] == 1
    assert result['duplicate_compressed_bytes'] == len(original.read_bytes())
    assert result['category_bytes']['assets/home'] == 2 * len(original.read_bytes())
    assert result['category_bytes']['Unmatched / transformed'] == len(png)
    assert '2560 x 1440' in report
    assert '1024 x 768' in report
    assert 'READ ONLY' in report
    assert apk.stat().st_size > 0
    assert original.read_bytes().endswith(b'x' * 1000)
print('PASS: APK image duplicate bytes, source buckets, PNG/WebP size headers, read-only analysis')
