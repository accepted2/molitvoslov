#!/usr/bin/env python3
"""Restore ONE previously supplied akathist into local SQLite and offline JSON.

The source comes from the EXISTING GitHub Django management command,
import_akathist_izbavlenie.py; no text is rewritten or generated.

Safety: preserve the 14 existing akathists, all existing Text records and
every other public-content section; back up SQLite with its backup API and
offlineContent.json; import only into LOCAL SQLite and only if absent.
On any mismatch stop before replacing the app's JSON.
"""
import ast
from datetime import datetime
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
BACKEND = Path(r"C:\m\repo\molitvoslov-backend")
PYTHON = BACKEND / "venv" / "Scripts" / "python.exe"
MANAGE = BACKEND / "manage.py"
DEST = BACKEND / "api" / "management" / "commands" / "import_akathist_izbavlenie.py"
APP_JSON = ROOT / "src" / "data" / "offlineContent.json"
SOURCE_IN_GIT = "molitvoslov-backend/api/management/commands/import_akathist_izbavlenie.py"
SLUG = "akafist-bogoroditse-izbavlenie-ot-bed-strazhdushchikh"
TITLE = "Акафист Пресвятой Богородице перед иконой «Избавление от бед страждущих»"
BACKUP_ROOT = ROOT.parent / "build-backups"
ENV = dict(os.environ, PYTHONIOENCODING="utf-8")

