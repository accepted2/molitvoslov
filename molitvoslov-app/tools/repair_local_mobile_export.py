#!/usr/bin/env python3
"""Repair a LOCAL legacy Django exporter that excludes published akathists.

Only touches C:\m\repo\molitvoslov-backend\api\mobile_content.py if it still
contains the original curated-only akathists_qs selection.  Back up first;
test via Django ORM + the REAL exporter in the same Django process, verify
all other public sections are unchanged, and roll back on any failure.
No external database access, no personal data edits and no direct SQL writes.
"""
import ast
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from datetime import datetime

ROOT = Path(__file__).resolve().parents[1]
BACKEND = Path(r"C:\m\repo\molitvoslov-backend")
PYTHON = BACKEND / "venv" / "Scripts" / "python.exe"
MANAGE = BACKEND / "manage.py"
SOURCE = BACKEND / "api" / "mobile_content.py"
BACKUPS = ROOT.parent / "build-backups"
TARGET_SLUG = "akafist-bogoroditse-izbavlenie-ot-bed-strazhdushchikh"
TEST_SLUG = "test-ota-sync-2026"

# Run both the direct ORM query and the exporter inside one Python process,
# from precisely the same settings file and database connection.
SHELL_SNIPPET = r"""
import hashlib
import json
from django.db import connection
from api.models import Akathist, Text
import api.mobile_content as module
def fp(obj):
    return hashlib.sha256(json.dumps(obj, ensure_ascii=False, sort_keys=True,
        separators=(",", ":")).encode("utf-8")).hexdigest()
data = module.build_mobile_content_payload()
visible = list(Akathist.objects.filter(is_visible=True).values_list("slug", flat=True))
vtexts = list(Text.objects.filter(is_visible=True).values_list("slug", flat=True))
exported = [str(v["slug"]) for v in data["akathists"]["list"]]
texts = set(data["texts"])
sections = {k: v for k, v in data.items()
    if k not in ("schema_version", "generated_at", "content_version", "akathists")}
result = {
    "db": str(connection.settings_dict["NAME"]),
    "vendor": connection.vendor,
    "module": str(module.__file__),
    "visible": sorted(visible),
    "exported": sorted(exported),
    "missing_from_export": sorted(set(visible) - set(exported)),
    "extra_in_export": sorted(set(exported) - set(visible)),
    "visible_text_count": len(vtexts),
    "exported_text_count": len(texts),
    "missing_texts": sorted(set(vtexts) - texts),
    "non_akathist_fingerprint": fp(sections),
}
print("APK_LOCAL_EXPORT_DIAGNOSTIC=" + json.dumps(result, ensure_ascii=False))
"""


def check():
    proc = subprocess.run(
        [str(PYTHON), "-X", "utf8", str(MANAGE), "shell", "-c", SHELL_SNIPPET],
        cwd=str(BACKEND), stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, encoding="utf-8", errors="replace",
        env={**os.environ, "PYTHONIOENCODING": "utf-8"},
    )
    if proc.returncode:
        raise RuntimeError("Django exporter check failed: " + proc.stderr[-2200:])
    marker = "APK_LOCAL_EXPORT_DIAGNOSTIC="
    matches = [line.partition(marker)[2] for line in proc.stdout.splitlines() if marker in line]
    if len(matches) != 1:
        raise RuntimeError("Django exporter diagnostic was not returned: " + proc.stdout[-1300:])
    data = json.loads(matches[0])
    if data["vendor"] != "sqlite" or Path(data["db"]).resolve().parent != BACKEND.resolve():
        raise RuntimeError("Refusing to patch a non-local SQLite exporter: " + str(data["db"]))
    if Path(data["module"]).resolve() != SOURCE.resolve():
        raise RuntimeError("Django is importing an unexpected exporter: " + data["module"])
    if data["extra_in_export"]:
        raise RuntimeError("Exporter includes unpublished akathists: " + repr(data["extra_in_export"]))
    if data["missing_texts"]:
        raise RuntimeError(
            "Exporter is also excluding published prayer texts: " +
            repr(data["missing_texts"][:15]) +
            "; manual inspection required before packaging APK."
        )
    print("LOCAL SQLITE:", data["db"])
    print("Published akathists:", len(data["visible"]),
          "; exported akathists:", len(data["exported"]))
    print("Published texts:", data["visible_text_count"],
          "; exported texts:", data["exported_text_count"])
    if data["missing_from_export"]:
        print("Published akathist slugs missing from exporter:", data["missing_from_export"])
    return data


