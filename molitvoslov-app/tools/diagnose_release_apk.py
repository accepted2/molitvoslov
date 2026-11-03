#!/usr/bin/env python3
"""Read-only forensic check of built/installed Android APK vs local public assets.

Does not rebuild the APK, edit SQLite, or touch user data.
Usage: python -X utf8 tools/diagnose_release_apk.py [--installed-apk PATH]
"""
import argparse
from contextlib import closing
import hashlib
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
APK = ROOT / "android/app/build/outputs/apk/release/app-release.apk"
SEED = ROOT / "src/data/search_seed.db"
PUBLIC = ROOT / "src/data/offlineContent.json"
MANIFEST = ROOT / "src/data/searchSeedBuild.json"
MISC_SLUGS = (
    "molitva-svyatogo-pravednogo-ioanna-kronshtadtskogo",
    "molitva-inaya-svyatogo-pravednogo-ioanna-kronshtadtskogo",
    "molitva-ko-presvyatoj-troice-svyatogo-pravednogo-ioanna-kronshtadtskogo",
    "molitva-optinskih-starcev",
    "molitva-poslednih-optinskih-starcev",
)


def sha(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def json_file(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def audit_db(db_path, expected_titles):
    # sqlite3.Connection's own context manager does NOT close on exit.
    # Windows cannot delete the extracted APK database while the handle is open.
    with closing(sqlite3.connect("file:" + db_path.resolve().as_posix() + "?mode=ro", uri=True)) as db:
        integrity = db.execute("PRAGMA integrity_check").fetchone()[0]
        count = db.execute("SELECT COUNT(*) FROM doc").fetchone()[0]
        meta = dict(db.execute("SELECT k, v FROM meta"))
        found = db.execute(
            "SELECT title, ext, lang, grp FROM doc WHERE grp = 'prayers'"
        ).fetchall()
        matched = set()
        for title in expected_titles:
            if any(title.casefold() == str(row[0]).casefold() for row in found):
                matched.add(title)
        variants = db.execute(
            "SELECT lang, COUNT(*) FROM doc WHERE grp = 'prayers' GROUP BY lang"
        ).fetchall()
    return {"integrity": integrity, "docs": count, "meta": meta,
            "missing_misc_titles": sorted(set(expected_titles) - matched),
            "matched_misc_titles": sorted(matched), "prayer_lang_counts": variants}


def inspect_apk(apk, expected_titles):
    print("\n=== APK archive:", apk)
    print("Size MiB:", round(apk.stat().st_size / 1048576, 2))
    print("SHA-256:", sha(apk))
    with zipfile.ZipFile(apk) as archive:
        db_entries = [name for name in archive.namelist() if name.lower().endswith(".db")]
        bundles = [name for name in archive.namelist()
                   if name.endswith("index.android.bundle") or name.endswith("index.android.bundle.hbc")]
        print("Embedded SQLite entries:", db_entries)
        print("Embedded JS bundles:", bundles)
        inspect_js_build(archive, bundles)
        if len(db_entries) != 1:
            raise RuntimeError("Expected one embedded search SQLite DB, got: " + repr(db_entries))
        with tempfile.TemporaryDirectory(prefix="molitvoslov-apk-audit-") as folder:
            extracted = Path(folder) / "apk-search.db"
            with archive.open(db_entries[0]) as source, extracted.open("wb") as output:
                for block in iter(lambda: source.read(1024 * 1024), b""):
                    output.write(block)
            embedded_hash = sha(extracted)
            print("Embedded search DB SHA-256:", embedded_hash)
            info = audit_db(extracted, expected_titles)
            print("Embedded search docs:", info["docs"])
            print("Embedded SQLite integrity:", info["integrity"])
            print("Embedded index public version:", info["meta"].get("public_content_version"))
            print("Search document language counts:", info["prayer_lang_counts"])
            print("Verified restored prayer titles:", len(info["matched_misc_titles"]), "/ 5")
            for title in info["missing_misc_titles"]:
                print("MISSING FROM SEARCH DB:", title)
            return embedded_hash, info


def inspect_js_build(archive, bundle_names):
    """Best-effort check of the compiled release JS and its source map."""
    print("\n=== Embedded JavaScript ===")
    if not bundle_names:
        print("WARNING: no standard index.android.bundle found in APK")
    for name in bundle_names:
        with archive.open(name) as payload:
            digest = hashlib.sha256()
            for piece in iter(lambda: payload.read(1024 * 1024), b""):
                digest.update(piece)
        print("APK JavaScript bundle:", name, "SHA-256:", digest.hexdigest())

    candidates = [
        ROOT / "android/app/build/generated/sourcemaps/react/release/index.android.bundle.map",
        ROOT / "android/app/build/generated/sourcemaps/react/release/index.android.bundle.packager.map",
        ROOT / "android/app/build/generated/sourcemaps/react/release/index.android.bundle.compiler.map",
    ]
    for candidate in candidates:
        if not candidate.is_file():
            continue
        try:
            mapping = json_file(candidate)
            paths = mapping.get("sources") or []
            sources = mapping.get("sourcesContent") or []
            print("RELEASE SOURCE MAP:", candidate)
            markers = {
                "FixedSectionHeader.js": ("languageOpen", "extraTitleHeight"),
                "ReaderAppearanceSheet.js": ("sliderDragging", "sheetPreview"),
                "SearchScreen.js": ("searchSeedBuild.database_name", "SQLiteProvider"),
            }
            for file_name, needles in markers.items():
                positions = [i for i, name in enumerate(paths)
                             if str(name).replace("\\", "/").endswith("/" + file_name)]
                if not positions:
                    print("SOURCE IN BUNDLE:", file_name, "NOT LISTED")
                elif not sources:
                    print("SOURCE IN BUNDLE:", file_name,
                          "LISTED; map does not embed source contents")
                else:
                    actual = [sources[i] or "" for i in positions if i < len(sources)]
                    present = any(all(needle in value for needle in needles)
                                  for value in actual)
                    print("CURRENT FEATURES IN BUNDLED SOURCE:", file_name,
                          "YES" if present else "NO - bundled source appears outdated")
            break
        except (OSError, ValueError, TypeError) as error:
            print("Could not read source map:", str(error)[:160])
    else:
        print("RELEASE SOURCE MAP: not found; JavaScript source revision cannot be confirmed.")


def _zip_entry_sha(archive, entry):
    digest = hashlib.sha256()
    with archive.open(entry) as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def compare_installed_payload(built_path, installed_path, expected_titles):
    """Compare actual JS and SQLite bytes, not only outer APK signatures.

    Android can store/repackage/sign the ZIP differently. A different APK hash
    therefore does not by itself establish that a different app is running.
    """
    with zipfile.ZipFile(built_path) as built, zipfile.ZipFile(installed_path) as installed:
        built_entries = {item.filename: item for item in built.infolist()}
        installed_entries = {item.filename: item for item in installed.infolist()}
        common = set(built_entries) & set(installed_entries)
        missing = sorted(set(built_entries) - set(installed_entries))
        extra = sorted(set(installed_entries) - set(built_entries))
        changed = sorted(
            name for name in common
            if (built_entries[name].file_size, built_entries[name].CRC)
            != (installed_entries[name].file_size, installed_entries[name].CRC)
        )
        print("APK_ARCHIVE_ENTRIES:", len(built_entries), "built;", len(installed_entries), "installed")
        print("APK_ENTRIES_DIFFER:", len(missing) + len(extra) + len(changed))
        if missing:
            print("MISSING INSTALLED ENTRIES (sample):", missing[:12])
        if extra:
            print("EXTRA INSTALLED ENTRIES (sample):", extra[:12])
        if changed:
            print("MODIFIED INSTALLED ENTRIES (sample):", changed[:20])

        def member(label, pattern):
            candidates = [n for n in built_entries if pattern(n)]
            installed_candidates = [n for n in installed_entries if pattern(n)]
            if len(candidates) != 1 or len(installed_candidates) != 1:
                print(label + "_MATCH: UNKNOWN (unexpected APK members)")
                print("  built:", candidates, "installed:", installed_candidates)
                return None, None, None
            src, dest = candidates[0], installed_candidates[0]
            a, b = _zip_entry_sha(built, src), _zip_entry_sha(installed, dest)
            print(label + "_BUILT_SHA256:", a)
            print(label + "_INSTALLED_SHA256:", b)
            print(label + "_MATCH:", "YES" if a == b else "NO")
            return src, dest, a == b

        js = member("INSTALLED_JS_BUNDLE", lambda n: n.endswith("index.android.bundle") or n.endswith("index.android.bundle.hbc"))
        db = member("INSTALLED_SEARCH_DB", lambda n: n.lower().endswith(".db"))
        if db[1]:
            with tempfile.TemporaryDirectory(prefix="molitvoslov-phone-search-") as folder:
                dst = Path(folder) / "phone-search.db"
                with installed.open(db[1]) as input_stream, dst.open("wb") as output_stream:
                    for chunk in iter(lambda: input_stream.read(1024 * 1024), b""):
                        output_stream.write(chunk)
                try:
                    info = audit_db(dst, expected_titles)
                    print("INSTALLED_SEARCH_DOCS:", info["docs"])
                    print("INSTALLED_SEARCH_INTEGRITY:", info["integrity"])
                    print("INSTALLED_SEARCH_PUBLIC_VERSION:", info["meta"].get("public_content_version"))
                    print("INSTALLED_SEARCH_5_PRAYERS:", len(info["matched_misc_titles"]), "/ 5")
                except sqlite3.Error as exc:
                    print("INSTALLED_SEARCH_SQLITE_ERROR:", exc)
        print("INSTALLED_PAYLOAD_MATCH:", (
            "YES" if js[2] is True and db[2] is True
            else "NO" if js[2] is False or db[2] is False
            else "UNKNOWN"
        ))
        if js[2] is True and db[2] is True:
            print("DIAGNOSIS: JS and search SQLite on phone MATCH current APK.")
            print("Investigate runtime selection, cached data and search behavior; a rebuild is not indicated.")
        elif js[2] is False or db[2] is False:
            print("DIAGNOSIS: phone contains different JS or search SQLite.")
            print("A signature-compatible adb install -r may update the app without clearing user data.")


def source_checks(expected_titles):
    print("=== Local source artifacts ===")
    content = json_file(PUBLIC)
    manifest = json_file(MANIFEST)
    current_texts = content.get("texts", {})
    linked = {
        (record.get("text") or {}).get("slug")
        for record in content.get("category_texts", {}).get("raznye-molitvy", [])
    }
    for slug in MISC_SLUGS:
        row = current_texts.get(slug) or {}
        if slug not in current_texts or slug not in linked:
            print("MISSING FROM SOURCE JSON OR CATEGORY:", slug)
    print("Current public JSON texts:", len(current_texts))
    print("Current offline content version:", content.get("content_version"))
    print("Current search manifest name:", manifest.get("database_name"))
    print("Current source search DB SHA-256:", sha(SEED))
    print("Current source DB documents:", audit_db(SEED, expected_titles)["docs"])
    return content, manifest, sha(SEED)


def main():
    args = argparse.ArgumentParser()
    args.add_argument("--installed-apk", type=Path, default=None,
                      help="ADB-pulled installed base.apk for exact comparison")
    args.add_argument("--strict", action="store_true",
                      help="Fail release validation if bundled search and source differ")
    parsed = args.parse_args()
    for file in (APK, SEED, PUBLIC, MANIFEST):
        if not file.is_file():
            raise RuntimeError("File is missing: " + str(file))

    content = json_file(PUBLIC)
    titles = [content["texts"][slug]["title"] for slug in MISC_SLUGS
              if slug in content.get("texts", {})]
    if len(titles) != 5:
        print("WARNING: current offline content does not contain all five restored prayers")

    _content, manifest, source_hash = source_checks(titles)
    embedded_hash, info = inspect_apk(APK, titles)
    print("\n=== Source versus release APK ===")
    print("SEARCH_DB_MATCH:", "YES" if source_hash == embedded_hash else "NO - APK has different search data")
    print("PUBLIC_VERSION_MATCH:", "YES" if info["meta"].get("public_content_version") == content.get("content_version")
          else "NO - APK search index belongs to a different offline JSON")
    print("MANIFEST_SEED_MATCH:", "YES" if manifest.get("seed_sha256") == embedded_hash
          else "NO - search manifest and APK database differ")
    print("SEARCH_5_PRAYERS:", "YES" if len(info["matched_misc_titles"]) == 5
          else "NO - some restored prayer titles are absent in bundled DB")
    if parsed.strict and (
        len(titles) != 5 or embedded_hash != source_hash or
        info["meta"].get("public_content_version") != content.get("content_version") or
        manifest.get("seed_sha256") != embedded_hash or
        len(info["matched_misc_titles"]) != 5 or info["integrity"] != "ok"
    ):
        raise RuntimeError(
            "Release APK does not contain the complete expected five prayer search index; "
            "refusing to mark it BUILD VERIFIED."
        )
    if parsed.installed_apk:
        if not parsed.installed_apk.is_file():
            raise RuntimeError("Installed APK copy missing: " + str(parsed.installed_apk))
        print("\n=== Installed copy vs newly built APK ===")
        print("INSTALLED_APK_SHA256:", sha(parsed.installed_apk))
        print("INSTALLED_MATCHES_BUILT:",
              "YES" if sha(APK) == sha(parsed.installed_apk)
              else "NO - APK container bytes differ; inspect embedded payload below")
        compare_installed_payload(APK, parsed.installed_apk, titles)
    else:
        print("\nNo installed APK supplied; phone version remains UNVERIFIED.")
    print("IMPORTANT: SQLite contents do not establish which JavaScript bundle runs on the phone.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("APK DIAGNOSTIC FAILED:", error, file=sys.stderr)
        sys.exit(1)