def command(args, cwd, require=True):
    result = subprocess.run(
        [str(a) for a in args], cwd=str(cwd), env=ENV,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    if result.stdout.strip():
        print(result.stdout.strip())
    if result.returncode and require:
        raise RuntimeError("Command failed (%d): %s\n%s" % (
            result.returncode, " ".join(str(x) for x in args[:6]),
            result.stderr[-2000:],
        ))
    return result

def get_importer_source():
    result = subprocess.run(
        ["git", "-C", str(ROOT), "show", "FETCH_HEAD:" + SOURCE_IN_GIT],
        capture_output=True, check=True,
    )
    source = result.stdout
    tree = ast.parse(source.decode("utf-8-sig"))
    entries = [
        node.value for node in tree.body
        if isinstance(node, ast.Assign)
        and any(isinstance(x, ast.Name) and x.id == "DATA" for x in node.targets)
    ]
    if len(entries) != 1:
        raise RuntimeError("The imported akathist DATA constant is absent or ambiguous")
    data = ast.literal_eval(entries[0])
    sections = data.get("sections", [])
    if (data.get("slug") != SLUG or data.get("title") != TITLE or
        len(sections) != 26 or
        sum(x.get("section_type") == "kontakion" for x in sections) != 13 or
        sum(x.get("section_type") == "ikos" for x in sections) != 12 or
        sum(x.get("section_type") == "prayer" for x in sections) != 1):
        raise RuntimeError("Git importer content does not match the expected complete akathist")
    if any(not x.get("paragraphs") for x in sections):
        raise RuntimeError("Empty akathist section")
    return source

def inspect_db():
    snippet = (
        "import json; from django.db import connection; from api.models import Akathist; "
        "a=Akathist.objects.filter(slug=" + repr(SLUG) + ").first(); "
        "print('AKATHIST_CHECK=' + json.dumps({"
        "'vendor':connection.vendor, 'db':str(connection.settings_dict.get('NAME')), "
        "'exists':bool(a), 'visible':bool(a.is_visible) if a else False, "
        "'sections':a.sections.count() if a else 0, "
        "'title':a.title if a else None, 'total':Akathist.objects.count()"
        "}, ensure_ascii=False))"
    )
    output = command([PYTHON, "-X", "utf8", MANAGE, "shell", "-c", snippet], BACKEND)
    marker = "AKATHIST_CHECK="
    lines = [s.partition(marker)[2] for s in output.stdout.splitlines() if marker in s]
    if len(lines) != 1:
        raise RuntimeError("Could not read the local Django database identity")
    info = json.loads(lines[0])
    if info.get("vendor") != "sqlite":
        raise RuntimeError("Only local SQLite is supported. Refusing to modify another database.")
    db_path = Path(info["db"]).resolve()
    if not db_path.is_file() or db_path.parent != BACKEND.resolve():
        raise RuntimeError("Unexpected local SQLite database: " + str(db_path))
    return info, db_path

def get_akathist_map(payload):
    section = payload.get("akathists", {})
    listing = section.get("list")
    details = section.get("by_slug")
    if not isinstance(listing, list) or not isinstance(details, dict):
        raise RuntimeError("Invalid offline akathist data")
    listed = {v.get("slug"): v for v in listing if isinstance(v, dict)}
    if len(listed) != len(listing) or None in listed:
        raise RuntimeError("Duplicate or missing akathist slugs")
    return listed, details

def validate_candidate(before, after):
    prev, prev_detail = get_akathist_map(before)
    curr, curr_detail = get_akathist_map(after)
    if SLUG in prev:
        if before.get("content_version") != after.get("content_version"):
            raise RuntimeError("Target already in JSON, but current content differs")
        return False
    extra = set(curr) - set(prev)
    if extra != {SLUG}:
        raise RuntimeError("Unexpected akathist additions: " + repr(extra))
    if set(prev) - set(curr):
        raise RuntimeError("Exporter lost an existing akathist")
    for slug in prev:
        if prev[slug] != curr[slug] or prev_detail.get(slug) != curr_detail.get(slug):
            raise RuntimeError("Exporter changed an existing akathist: " + str(slug))
    detail = curr_detail.get(SLUG) or {}
    if len(detail.get("sections", [])) != 26:
        raise RuntimeError("New akathist did not export all 26 sections")
    if not curr[SLUG].get("is_visible"):
        raise RuntimeError("New akathist is not published")
    original_texts = before.get("texts", {})
    new_texts = after.get("texts", {})
    if not isinstance(original_texts, dict) or not isinstance(new_texts, dict):
        raise RuntimeError("Missing text index in exported payload")
    for key, value in original_texts.items():
        if new_texts.get(key) != value:
            raise RuntimeError("Existing prayer text would change: " + key)
    for key, value in before.items():
        if key in ("generated_at", "content_version", "akathists", "texts"):
            continue
        if after.get(key) != value:
            raise RuntimeError("Unrelated offline section would change: " + key)
    if after.get("schema_version") != before.get("schema_version"):
        raise RuntimeError("Offline schema changed")
    return True

def main():
    if not PYTHON.is_file() or not MANAGE.is_file() or not APP_JSON.is_file():
        raise RuntimeError("Required local Django venv/backend or offlineContent.json is missing")
    before = json.loads(APP_JSON.read_text(encoding="utf-8-sig"))
    old_list, _ = get_akathist_map(before)
    print("Current offline akathists:", len(old_list))
    source = get_importer_source()
    if DEST.is_file():
        if DEST.read_bytes() != source:
            raise RuntimeError("Local Django importer differs from GitHub; existing file was NOT overwritten.")
        print("Importer already exists in backend; matching original source.")
    else:
        DEST.parent.mkdir(parents=True, exist_ok=True)
        DEST.write_bytes(source)
        print("Restored original Django importer:", DEST)
    info, db_path = inspect_db()
    print("Verified LOCAL SQLite:", db_path)
    print("Django akathists before:", info["total"])
    if info["exists"]:
        if info["title"] != TITLE or not info["visible"] or info["sections"] != 26:
            raise RuntimeError("Target already exists, but its identity or sections are incomplete")
        print("Target already imported, no duplicate created.")
    else:
        # Check Django's duplicate guard before committing anything.
        command([PYTHON, "-X", "utf8", MANAGE, "import_akathist_izbavlenie"], BACKEND)
        BACKUP_ROOT.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        db_backup = BACKUP_ROOT / ("sqlite-before-izbavlenie-" + stamp + ".sqlite3")
        with sqlite3.connect(str(db_path)) as original_db:
            with sqlite3.connect(str(db_backup)) as snapshot:
                original_db.backup(snapshot)
        print("LOCAL SQLITE BACKUP:", db_backup)
        command([PYTHON, "-X", "utf8", MANAGE, "import_akathist_izbavlenie", "--apply"], BACKEND)
        after_db, _ = inspect_db()
        if not after_db["exists"] or not after_db["visible"] or after_db["sections"] != 26:
            raise RuntimeError("Imported akathist failed DB verification")
        print("Django akathists after:", after_db["total"])
    BACKUP_ROOT.mkdir(parents=True, exist_ok=True)
    candidate = BACKUP_ROOT / ("offline-izbavlenie-candidate-" + datetime.now().strftime("%Y%m%d_%H%M%S") + ".json")
    command([PYTHON, "-X", "utf8", MANAGE, "export_mobile_content", "--output", candidate], BACKEND)
    after = json.loads(candidate.read_text(encoding="utf-8-sig"))
    changed = validate_candidate(before, after)
    if not changed:
        print("No offline JSON update needed; target already present.")
        return
    backup = BACKUP_ROOT / ("offline-before-izbavlenie-" + datetime.now().strftime("%Y%m%d_%H%M%S") + ".json")
    shutil.copy2(APP_JSON, backup)
    staging = APP_JSON.with_name(".offlineContent.izbavlenie.tmp")
    try:
        shutil.copy2(candidate, staging)
        os.replace(staging, APP_JSON)
    finally:
        if staging.exists():
            staging.unlink()
    print("OFFLINE JSON BACKUP:", backup)
    print("UPDATED:", APP_JSON)
    print("Offline akathists after:", len(after["akathists"]["list"]))
    print("Added exactly one akathist, preserved all previous content.")
    print("IZBAVLENIE AKATHIST RESTORED SAFELY")

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("IZBAVLENIE RESTORE FAILED:", exc, file=sys.stderr)
        sys.exit(1)
