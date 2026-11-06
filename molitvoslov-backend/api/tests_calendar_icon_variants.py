"""Проверка икон: размер, сохранение пропорций и безопасное сопоставление."""
from pathlib import Path
import tempfile
import unittest

from PIL import Image

from api.calendar_icon_variants import (
    CANVASES, LowResolutionIcon, render_icon_variants,
)
from api.calendar_icon_variants import public_https as _public_https


class IconVariantsTests(unittest.TestCase):
    def test_source_unchanged_and_three_fixed_size_canvases(self):
        with tempfile.TemporaryDirectory() as folder:
            src = Path(folder) / "original.png"
            Image.new("RGB", (1600, 1200), (110, 25, 35)).save(src)
            raw = src.read_bytes()
            info = render_icon_variants(
                src, Path(folder) / "out", asset_id="sync-uid-123"
            )
            self.assertEqual(src.read_bytes(), raw)
            self.assertEqual(
                (info["original_width"], info["original_height"]), (1600, 1200)
            )
            for label, dimensions in CANVASES.items():
                with Image.open(info["variants"][label]) as result:
                    self.assertEqual(result.size, dimensions)
            with Image.open(info["variants"]["master"]) as master:
                # Верхний угол — цвет поля, значит изображение НЕ обрезано.
                expected = (244, 239, 229)
                actual = master.getpixel((0, 0))
                self.assertLessEqual(max(abs(x-y) for x,y in zip(actual,expected)), 3)

    def test_portrait_is_fitted_not_cropped(self):
        with tempfile.TemporaryDirectory() as folder:
            src = Path(folder) / "portrait.png"
            Image.new("RGB", (1000, 1800), (170, 30, 20)).save(src)
            info = render_icon_variants(src, Path(folder) / "out", asset_id="saint-123")
            with Image.open(info["variants"]["display"]) as output:
                self.assertEqual(output.size, (768, 1024))
                actual = output.getpixel((0, 0))
                self.assertLessEqual(
                    max(abs(a-b) for a,b in zip(actual,(244,239,229))), 3
                )

    def test_preview_cannot_be_falsely_upscaled_to_hd(self):
        with tempfile.TemporaryDirectory() as folder:
            src = Path(folder) / "tiny.png"
            Image.new("RGB", (300, 400), "white").save(src)
            with self.assertRaises(LowResolutionIcon):
                render_icon_variants(src, Path(folder) / "out", asset_id="old-thumbnail")

    def test_only_public_https_urls(self):
        self.assertTrue(_public_https("https://res.cloudinary.com/cloud/image/upload/icon.jpg"))
        for bad in (
            "http://example.org/icon.png",
            "https://127.0.0.1/icon.png",
            "https://localhost/icon.png",
            "file:///tmp/icon.png",
            "https://user:password@example.org/photo.png",
        ):
            with self.subTest(bad=bad):
                self.assertFalse(_public_https(bad))
