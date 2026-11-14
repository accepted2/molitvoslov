#!/usr/bin/env python3
"""Switch every application reference to the verified 17 lossless WebP files.

The original pixel-identical PNGs remain on disk. Only exact known artwork
paths in App.js or src/**/*.js are adjusted. Run AFTER prepare_webp_lossless.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HOME = ("akathists", "canons", "communion", "evening", "hero",
        "morning", "page_bg2", "page_bg3", "psalter")
BIBLE = ("john-bg", "john-icon", "luke-bg", "luke-icon",
         "mark-bg", "mark-icon", "matthew-bg", "matthew-icon")
TARGETS = {
    *(f"assets/home/{stem}.png" for stem in HOME),
    *(f"assets/bible/evangelists/{stem}.png" for stem in BIBLE),
}
REQUIRE = re.compile(r"""(?P<leading>require\(\s*['"])(?P<path>[^'"]+)(?P<trailing>['"]\s*\))""")
IMPORT = re.compile(r"""(?P<leading>from\s+['"])(?P<path>[^'"]+)(?P<trailing>['"])""")


def fix_references(text: str) -> tuple[str, int]:
    count = 0

    def replace(match):
        nonlocal count
        path = match.group("path")
        matched = next((target for target in TARGETS if path.endswith("/" + target)), None)
        if matched is None:
            return match.group(0)
        webp = ROOT / matched.replace(".png", ".webp")
        if not webp.is_file():
            raise RuntimeError("Optimised file not generated: " + str(webp))
        count += 1
        return match.group("leading") + path[:-4] + ".webp" + match.group("trailing")

    for regex in (REQUIRE, IMPORT):
        text = regex.sub(replace, text)
    return text, count


def main() -> None:
    files = [ROOT / "App.js", *(ROOT / "src").rglob("*.js")]
    changed = []
    edits = 0
    for file in files:
        before = file.read_text(encoding="utf-8")
        after, count = fix_references(before)
        if before != after:
            file.write_text(after, encoding="utf-8")
            changed.append(str(file.relative_to(ROOT)))
            edits += count
    leftovers = []
    for file in files:
        text = file.read_text(encoding="utf-8")
        for regex in (REQUIRE, IMPORT):
            for match in regex.finditer(text):
                if any(match.group("path").endswith("/" + target) for target in TARGETS):
                    leftovers.append(f"{file.relative_to(ROOT)}: {match.group('path')}")
    if leftovers:
        raise RuntimeError("Still using original PNGs: " + ", ".join(leftovers))
    print("WEBP REFERENCES READY:", edits, "updated; no original references remain")
    for file in changed:
        print("  ", file)
    assert len(TARGETS) == 17


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError) as error:
        print("WEBP REFERENCE ERROR:", error, file=sys.stderr)
        sys.exit(1)
