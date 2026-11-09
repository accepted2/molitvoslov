#!/usr/bin/env python3
"""Regression tests for safe local Akathist renderer patching."""
import contextlib
import io
import tempfile
import unittest
from pathlib import Path

from patch_akathist_response_render_20261109 import (
    RUNTIME, RUNTIME_EDITS, TEST, TEST_EDITS, apply_files,
)

SOURCE = Path(__file__).resolve().parent.parent


class SafePatchTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for file, edits in ((RUNTIME, RUNTIME_EDITS), (TEST, TEST_EDITS)):
            current = (SOURCE / file).read_text(encoding="utf-8")
            for _, old, new in edits:
                self.assertEqual(current.count(new), 1, file)
                current = current.replace(new, old, 1)
            target = self.root / file
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(current, encoding="utf-8")
        self.offline = self.root / "src/data/offlineContent.json"
        self.offline.parent.mkdir(parents=True, exist_ok=True)
        self.offline.write_bytes(b'{"preserve":"all 58 akathists"}')

    def test_apply_backup_and_idempotent(self):
        originals = {f: (self.root / f).read_bytes() for f in (RUNTIME, TEST)}
        with contextlib.redirect_stdout(io.StringIO()):
            apply_files(self.root, check_only=True)
        self.assertEqual(originals, {f: (self.root / f).read_bytes() for f in (RUNTIME, TEST)})
        self.assertFalse((self.root / ".reader-patch-backups").exists())

        with contextlib.redirect_stdout(io.StringIO()):
            apply_files(self.root)
        for f in (RUNTIME, TEST):
            self.assertEqual((self.root / f).read_bytes(), (SOURCE / f).read_bytes())
        self.assertEqual(self.offline.read_bytes(), b'{"preserve":"all 58 akathists"}')
        backups = list((self.root / ".reader-patch-backups").glob("*/"))
        self.assertEqual(len(backups), 1)
        for f in (RUNTIME, TEST):
            self.assertEqual((backups[0] / f).read_bytes(), originals[f])

        with contextlib.redirect_stdout(io.StringIO()):
            apply_files(self.root)
        self.assertEqual(len(list((self.root / ".reader-patch-backups").glob("*/"))), 1)

    def test_unexpected_local_change_blocks_every_write(self):
        target = self.root / RUNTIME
        target.write_text(
            target.read_text(encoding="utf-8").replace(
                "collectAkathistInvocationRanges = value",
                "collectDifferentAkathistInvocationRanges = value",
                1,
            ),
            encoding="utf-8",
        )
        before = {f: (self.root / f).read_bytes() for f in (RUNTIME, TEST)}
        with self.assertRaisesRegex(ValueError, "ОСТАНОВЛЕНО"):
            with contextlib.redirect_stdout(io.StringIO()):
                apply_files(self.root)
        for f in (RUNTIME, TEST):
            self.assertEqual((self.root / f).read_bytes(), before[f])
        self.assertFalse((self.root / ".reader-patch-backups").exists())


if __name__ == "__main__":
    unittest.main()
