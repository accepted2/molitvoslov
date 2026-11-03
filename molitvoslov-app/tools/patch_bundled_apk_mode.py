#!/usr/bin/env python3
"""Apply the APK-only public content policy without discarding local UI edits.

GitHub holds the authoritative *new code blocks*; only specifically identified
old blocks in the current working tree are replaced, never entire screen files.
The caller must first git fetch the target branch to populate FETCH_HEAD.
"""
from datetime import datetime
from pathlib import Path
import json
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
    "src/services/calendarOfflineStore.js",
    "src/screens/SearchScreen.js",
    "scripts/copy-search-seed.js",
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
    """Change only SQLiteProvider.databaseName, preserving all other local UI.

    Parse JSX with the project's existing @babel/parser instead of guessing
    a particular hard-coded database filename or its quoting/indentation.
    All character offsets stay in JavaScript to safely handle Unicode.
    """
    script = r"""
const fs = require('fs');
const parser = require('@babel/parser');
const input = fs.readFileSync(0, 'utf8');
const ast = parser.parse(input, {sourceType: 'module', plugins: ['jsx']});
const providers = [];
function walk(node) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach(walk); return; }
  if (node.type === 'JSXOpeningElement' && node.name?.type === 'JSXIdentifier' &&
      node.name.name === 'SQLiteProvider') providers.push(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'extra' || key === 'comments') continue;
    if (value && typeof value === 'object') walk(value);
  }
}
walk(ast.program);
if (providers.length !== 1) {
  throw new Error('Expected one SQLiteProvider, found ' + providers.length);
}
const provider = providers[0];
const attrs = provider.attributes.filter(a => a.type === 'JSXAttribute');
const databaseNames = attrs.filter(a => a.name.name === 'databaseName');
if (databaseNames.length !== 1) {
  throw new Error('SQLiteProvider.databaseName must occur exactly once');
}
if (!attrs.some(a => a.name.name === 'assetSource')) {
  throw new Error('SQLiteProvider has no bundled SQLite assetSource');
}
const target = databaseNames[0];
const old = input.slice(target.start, target.end);
if (old !== 'databaseName={searchSeedBuild.database_name}') {
  if (!target.value ||
      (target.value.type !== 'StringLiteral' &&
       target.value.type !== 'JSXExpressionContainer')) {
    throw new Error('SQLiteProvider databaseName has an unsupported value');
  }
  // The named SQLiteProvider and its bundled assetSource uniquely identify
  // the search DB. Its databaseName may be a literal, identifier or expression;
  // only this one attribute is replaced, leaving the local UI untouched.
}
const newAttr = 'databaseName={searchSeedBuild.database_name}';
let output = input.slice(0, target.start) + newAttr + input.slice(target.end);
const manifestPath = '../data/searchSeedBuild.json';
const matches = ast.program.body.filter(n => n.type === 'ImportDeclaration' &&
  n.source.value === manifestPath);
if (matches.length > 1) throw new Error('Duplicate search seed manifest imports');
if (matches.length === 1) {
  if (!matches[0].specifiers.some(spec => spec.type === 'ImportDefaultSpecifier' &&
                                  spec.local.name === 'searchSeedBuild')) {
    throw new Error('Conflicting existing search seed manifest import');
  }
} else {
  const sqliteImports = ast.program.body.filter(n => n.type === 'ImportDeclaration' &&
    n.source.value === 'expo-sqlite');
  if (sqliteImports.length !== 1) {
    throw new Error('Cannot find exactly one expo-sqlite import for manifest insertion');
  }
  // Insert after the existing SQLite import. Its byte offset is before JSX.
  // Source indices are UTF-16 and are used only in this Node process.
  const insertionIndex = sqliteImports[0].end;
  output = output.slice(0, insertionIndex) +
    "\nimport searchSeedBuild from '../data/searchSeedBuild.json';" +
    output.slice(insertionIndex);
}
parser.parse(output, {sourceType: 'module', plugins: ['jsx']});
process.stdout.write(JSON.stringify({content: output, previousDatabaseName: old}));
"""
    # CRITICAL on Windows: subprocess text=True converts stdin LF to CRLF.
    # The Node script returns the source verbatim; sending it as text would
    # alter line endings on every invocation and break idempotence.
    result = subprocess.run(
        ["node", "-e", script], input=src.encode("utf-8"), cwd=str(ROOT),
        capture_output=True
    )
    if result.returncode:
        raise ValueError(
            "SearchScreen SQLiteProvider cannot be safely patched: " +
            result.stderr.decode("utf-8", errors="replace")[-2200:]
        )
    payload = json.loads(result.stdout.decode("utf-8"))
    updated = payload["content"]
    if updated.count("databaseName={searchSeedBuild.database_name}") != 1:
        raise ValueError("SearchScreen search DB name was not uniquely replaced")
    if updated != src:
        print("SearchScreen databaseName updated from:", payload["previousDatabaseName"])
    return updated


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
    if path == "src/services/calendarOfflineStore.js":
        if "CALENDAR_BUNDLED_ONLY_V1" in src:
            return src
        start = "export const getOfflineCalendarDay = async (date, language = 'ru') => {"
        end = "/*\n * Сохраняем свежий день, полученный с сервера."
        old = extract(src, start, end, path)
        if "getStoredCalendarDay" not in old or "storedByDate" not in old:
            raise ValueError("Calendar offline read path has unknown modifications")
        replacement = extract(new, "// CALENDAR_BUNDLED_ONLY_V1", end, path)
        return src.replace(old, replacement, 1)
    if path == "src/screens/SearchScreen.js":
        return patch_search(src, new)
    if path == "scripts/copy-search-seed.js":
        marker = "// SEARCH_SEED_METRO_ONLY_V1"
        if marker in src:
            if "cleanupFs.unlinkSync(nativeSeed)" not in src[src.index(marker):]:
                raise ValueError("Search seed cleanup marker is incomplete")
            return src
        if new.count(marker) != 1:
            raise ValueError("Missing canonical search seed postcondition in GitHub")
        # Append a self-contained, checksum-guarded cleanup. Existing installer
        # code remains untouched, even if locally modified or reorganized.
        # The suffix computes its own source/destination paths, so it does not
        # depend on earlier local variable names.
        suffix = new[new.index(marker):].rstrip()
        return src.rstrip() + "\n\n" + suffix + "\n"
    if path == "tools/build_release_1_0_20.ps1":
        return patch_release(src, new)
    raise ValueError("Unexpected file " + path)


