#!/usr/bin/env python3
"""Read-only tests for safe local layout/gradient merger."""
import importlib.util
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    "safe_merge", HERE / "merge_saint_calendar_local_styles_20261105.py"
)
merge = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(merge)

SAINT = """const styles = StyleSheet.create({
  readingContent: {paddingHorizontal: 37, backgroundColor: '#FFEEDD'},
  lifeInset: {marginHorizontal: 9, borderRadius: 13, borderWidth: 1,
    paddingTop: 19, backgroundColor: '#F1E2C3', overflow: 'hidden'},
});
const view = <LinearGradient pointerEvents="none"
  colors={['rgba(255,248,235,0)', 'rgba(255,248,235,0.90)', '#FFF8EB']}
  style={styles.lifeScrollFade} />;
const untouched = colors={['#C0FFEE', '#001122']};
"""
CALENDAR = """const styles = StyleSheet.create({
  calendarLifeInset: {marginHorizontal: 4, borderRadius: 13, borderWidth: 1,
    backgroundColor: '#FFF4DE', overflow: 'hidden'},
  textBlockParagraph: {fontSize: 23, paddingTop: 37},
});
const top = <LinearGradient pointerEvents="none"
  colors={['#FFF8EB', 'rgba(255,248,235,0.77)', 'rgba(255,248,235,0)']}
  style={styles.calendarLifeFadeTop} />;
const bottom = <LinearGradient pointerEvents="none"
  colors={['rgba(255,248,235,0)', 'rgba(255,248,235,0.86)', '#FFF8EB']}
  style={styles.calendarLifeFade} />;
"""


class MergeTests(unittest.TestCase):
    def test_inset_radius_and_local_background_are_preserved(self):
        result, bg = merge.merge_one(SAINT, "lifeInset", ["lifeScrollFade"])
        self.assertEqual(bg, "#F1E2C3")
        self.assertIn("paddingHorizontal: 37", result)
        self.assertIn("paddingTop: 19", result)
        self.assertIn("marginHorizontal: 9, borderRadius: 0", result)
        self.assertIn("rgba(241,226,195,0.90)", result)
        self.assertIn("'#F1E2C3'", result)
        self.assertIn("['#C0FFEE', '#001122']", result)
        self.assertEqual(
            merge.merge_one(result, "lifeInset", ["lifeScrollFade"])[0], result
        )

    def test_calendar_both_gradients_match_its_own_background(self):
        result, bg = merge.merge_one(
            CALENDAR, "calendarLifeInset",
            ["calendarLifeFadeTop", "calendarLifeFade"]
        )
        self.assertEqual(bg, "#FFF4DE")
        self.assertIn("borderRadius: 0", result)
        self.assertIn("fontSize: 23, paddingTop: 37", result)
        self.assertIn("rgba(255,244,222,0.77)", result)
        self.assertIn("rgba(255,244,222,0.86)", result)
        self.assertEqual(
            merge.merge_one(
                result, "calendarLifeInset",
                ["calendarLifeFadeTop", "calendarLifeFade"]
            )[0], result
        )

    def test_rejects_ambiguous_styles_without_guessing(self):
        with self.assertRaises(merge.MergeError):
            merge.merge_one("other: {backgroundColor:'#FFF4DE'}", "lifeInset", ["lifeScrollFade"])
        with self.assertRaises(merge.MergeError):
            merge.merge_one(
                SAINT.replace("style={styles.lifeScrollFade}", "style={styles.missing}"),
                "lifeInset", ["lifeScrollFade"]
            )

    def test_preview_does_not_write_and_apply_preserves_local_edits(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "molitvoslov-app"
            saint = root / "src/screens/SaintDetailScreen.js"
            calendar = root / "src/screens/ChurchCalendarScreen.js"
            saint.parent.mkdir(parents=True)
            saint.write_text(SAINT, encoding="utf-8")
            calendar.write_text(CALENDAR, encoding="utf-8")
            base = [sys.executable, str(HERE / "merge_saint_calendar_local_styles_20261105.py"),
                    "--root", str(root)]
            subprocess.run(base, check=True, capture_output=True, text=True)
            self.assertEqual(saint.read_text(encoding="utf-8"), SAINT)
            self.assertEqual(calendar.read_text(encoding="utf-8"), CALENDAR)
            result = subprocess.run(base + ["--apply"], check=True,
                                    capture_output=True, text=True)
            self.assertIn("MERGE APPLIED: 2 local file(s)", result.stdout)
            self.assertIn("paddingHorizontal: 37", saint.read_text(encoding="utf-8"))
            self.assertIn("paddingTop: 37", calendar.read_text(encoding="utf-8"))
            backup_dirs = list((root.parent / "build-backups").glob("saint-calendar-local-merge-*"))
            self.assertEqual(len(backup_dirs), 1)
            self.assertEqual(
                (backup_dirs[0] / "src/screens/SaintDetailScreen.js").read_text(encoding="utf-8"),
                SAINT
            )
            self.assertEqual(
                (backup_dirs[0] / "src/screens/ChurchCalendarScreen.js").read_text(encoding="utf-8"),
                CALENDAR
            )
            second = subprocess.run(base + ["--apply"], check=True,
                                    capture_output=True, text=True)
            self.assertIn("Already merged", second.stdout)
            self.assertEqual(len(list((root.parent / "build-backups").glob(
                "saint-calendar-local-merge-*"
            ))), 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
