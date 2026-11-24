#!/usr/bin/env python3
"""Small offline regression test of WebP asset conversion and rollback."""
from __future__ import annotations

import hashlib
import importlib.util
import tempfile
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location(
    "webp_experiment", HERE / "prepare_webp_lossless_20261113.py"
)
converter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(converter)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


with tempfile.TemporaryDirectory(prefix="molitvoslov-webp-test-") as folder:
    root = Path(folder)
    home = root / "assets/home/test_bg.png"
    bible = root / "assets/bible/evangelists/test_icon.png"
    unrelated = root / "assets/home/unrelated.png"
    for png, rgba in [
        (home, (34, 71, 94, 255)),
        (bible, (122, 82, 44, 255)),
        (unrelated, (80, 100, 110, 255)),
    ]:
        png.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGBA", (400, 400), rgba).save(png)
    home_js = root / "src/data/homeArtwork.js"
    bible_js = root / "src/data/bibleArtwork.js"
    for p, name, location in [
        (home_js, "bg", "home/test_bg.png"),
        (bible_js, "icon", "bible/evangelists/test_icon.png"),
    ]:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(
            ("const " + name + " = require('../../assets/" + location + "');\r\n")
            .encode("utf-8")
        )

    before = {p: sha(p) for p in (home, bible, unrelated, home_js, bible_js)}
    converter.ROOT = root
    converter.MANIFESTS = (home_js, bible_js)
    converter.run("apply")
    for png, js in ((home, home_js), (bible, bible_js)):
        assert png.with_suffix(".webp").exists(), png
        assert ".webp" in js.read_text(), js
        assert converter.validate_webp(png, png.with_suffix(".webp")), png
        assert sha(png) == before[png], png
    assert not unrelated.with_suffix(".webp").exists()
    assert sha(unrelated) == before[unrelated]
    converter.run("check")
    converter.run("restore")
    for js in (home_js, bible_js):
        assert sha(js) == before[js], js
        assert ".webp" not in js.read_text(), js
    for png in (home, bible, unrelated):
        assert sha(png) == before[png], png

print("PASS: lossless WebP matches PNG pixels; rollback preserves all original files")