def corrected_exporter(source):
    tree = ast.parse(source)
    functions = [n for n in tree.body if isinstance(n, ast.FunctionDef)
                 and n.name == "build_mobile_content_payload"]
    if len(functions) != 1:
        raise RuntimeError("Expected exactly one build_mobile_content_payload function")
    statements = [
        n for n in ast.walk(functions[0])
        if isinstance(n, ast.Assign) and
        any(isinstance(t, ast.Name) and t.id == "akathists_qs" for t in n.targets)
    ]
    if len(statements) != 1:
        raise RuntimeError(
            "Cannot safely isolate the single akathists_qs assignment. Found: " +
            str(len(statements))
        )
    stmt = statements[0]
    old_segment = ast.get_source_segment(source, stmt) or ""
    if (
        "curated_akathist_ids" not in old_segment
        and "is_curated_akathist" not in old_segment
        and "id__in" not in old_segment
    ):
        raise RuntimeError(
            "Exporter omits published akathists, but its akathists_qs is "
            "not the known legacy curated-only filter: " + old_segment[:450]
        )
    lines = source.splitlines(keepends=True)
    original = lines[stmt.lineno - 1]
    prefix = original[:len(original) - len(original.lstrip(" \t"))]
    # AST end_lineno lets us safely replace a one-line or multiline curated
    # assignment without rewriting the rest of the user's local backend.
    lines[stmt.lineno - 1:stmt.end_lineno] = [
        prefix + "akathists_qs = Akathist.objects.filter(is_visible=True).order_by('id')\n"
    ]
    corrected = "".join(lines)
    compile(corrected, str(SOURCE), "exec")
    return corrected, old_segment


def main():
    if not all(p.is_file() for p in (PYTHON, MANAGE, SOURCE)):
        raise RuntimeError("Expected local Django backend is not available")
    before = check()
    if TEST_SLUG in before["visible"]:
        raise RuntimeError("Published test OTA akathist is present in canonical local SQLite")
    if TARGET_SLUG not in before["visible"]:
        raise RuntimeError("Known akathist not published in local Django; do not patch exporter")
    missing = before["missing_from_export"]
    if not missing:
        print("Django exporter already publishes all", len(before["visible"]), "akathists.")
        print("LOCAL PUBLIC CONTENT EXPORT VERIFIED")
        return
    code = SOURCE.read_text(encoding="utf-8-sig")
    new_code, old_selection = corrected_exporter(code)
    print("Legacy exporter filter detected:", old_selection)
    BACKUPS.mkdir(parents=True, exist_ok=True)
    backup = BACKUPS / (
        "mobile-content-exporter-before-visible-fix-" +
        datetime.now().strftime("%Y%m%d_%H%M%S") + ".py"
    )
    shutil.copy2(SOURCE, backup)
    temp = SOURCE.with_name(".mobile_content.visible.tmp")
    try:
        temp.write_text(new_code, encoding="utf-8")
        os.replace(temp, SOURCE)
        after = check()
        if after["missing_from_export"] or set(after["visible"]) != set(after["exported"]):
            raise RuntimeError("Exporter still excludes published akathists after patch")
        if after["missing_texts"]:
            raise RuntimeError("Exporter lost a published prayer text")
        if before["non_akathist_fingerprint"] != after["non_akathist_fingerprint"]:
            raise RuntimeError("Exporter changed unrelated public prayers or sections")
        if set(after["visible"]) != set(before["visible"]):
            raise RuntimeError("Local Django data changed during export repair")
    except BaseException:
        shutil.copy2(backup, SOURCE)
        print("EXPORTER RESTORED FROM BACKUP:", backup)
        raise
    finally:
        if temp.exists():
            temp.unlink()
    print("EXPORTER SOURCE BACKUP:", backup)
    print("PUBLISHED AKATHISTS EXPORTED:", len(after["exported"]))
    print("LOCAL PUBLIC CONTENT EXPORT VERIFIED")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("LOCAL CONTENT EXPORT REPAIR FAILED:", e, file=sys.stderr)
        sys.exit(1)
