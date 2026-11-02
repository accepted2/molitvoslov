#!/usr/bin/env python3
"""Safely detach reader top gradient from the animated header (local patch).

Run from app root:
  python -X utf8 tools/apply_persistent_reader_gradient.py

Does not replace the component with a stale GitHub copy. Preserves unrelated
local changes and writes a backup outside the app before editing.
"""
from datetime import datetime
from pathlib import Path
import shutil
import sys


def main():
    root = Path(__file__).resolve().parents[1]
    target = root / "src/components/navigation/FixedSectionHeader.js"
    text = target.read_text(encoding="utf-8-sig")

    if "styles.fixedGradient" in text and "fixedGradient:" in text:
        print("ALREADY PATCHED: persistent reader top gradient")
        return 0

    start = "  return (\n    <Animated.View\n"
    gradient_start = "      {!minimal && (\n        <LinearGradient\n"
    gradient_end = "\n      )}"
    close = "    </Animated.View>\n  );"
    styles = "const styles = StyleSheet.create({\n  fixedHeader: {"
    style_old = "          style={StyleSheet.absoluteFill}"
    style_new = "          style={[styles.fixedGradient, {height: headerHeight + 10}]}"

    if not all(text.count(anchor) == 1 for anchor in
               (start, gradient_start, close, styles, style_old)):
        raise RuntimeError("Header implementation differs from expected; no files changed")

    a = text.index(start)
    g = text.index(gradient_start, a)
    ge = text.index(gradient_end, g) + len(gradient_end)
    end = text.index(close, ge)
    if not a < g < ge < end:
        raise RuntimeError("Cannot locate animated header and gradient safely")

    gradient = text[g:ge].replace(style_old, style_new)
    original_animated = text[a:g].split("  return (\n", 1)[1] + text[ge:end]
    animated = "\n".join(
        ("  " + line if line.strip() else line)
        for line in original_animated.split("\n")
    )
    new_return = (
        "  return (\n    <>\n" + gradient + "\n\n"
        + animated + "      </Animated.View>\n    </>\n  );"
    )

    css = """const styles = StyleSheet.create({
  fixedGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    // Independent of the animated title; never intercepts reader gestures.
    zIndex: 999,
    elevation: 19,
  },
  fixedHeader: {"""

    updated = text[:a] + new_return + text[end + len(close):]
    updated = updated.replace(styles, css, 1)

    if (updated.count("<LinearGradient") != 1
            or updated.count("<Animated.View") != 1
            or updated.count("</Animated.View>") != 1
            or updated.count("fixedGradient:") != 1):
        raise RuntimeError("Unexpected JSX structure; no files changed")

    backup_dir = root.parent / "build-backups" / (
        "reader-gradient-" + datetime.now().strftime("%Y%m%d_%H%M%S"))
    backup_dir.mkdir(parents=True, exist_ok=False)
    shutil.copy2(target, backup_dir / target.name)
    target.write_text(updated, encoding="utf-8")

    print("PATCHED:", target)
    print("BACKUP:", backup_dir)
    print("Top gradient is static; animated title/back/menu behavior is unchanged")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print("PATCH FAILED:", exc, file=sys.stderr)
        sys.exit(1)
