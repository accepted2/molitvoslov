#!/usr/bin/env python3
"""Safely merge only square inner corners and matched life-text fade colors.

This tool NEVER restores Git files, overwrites unrelated local CSS, or touches
offlineContent.json / databases. Dry-run is the default. For actual changes
pass --apply; timestamped full-file backups are created before writing.
"""
import argparse
import difflib
import os
import re
import shutil
import tempfile
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGETS = (
    ("src/screens/SaintDetailScreen.js", "lifeInset", ("lifeScrollFade",)),
    ("src/screens/ChurchCalendarScreen.js", "calendarLifeInset",
     ("calendarLifeFadeTop", "calendarLifeFade")),
)
HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
RGBA = re.compile(
    r"rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,"
    r"\s*(?P<alpha>\d+(?:\.\d+)?)\s*\)"
)


class MergeError(Exception):
    pass


def style_background_and_corners(source, name):
    """Change one inner-card border radius, retaining every other declaration."""
    pattern = re.compile(
        r"(?<![\w.])" + re.escape(name) + r"(\s*:\s*\{)(?P<body>[^{}]*)\}",
        re.DOTALL,
    )
    matches = list(pattern.finditer(source))
    if len(matches) != 1:
        raise MergeError(f"Expected exactly one StyleSheet entry '{name}', got {len(matches)}")
    match = matches[0]
    body = match.group("body")
    colors = re.findall(
        r"\bbackgroundColor\s*:\s*['\"](#[0-9a-fA-F]{6})['\"]", body
    )
    if len(colors) != 1 or not HEX.fullmatch(colors[0]):
        raise MergeError(f"Cannot safely determine local backgroundColor of {name}")
    radius = re.compile(r"\bborderRadius\s*:\s*\d+(?:\.\d+)?")
    if len(radius.findall(body)) == 1:
        new_body = radius.sub("borderRadius: 0", body)
    elif len(radius.findall(body)) == 0:
        new_body = "borderRadius: 0, " + body
    else:
        raise MergeError(f"Ambiguous borderRadius in {name}")
    begin, end = match.span("body")
    return source[:begin] + new_body + source[end:], colors[0].upper()


def update_gradient(source, name, background):
    """Only change the three stops of the explicitly named life fade."""
    rgb = tuple(int(background[index:index + 2], 16) for index in (1, 3, 5))
    tag_pattern = re.compile(r"<LinearGradient\b[^>]*?/>", re.DOTALL)
    tags = [
        match for match in tag_pattern.finditer(source)
        if re.search(r"\bstyle\s*=\s*\{\s*styles\." + re.escape(name) +
                     r"\s*\}", match.group(0))
    ]
    if len(tags) != 1:
        raise MergeError(f"Expected one LinearGradient using styles.{name}, got {len(tags)}")
    tag = tags[0]
    color_pattern = re.compile(r"colors\s*=\s*\{\[(?P<colors>.*?)\]\}", re.DOTALL)
    color_match = color_pattern.search(tag.group(0))
    if not color_match:
        raise MergeError(f"No static 3-stop colors array for {name}")
    stops = color_match.group("colors")
    if len(re.findall(r"['\"](?:rgba\([^)]*\)|#[0-9a-fA-F]{6})['\"]", stops)) != 3:
        raise MergeError(f"Nonstandard gradient stops for {name}; not changing local code")

    def rgba_color(match):
        return f"rgba({rgb[0]},{rgb[1]},{rgb[2]},{match.group('alpha')})"

    new_stops = RGBA.sub(rgba_color, stops)
    new_stops = re.sub(r"#[0-9a-fA-F]{6}", background, new_stops)
    # Reject unsupported formats rather than silently mixing two backgrounds.
    if len(RGBA.findall(new_stops)) + len(re.findall(r"#[0-9a-fA-F]{6}", new_stops)) != 3:
        raise MergeError(f"Unsupported gradient colors in {name}")
    local_begin, local_end = color_match.span("colors")
    new_tag = tag.group(0)[:local_begin] + new_stops + tag.group(0)[local_end:]
    begin, end = tag.span()
    return source[:begin] + new_tag + source[end:]


def merge_one(source, style_name, gradient_names):
    result, background = style_background_and_corners(source, style_name)
    for name in gradient_names:
        result = update_gradient(result, name, background)
    return result, background


def main():
    arg = argparse.ArgumentParser(description=__doc__)
    arg.add_argument("--apply", action="store_true", help="Back up and write local files.")
    arg.add_argument("--root", type=Path, default=ROOT, help="Application root.")
    options = arg.parse_args()
    root = options.root.resolve()

    # Calculate ALL changes before any write; reject ambiguous local edits.
    changes = []
    for relative, style, gradients in TARGETS:
        path = root / relative
        original = path.read_bytes()
        try:
            before = original.decode("utf-8")
            after, background = merge_one(before, style, gradients)
        except (UnicodeDecodeError, MergeError) as error:
            raise SystemExit(f"ABORT: {relative}: {error}") from error
        changes.append((path, relative, original, after.encode("utf-8"), before, after))
        print(f"{relative}: inner radius=0; fade matches local {background}")
        if before != after:
            diff = difflib.unified_diff(
                before.splitlines(keepends=True), after.splitlines(keepends=True),
                fromfile=relative + " (current)", tofile=relative + " (merged)")
            print("".join(diff))
        else:
            print("  Already merged: no changes needed")

    changed = [item for item in changes if item[2] != item[3]]
    if not changed:
        print("OK: Both files already have the requested styling. Nothing overwritten.")
        return
    if not options.apply:
        print("PREVIEW ONLY. Local changes and user data are untouched.")
        print("Run the same command with --apply after reviewing this diff.")
        return

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    backup_dir = root.parent / "build-backups" / ("saint-calendar-local-merge-" + stamp)
    for _path, relative, *_ in changed:
        destination = backup_dir / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(root / relative, destination)
        if not destination.is_file():
            raise SystemExit("ABORT: backup failed; nothing was written")

    try:
        for path, relative, original, updated, *_ in changed:
            # Abort if the editor changed a file after our preview began.
            if path.read_bytes() != original:
                raise MergeError(f"File changed during merge: {relative}")
            fd, temp_name = tempfile.mkstemp(prefix=path.name + ".", dir=path.parent)
            try:
                with os.fdopen(fd, "wb") as stream:
                    stream.write(updated)
                os.replace(temp_name, path)
            finally:
                if os.path.exists(temp_name):
                    os.unlink(temp_name)
    except Exception:
        # Restore the original bytes from backups if any write failed.
        for path, relative, *_ in changed:
            shutil.copy2(backup_dir / relative, path)
        raise

    print(f"MERGE APPLIED: {len(changed)} local file(s), other edits preserved")
    print(f"BACKUPS: {backup_dir}")
    print("No Git restore/pull; offlineContent.json, SQLite and saved data untouched.")


if __name__ == "__main__":
    main()
