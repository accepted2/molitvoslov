#!/usr/bin/env python3
"""Apply the APK-only public content policy without discarding local UI edits.

GitHub holds the authoritative *new code blocks*; only specifically identified
old blocks in the current working tree are replaced, never entire screen files.
The caller must first git fetch the target branch to populate FETCH_HEAD.
"""
from datetime import datetime
from pathlib import Path
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
BACKUP_ROOT = ROOT.parent / "build-backups"

FILES = {
    "App.js",
    "src/services/contentStore.js",
    "src/services/bibleStore.js",
    "src/services/contentApi.js",
    "src/screens/SearchScreen.js",
    "tools/build_release_1_0_20.ps1",
}


def remote(path):
    result = subprocess.run(
        ["git", "show", "FETCH_HEAD:molitvoslov-app/" + path],
        cwd=ROOT, capture_output=True, check=False,
    )
    if result.returncode:
        raise RuntimeError("Missing fetched GitHub source " + path + ": " + result.stderr.decode("utf-8", "replace"))
    return result.stdout.decode("utf-8-sig").replace("\r\n", "\n")


def once(content, old, new, path):
    count = content.count(old)
    if count != 1:
        raise ValueError(f"{path}: old block must appear exactly once, found {count}; no files written")
    return content.replace(old, new, 1)


def extract(content, start, end, path):
    if content.count(start) != 1 or content.count(end) != 1:
        raise ValueError(f"{path}: function boundaries were changed; no files written")
    a = content.index(start)
    b = content.index(end, a)
    return content[a:b]


def patch_app(src, new):
    marker = "PUBLIC_CONTENT_BUNDLED_ONLY_V1"
    if marker in src:
        if "syncContentDeltas()" in src:
            raise ValueError("App.js still calls OTA public sync")
        return src
    old_comment = "        // Read a small published change feed; never request full Bible or calendar here.\n"
    old_call = """        syncContentDeltas().catch((error) =>
          console.log('Offline content delta sync:', error?.message || error)
        );
"""
    replacement = extract(new, "        // " + marker, "        const user = await getCachedBackendUser();", "App.js")
    src = once(src, old_comment + old_call, replacement, "App.js")
    src = once(src, "import {syncContentDeltas} from './src/services/contentDeltaSync';\n", "", "App.js import")
    return src


def patch_hydrator(path, src, new, start, end, marker, expected):
    if marker in src:
        if start not in src:
            raise ValueError("Missing hydrator despite marker: " + path)
        return src
    old_block = extract(src, start, end, path)
    if any(token not in old_block for token in expected):
        raise ValueError("Hydrator has unfamiliar local changes: " + path)
    new_block = extract(new, "// " + marker, end, path)
    return src.replace(old_block, new_block, 1)


def patch_api(src, new):
    marker = "AKATHIST_PUBLISHED_ONLY_V1"
    if marker not in src:
        src = once(src, "import bundledBaseline from '../data/offlineContent.json';\n", "", "API baseline import")
        src = once(src, "import {isCuratedAkathist} from '../data/curatedAkathists';\n", "", "API curated import")
        src = once(
            src,
            "const baselineAkathistSlugs = new Set(Object.keys(bundledBaseline?.akathists?.by_slug || {}));\n"
            "const isVisibleAkathist = (item) => !!item && (isCuratedAkathist(item) || (!!item.slug && !baselineAkathistSlugs.has(String(item.slug))));",
            extract(new, "// " + marker, "const response = (data) => ({data});", "contentApi.js").rstrip(),
            "contentApi.js whitelist",
        )
    if "PUBLIC_RULES_BUNDLED_BY_DEFAULT_V1" not in src:
        old = (
            "// Set EXPO_PUBLIC_PRAYER_RULES_SOURCE=offline to use the bundled JSON in dev.\n"
            "const useLivePrayerRules = () =>\n"
            "  __DEV__ && process.env.EXPO_PUBLIC_PRAYER_RULES_SOURCE !== 'offline';"
        )
        replacement = extract(
            new, "// PUBLIC_RULES_BUNDLED_BY_DEFAULT_V1",
            "const isPrayerRulePath = (path) =>", "contentApi.js"
        ).rstrip()
        src = once(src, old, replacement, "contentApi.js default offline mode")
    return src


