#!/usr/bin/env python3
"""Prepare and verify the complete PUBLIC offline payload before Android APK builds.

No network and no Supabase. Does not mutate Django or personal data.
Search is always rebuilt from the exact offlineContent/offlineBible JSON
bundled in this APK when the existing seed is stale.

The versioned search database filename is keyed to the actual SHA256 of
search_seed.db, allowing expo-sqlite to import a fresh DB on an app upgrade
instead of silently reusing the previous installed search index.
"""
import argparse
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / "tools"
DATA = ROOT / "src" / "data"
BACKUPS = ROOT.parent / "build-backups"
PUBLIC = DATA / "offlineContent.json"
BIBLE = DATA / "offlineBible.json"
SEED = DATA / "search_seed.db"
SEED_V10 = DATA / "search_seed_v10.db"
MANIFEST = DATA / "searchSeedBuild.json"
MUST_HAVE_AKATHIST = "akafist-bogoroditse-izbavlenie-ot-bed-strazhdushchikh"

sys.path.insert(0, str(TOOLS))
from search_seed_lib import SCHEMA  # noqa: E402


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as fd:
        while True:
            chunk = fd.read(4 * 1024 * 1024)
            if not chunk:
                return digest.hexdigest()
            digest.update(chunk)


def snapshot_status(payload):
    return {
        "akathists": len(payload.get("akathists", {}).get("list", [])),
        "canons": len(payload.get("canons", {}).get("list", [])),
        "prayer_rules": len(payload.get("prayer_rules", {}).get("list", [])),
        "texts": len(payload.get("texts", {})),
    }


def distinct_keys(payload, section):
    if section == "texts":
        return set(payload.get("texts", {}))
    listing = payload.get(section, {}).get("list", [])
    return {str(x["slug"]) for x in listing if isinstance(x, dict) and x.get("slug")}


def validate_public(payload):
    if payload.get("schema_version") != 1 or not payload.get("content_version"):
        raise ValueError("Invalid public JSON format or missing content version")
    for section in ("akathists", "canons", "prayer_rules"):
        listing = payload.get(section, {}).get("list")
        details = payload.get(section, {}).get("by_slug")
        if not isinstance(listing, list) or not isinstance(details, dict):
            raise ValueError("Missing offline section: " + section)
        keys = [x.get("slug") for x in listing]
        if not keys or len(keys) != len(set(keys)) or not all(keys):
            raise ValueError("Duplicate/missing slugs in " + section)
        for item in listing:
            if item["slug"] not in details:
                raise ValueError("Missing complete offline detail: " + item["slug"])
    if MUST_HAVE_AKATHIST not in distinct_keys(payload, "akathists"):
        raise ValueError(
            "APK IS INCOMPLETE: the already published akathist "
            "'Избавление от бед страждущих' is absent from offlineContent.json. "
            "Run tools/install_akathist_izbavlenie.ps1 first; do NOT build the incomplete APK."
        )
    detail = payload["akathists"]["by_slug"][MUST_HAVE_AKATHIST]
    if len(detail.get("sections") or []) not in (26, 28):
        raise ValueError("The restored akathist must contain 26 or 28 complete sections")
    if not next(
        (x for x in payload["akathists"]["list"] if x.get("slug") == MUST_HAVE_AKATHIST),
        {},
    ).get("is_visible"):
        raise ValueError("The restored akathist is not published")
    if not isinstance(payload.get("texts"), dict) or not payload.get("texts"):
        raise ValueError("No offline public prayers")
    print("PUBLIC JSON VALID:", snapshot_status(payload))


def compare_to_prior_backups(payload):
    if not BACKUPS.exists():
        print("No previous offline JSON backup directory exists.")
        return
    paths = [
        p for p in BACKUPS.rglob("*.json")
        if p.is_file() and p.stat().st_size > 100_000 and
        ("offline" in p.name.lower() or "content" in p.name.lower())
    ]
    # Metadata-only listing before parse, newest first. Never rewrite old files.
    paths.sort(key=lambda x: x.stat().st_mtime, reverse=True)
    inspected = 0
    for path in paths[:120]:
        try:
            other = load_json(path)
            if other.get("schema_version") != payload.get("schema_version"):
                continue
            if not isinstance(other.get("akathists", {}).get("list"), list):
                continue
            if other.get("content_version") == payload.get("content_version"):
                continue
            inspected += 1
            missing = {
                section: sorted(distinct_keys(other, section) - distinct_keys(payload, section))
                for section in ("akathists", "canons", "prayer_rules", "texts")
            }
            missing = {k: v for k, v in missing.items() if v}
            if missing:
                print("PREVIOUS BUNDLE CONTAINS MISSING PUBLIC RECORDS:", path)
                for section, keys in missing.items():
                    print("  ", section, len(keys), "missing:", ", ".join(keys[:15]))
                raise ValueError(
                    "Refusing a possibly regressed APK. Inspect the missing records "
                    "against the previous snapshot above before building."
                )
        except (ValueError, RuntimeError):
            raise
        except Exception:
            # Not every .json in build-backups is a full content snapshot.
            continue
    print("Prior offline snapshots checked:", inspected)


