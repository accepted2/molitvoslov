#!/usr/bin/env python3
"""Fixture regression test for read-only APK image footprint audit."""
import contextlib
import io
import pathlib
import tempfile
import zipfile
from audit_apk_image_assets_20261116 import inspect

with tempfile.TemporaryDirectory(prefix="molitvoslov-image-audit-") as tmp:
    root=pathlib.Path(tmp)
    (root/"assets"/"home").mkdir(parents=True)
    source=root/"assets"/"home"/"hero_opt.webp"
    source.write_bytes(b"RIFF....WEBP"+b"x"*1000)
    apk=root/"test.apk"
    with zipfile.ZipFile(apk,"w",compression=zipfile.ZIP_DEFLATED) as f:
        f.writestr("res/renamed.webp",source.read_bytes())
        f.writestr("res/identical.webp",source.read_bytes())
        f.writestr("res/unknown.png",b"\x89PNG\r\n\x1a\n"+b"y"*200)
        f.writestr("assets/index.android.bundle",b"not an image")
    buf=io.StringIO()
    with contextlib.redirect_stdout(buf):
        data=inspect(apk,root,10)
    report=buf.getvalue()
    assert data["image_count"]==3
    assert data["duplicates"]==1
    assert data["unmatched_bytes"]>0
    assert "assets/home/hero_opt.webp" in report
    assert "Exact duplicate image byte groups INSIDE APK: 1" in report
    assert "READ ONLY" in report
    assert source.read_bytes().startswith(b"RIFF")
    assert apk.stat().st_size>0
    print("PASS: exact-image source mapping, unmatched tracking, duplicate ZIP entries, no mutation")
