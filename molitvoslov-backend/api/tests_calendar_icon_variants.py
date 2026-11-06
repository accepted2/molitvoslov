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
    def test_one_medium_size_offline_canvas_preserves_original(self):
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
            self.assertEqual(CANVASES, {"offline": (480, 640)})
            self.assertEqual(set(info["variants"]), {"offline"})
            self.assertGreater(info["file_bytes"], 0)
            with Image.open(info["variants"]["offline"]) as master:
                self.assertEqual(master.size, (480, 640))
                # Верхний угол — цвет поля, значит изображение НЕ обрезано.
                expected = (244, 239, 229)
                actual = master.getpixel((0, 0))
                self.assertLessEqual(max(abs(x-y) for x,y in zip(actual,expected)), 3)

    def test_portrait_is_fitted_not_cropped(self):
        with tempfile.TemporaryDirectory() as folder:
            src = Path(folder) / "portrait.png"
            Image.new("RGB", (1000, 1800), (170, 30, 20)).save(src)
            info = render_icon_variants(src, Path(folder) / "out", asset_id="saint-123")
            with Image.open(info["variants"]["offline"]) as output:
                self.assertEqual(output.size, (480, 640))
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

    def test_offline_bundle_includes_main_and_all_feasts_without_duplicates(self):
        import importlib.util
        generator = (
            Path(__file__).resolve().parents[2] / ".github"
            / "scripts" / "build_calendar_offline_bundle.py"
        )
        spec = importlib.util.spec_from_file_location("offline_icon_generator", generator)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        self.assertEqual(module.ICON_MAX_SIZE, (480, 640))
        self.assertEqual(module.ICON_QUALITY, 80)
        data = {
            "days": {
                "2026-11-06": {
                    "ru": {
                        "main_feast": {
                            "sync_uid": "main-feast-1",
                            "source_id": None,
                            "icon_url": "https://example.org/main.jpg",
                        },
                        "all_feasts": [
                            {
                                "sync_uid": "main-feast-1",
                                "icon_url": "https://example.org/main.jpg",
                            },
                            {
                                "sync_uid": "other-feast-2",
                                "source_id": 42,
                                "icon_url": "https://example.org/other.jpg",
                            },
                        ],
                    },
                    "uk": {
                        "main_feast": {
                            "sync_uid": "main-feast-1",
                            "icon_url": "https://example.org/main.jpg",
                        },
                        "all_feasts": [],
                    },
                }
            }
        }
        feasts = module.visible_feasts(data)
        self.assertEqual(len(feasts), 2)
        self.assertEqual(
            {feast["sync_uid"] for feast in feasts},
            {"main-feast-1", "other-feast-2"},
        )

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