def seed_metadata(path, public_version, bible_version):
    if not path.is_file() or path.stat().st_size < 4096:
        return None
    try:
        with sqlite3.connect("file:" + path.resolve().as_posix() + "?mode=ro", uri=True) as db:
            meta = dict(db.execute("SELECT k, v FROM meta"))
            if (meta.get("schema") != SCHEMA or
                meta.get("public_content_version") != public_version or
                meta.get("bible_content_version") != bible_version):
                return None
            if db.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                return None
            count = db.execute("SELECT COUNT(*) FROM doc").fetchone()[0]
            if count < 1000:
                return None
            return count
    except (sqlite3.Error, OSError):
        return None


def rebuild_seed(public_version, bible_version):
    count = seed_metadata(SEED, public_version, bible_version)
    if count:
        print("Existing packaged search seed matches source JSON: docs", count)
        return
    print("Search seed is stale or missing; building complete SQLite from bundled JSON...")
    subprocess.run(
        [sys.executable, "-X", "utf8", str(TOOLS / "build_search_seed_v10.py")],
        cwd=str(ROOT), check=True,
    )
    subprocess.run(
        [sys.executable, "-X", "utf8", str(TOOLS / "verify_search_seed_v10.py")],
        cwd=str(ROOT), check=True,
    )
    count = seed_metadata(SEED_V10, public_version, bible_version)
    if not count:
        raise RuntimeError("Regenerated search seed does not match the bundled content")
    if SEED.is_file() and SEED.stat().st_size > 4096:
        BACKUPS.mkdir(parents=True, exist_ok=True)
        previous = BACKUPS / (
            "search-seed-before-apk-" + datetime.now().strftime("%Y%m%d_%H%M%S") + ".db"
        )
        shutil.copy2(SEED, previous)
        print("Previous search DB backed up:", previous)
    tmp = DATA / (".search_seed." + str(os.getpid()) + ".tmp")
    try:
        shutil.copyfile(SEED_V10, tmp)
        os.replace(tmp, SEED)
    finally:
        if tmp.exists():
            tmp.unlink()
    print("Rebuilt packaged search DB:", count, "records")


def verify_manifest(public_version, bible_version, write):
    count = seed_metadata(SEED, public_version, bible_version)
    if not count:
        raise RuntimeError("Packaged search_seed.db missing, stale or corrupted")
    fingerprint = sha256(SEED)
    expected = {
        "schema_version": 1,
        "database_name": "molitvoslov_search_v10_" + fingerprint[:16] + ".db",
        "seed_sha256": fingerprint,
        "public_content_version": public_version,
        "bible_content_version": bible_version,
    }
    if write:
        if not MANIFEST.is_file() or load_json(MANIFEST) != expected:
            tmp = MANIFEST.with_name(".searchSeedBuild.json.tmp")
            try:
                tmp.write_text(
                    json.dumps(expected, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8",
                )
                os.replace(tmp, MANIFEST)
            finally:
                if tmp.exists():
                    tmp.unlink()
            print("Updated search manifest:", expected["database_name"])
    elif load_json(MANIFEST) != expected:
        raise RuntimeError(
            "Missing or outdated searchSeedBuild.json. "
            "Run prepare_offline_apk.py without --verify-only."
        )
    print("APK SEARCH INDEX VERIFIED:", count, "docs;", expected["database_name"])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--verify-only", action="store_true",
        help="Only check existing APK payload and search manifest, no writes",
    )
    args = parser.parse_args()
    public = load_json(PUBLIC)
    bible = load_json(BIBLE)
    validate_public(public)
    if not bible.get("content_version") or not isinstance(bible.get("books"), list):
        raise ValueError("Invalid bundled Bible")
    compare_to_prior_backups(public)
    if not args.verify_only:
        rebuild_seed(public["content_version"], bible["content_version"])
    verify_manifest(public["content_version"], bible["content_version"], not args.verify_only)
    print("OFFLINE APK CONTENT READY - NO REMOTE PUBLIC SOURCE")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("OFFLINE APK PREFLIGHT FAILED:", error, file=sys.stderr)
        sys.exit(1)
