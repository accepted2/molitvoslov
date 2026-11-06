#!/usr/bin/env python3
"""Repair a failed 1.0.23 PowerShell version update, then set versions safely.

- Only app.json and android/app/build.gradle are touched.
- If app.json was damaged, recover BOTH from the newest verified release backup.
- Preserve Ukrainian/Russian Unicode via UTF-8, not PowerShell 5 ANSI Get-Content.
- Edit using Python JSON and regular-expression callbacks (no $1 expansion).
- Create a separate pre-edit backup and verify both files before returning.
"""
import json
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

TARGET_VERSION = "1.0.23"
TARGET_CODE = 24


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def check_gradle(text):
    code = re.findall(r"(?m)^[ \t]*versionCode[ \t]+(\d+)[ \t]*$", text)
    name = re.findall(r'(?m)^[ \t]*versionName[ \t]+"([^"]+)"[ \t]*$', text)
    if len(code) != 1 or len(name) != 1:
        raise ValueError("Expected one versionCode and one versionName in build.gradle")
    return int(code[0]), name[0]


def newest_valid_release_backup(folder):
    if not folder.exists():
        raise RuntimeError("Release backups folder missing: " + str(folder))
    candidates = sorted(
        list(folder.glob("release-1.0.23-*")) + list(folder.glob("release-1.0.22-*")) + list(folder.glob("release-1.0.21-*")) + list(folder.glob("release-1.0.20-*")),
        key=lambda f: f.name, reverse=True
    )
    for directory in candidates:
        app = directory / "app.json"
        gradle = directory / "build.gradle"
        try:
            conf = load_json(app)
            check_gradle(gradle.read_text(encoding="utf-8-sig"))
            if "expo" in conf and "android" in conf["expo"]:
                return app, gradle, directory
        except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
            pass
    raise RuntimeError("No valid original app.json and build.gradle release backup found")


def main():
    root = Path(__file__).resolve().parents[1]
    app = root / "app.json"
    gradle = root / "android/app/build.gradle"
    backup_root = root.parent / "build-backups"
    recovery_dir = backup_root / ("version-repair-" + datetime.now().strftime("%Y%m%d_%H%M%S"))
    recovery_dir.mkdir(parents=True, exist_ok=False)
    shutil.copy2(app, recovery_dir / "app.before.json")
    shutil.copy2(gradle, recovery_dir / "build.before.gradle")

    try:
        conf = load_json(app)
        gradle_text = gradle.read_text(encoding="utf-8-sig")
        check_gradle(gradle_text)
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
        original_app, original_gradle, source = newest_valid_release_backup(backup_root)
        conf = load_json(original_app)
        gradle_text = original_gradle.read_text(encoding="utf-8-sig")
        print("RECOVERED ORIGINAL VERSION FILES FROM:", source)

    expo = conf.get("expo")
    if not isinstance(expo, dict) or not isinstance(expo.get("android"), dict):
        raise RuntimeError("Malformed Expo configuration in original app.json")

    current_code = expo["android"].get("versionCode")
    gradle_code, gradle_name = check_gradle(gradle_text)
    if not isinstance(current_code, int) or current_code > TARGET_CODE or gradle_code > TARGET_CODE:
        raise RuntimeError("Newer version found: refusing to downgrade release metadata")

    expo["version"] = TARGET_VERSION
    expo["android"]["versionCode"] = TARGET_CODE
    gradle_text, n_code = re.subn(
        r"(?m)^([ \t]*versionCode[ \t]+)\d+([ \t]*)$",
        lambda m: m.group(1) + str(TARGET_CODE) + m.group(2),
        gradle_text,
    )
    gradle_text, n_name = re.subn(
        r'(?m)^([ \t]*versionName[ \t]+)"[^"]+"([ \t]*)$',
        lambda m: m.group(1) + '"' + TARGET_VERSION + '"' + m.group(2),
        gradle_text,
    )
    if n_code != 1 or n_name != 1:
        raise RuntimeError("Unable to update Gradle version uniquely")

    result_json = json.dumps(conf, ensure_ascii=False, indent=2) + "\n"
    verify = json.loads(result_json)
    if verify["expo"]["version"] != TARGET_VERSION or verify["expo"]["android"]["versionCode"] != TARGET_CODE:
        raise RuntimeError("JSON version verification failed before write")
    if check_gradle(gradle_text) != (TARGET_CODE, TARGET_VERSION):
        raise RuntimeError("Gradle version verification failed before write")

    app.write_text(result_json, encoding="utf-8")
    gradle.write_text(gradle_text, encoding="utf-8")
    if load_json(app)["expo"]["version"] != TARGET_VERSION or check_gradle(gradle.read_text(encoding="utf-8")) != (TARGET_CODE, TARGET_VERSION):
        raise RuntimeError("Post-write version check failed")

    print("VERSION REPAIRED: 1.0.23 (24)")
    print("UNICODE PRESERVED:", conf["expo"].get("name"))
    print("SAFETY BACKUP:", recovery_dir)
    print("All other files were left unchanged.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("VERSION REPAIR FAILED:", str(exc), file=sys.stderr)
        sys.exit(1)