def main():
    planned = {}
    preflight_errors = []
    # Preflight EVERY target before writing ANY file, so if an unexpected
    # local version exists, all incompatibilities appear in one invocation.
    for name in sorted(FILES):
        destination = ROOT / name
        try:
            if not destination.is_file():
                if name == "tools/build_release_1_0_20.ps1":
                    planned[name] = remote(name)
                    continue
                raise FileNotFoundError("Missing source file: " + str(destination))
            source = destination.read_text(encoding="utf-8-sig").replace("\r\n", "\n")
            future = patch(name, source, remote(name))
            if source != future:
                planned[name] = future
        except Exception as error:
            preflight_errors.append((name, error))
    if preflight_errors:
        print("APK PATCH PREFLIGHT found", len(preflight_errors),
              "local incompatibilities; no app source files modified:",
              file=sys.stderr)
        for name, error in preflight_errors:
            print(" -", name, ":", error, file=sys.stderr)
        raise RuntimeError("Fix the listed incompatibilities before applying APK mode")
    if not planned:
        print("APK-only public content code already patched")
        return

    backup = BACKUP_ROOT / ("apk-bundled-mode-" + datetime.now().strftime("%Y%m%d_%H%M%S"))
    backup.mkdir(parents=True, exist_ok=False)
    for name in planned:
        local = ROOT / name
        saved = backup / name
        saved.parent.mkdir(parents=True, exist_ok=True)
        if local.exists():
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
            saved = backup / name
            if saved.exists():
                shutil.copy2(saved, ROOT / name)
            else:
                (ROOT / name).unlink(missing_ok=True)
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