def patch_search(src, new):
    if "searchSeedBuild.database_name" in src:
        if "import searchSeedBuild from '../data/searchSeedBuild.json';" not in src:
            raise ValueError("Search manifest import missing")
        return src
    src = once(
        src, "import {SQLiteProvider, useSQLiteContext} from 'expo-sqlite';",
        "import {SQLiteProvider, useSQLiteContext} from 'expo-sqlite';\n"
        "import searchSeedBuild from '../data/searchSeedBuild.json';",
        "SearchScreen import",
    )
    old = re.findall(r'databaseName="molitvoslov_search_v10_[A-Za-z0-9]+\.db"', src)
    if len(old) != 1:
        raise ValueError("SearchScreen has unfamiliar SQLiteProvider name; refusing replacement")
    src = src.replace(old[0], "databaseName={searchSeedBuild.database_name}", 1)
    return src


def patch_release(src, new):
    if 'Assert-Command "Offline APK verification"' in src:
        return src
    old = 'Write-Host "[4/5] Check single bundled offline search database"\n'
    end = 'if (Test-Path ".\\android\\app\\src\\main\\assets\\search_seed.db") {'
    first = extract(src, old, end, "release script")
    target = extract(new, 'Write-Host "[4/5] Build and verify ALL public content inside the APK"\n', end, "release remote")
    return src.replace(first, target, 1)


def patch(path, src, new):
    if path == "App.js":
        return patch_app(src, new)
    if path == "src/services/contentStore.js":
        return patch_hydrator(path, src, new, "export const hydratePublicContent = async () => {",
                              "export const saveSyncedPublicContent = async",
                              "PUBLIC_CONTENT_BUNDLED_ONLY_V1", ["if (__DEV__)", "public_content_cache"])
    if path == "src/services/bibleStore.js":
        return patch_hydrator(path, src, new, "export const hydrateBibleContent = async (code = 'rst') => {",
                              "export const saveSyncedBibleContent = async",
                              "BIBLE_CONTENT_BUNDLED_ONLY_V1", ["SELECT version, payload", "public_content_cache"])
    if path == "src/services/contentApi.js":
        return patch_api(src, new)
    if path == "src/screens/SearchScreen.js":
        return patch_search(src, new)
    if path == "tools/build_release_1_0_20.ps1":
        return patch_release(src, new)
    raise ValueError("Unexpected file " + path)


def main():
    planned = {}
    for name in sorted(FILES):
        destination = ROOT / name
        source = destination.read_text(encoding="utf-8-sig").replace("\r\n", "\n")
        future = patch(name, source, remote(name))
        if source != future:
            planned[name] = future
    if not planned:
        print("APK-only public content code already patched")
        return

    backup = BACKUP_ROOT / ("apk-bundled-mode-" + datetime.now().strftime("%Y%m%d_%H%M%S"))
    backup.mkdir(parents=True, exist_ok=False)
    for name in planned:
        local = ROOT / name
        saved = backup / name
        saved.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(local, saved)

    try:
        for name, text in planned.items():
            (ROOT / name).write_text(text, encoding="utf-8")
            print("PATCHED:", name)
        # @babel/parser is bundled in the existing RN project toolchain.
        result = subprocess.run(
            ["node", str(ROOT / "tools" / "verify_bundled_apk_mode.js")],
            cwd=str(ROOT), capture_output=True, text=True, encoding="utf-8", errors="replace"
        )
        if result.stdout:
            print(result.stdout.strip())
        if result.returncode:
            raise RuntimeError("Source verification failed: " + result.stderr[-2000:])
    except BaseException:
        for name in planned:
            shutil.copy2(backup / name, ROOT / name)
        print("PATCH FAILED: code restored from backup", backup)
        raise

    print("SOURCE BACKUP:", backup)
    print("APK PUBLIC BUNDLED MODE PATCH VERIFIED")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("APK OFFLINE SOURCE PATCH FAILED:", error, file=sys.stderr)
        sys.exit(1)
