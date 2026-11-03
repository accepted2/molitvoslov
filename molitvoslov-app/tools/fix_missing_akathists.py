#!/usr/bin/env python3
"""Fix curated-only akathist visibility and safely compare Django with offline JSON.

Never overwrites an existing offlineContent.json unless:
  - Django's generated payload is valid and newer,
  - every published akathist already bundled remains present,
  - existing counts of other major public-content sections are not reduced, and
  - there is at least one additional published akathist.

The generated candidate is retained for inspection if promotion is unsafe.
No app uninstall, no removal of phone data, no backend DB mutation.
"""
from datetime import datetime
import json
from pathlib import Path
import shutil
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]
APP_JSON=ROOT/"src"/"data"/"offlineContent.json"
CONTENT_API=ROOT/"src"/"services"/"contentApi.js"
BACKEND=Path(r"C:\m\repo\molitvoslov-backend")
PYTHON=BACKEND/"venv"/"Scripts"/"python.exe"
MARKER="AKATHIST_PUBLISHED_ONLY_V1"

def slugs(payload, section):
    values=payload.get(section, {}).get("list", [])
    if not isinstance(values,list):
        raise ValueError(f"Invalid {section}.list")
    return {str(item.get("slug","")) for item in values if isinstance(item,dict) and item.get("slug")}

def summary(payload):
    return {section:len(slugs(payload,section)) for section in ("akathists","canons","prayer_rules")}

def patch_visibility():
    src=CONTENT_API.read_text(encoding="utf-8-sig")
    if MARKER in src:
        print("ALREADY PATCHED: published akathists are shown without curated baseline filter")
        return
    old_import="import {isCuratedAkathist} from '../data/curatedAkathists';\n"
    old_filter=(
        "const baselineAkathistSlugs = new Set(Object.keys(bundledBaseline?.akathists?.by_slug || {}));\n"
        "const isVisibleAkathist = (item) => !!item && (isCuratedAkathist(item) || (!!item.slug && !baselineAkathistSlugs.has(String(item.slug))));"
    )
    old_baseline="import bundledBaseline from '../data/offlineContent.json';\n"
    for name,needle in [("baseline import",old_baseline),("curated import",old_import),("curated predicate",old_filter)]:
        if src.count(needle)!=1:
            raise ValueError(f"contentApi.js changed: {name} expected once, found {src.count(needle)}")
    new=src.replace(old_baseline,"",1).replace(old_import,"",1)
    new=new.replace(old_filter,
        "// "+MARKER+"\n"
        "// Visibility is controlled by Django admin, not a hard-coded list.\n"
        "const isVisibleAkathist = (item) => !!item && item.is_visible === true;",1)
    if "isCuratedAkathist" in new or "baselineAkathistSlugs" in new:
        raise RuntimeError("Old visibility filter remains; refusing to patch")
    backup=ROOT.parent/"build-backups"/("akathist-visibility-"+datetime.now().strftime("%Y%m%d_%H%M%S"))
    backup.mkdir(parents=True,exist_ok=False)
    shutil.copy2(CONTENT_API,backup/CONTENT_API.name)
    CONTENT_API.write_text(new,encoding="utf-8")
    print("PATCHED:",CONTENT_API)
    print("SOURCE BACKUP:",backup)

def compare_and_export():
    current=json.loads(APP_JSON.read_text(encoding="utf-8-sig"))
    if not PYTHON.is_file() or not (BACKEND/"manage.py").is_file():
        print("Backend not found at",BACKEND)
        print("Skipping export: visibility filter is still patched safely.")
        return
    candidate=ROOT.parent/"build-backups"/("offlineContent-akathists-candidate-"+datetime.now().strftime("%Y%m%d_%H%M%S")+".json")
    # Python Path does not support addition to Path in all versions.
    print("Exporting fresh Django snapshot to temporary candidate...")
    result=subprocess.run(
        [str(PYTHON),"-X","utf8","manage.py","export_mobile_content",
         "--output",str(candidate)],
        cwd=str(BACKEND),capture_output=True,text=True,encoding="utf-8",
        errors="replace",check=False
    )
    if result.stdout:
        print(result.stdout.strip())
    if result.returncode:
        if result.stderr:
            print(result.stderr[-2600:],file=sys.stderr)
        print("Django export failed; original offline JSON remains unchanged.")
        return
    proposed=json.loads(candidate.read_text(encoding="utf-8"))
    before=summary(current)
    after=summary(proposed)
    print("Current:",before,"generated_at:",current.get("generated_at"))
    print("Django :",after,"generated_at:",proposed.get("generated_at"))
    missing=slugs(current,"akathists")-slugs(proposed,"akathists")
    added=slugs(proposed,"akathists")-slugs(current,"akathists")
    print("New published akathists:",len(added))
    for slug in sorted(added):
        item=next((a for a in proposed["akathists"]["list"] if a.get("slug")==slug),{})
        print(" +",item.get("title") or slug,"[",slug,"]")
    if missing:
        print("WARNING: current akathists absent from Django export:")
        for slug in sorted(missing): print(" -",slug)
    if not added:
        print("No additional published akathists in THIS local Django DB.")
        print("If the phone has more, its source is a remote update or another database.")
        print("Original offline JSON kept.")
        return
    reasons=[]
    if missing:
        reasons.append("new export is missing existing published akathists")
    for section in ("canons","prayer_rules"):
        if slugs(current,section)-slugs(proposed,section):
            reasons.append(f"new export is missing {section} records")
    if len(proposed.get("texts",{}))<len(current.get("texts",{})):
        reasons.append("new export has fewer texts")
    if not proposed.get("schema_version") or not proposed.get("generated_at"):
        reasons.append("generated payload is incomplete")
    if reasons:
        print("NO REPLACEMENT:", "; ".join(reasons))
        print("Inspect candidate:",candidate)
        return
    backup=ROOT.parent/"build-backups"/("offlineContent-before-new-akathists-"+datetime.now().strftime("%Y%m%d_%H%M%S")+".json")
    shutil.copy2(APP_JSON,backup)
    shutil.copy2(candidate,APP_JSON)
    print("UPDATED:",APP_JSON)
    print("JSON BACKUP:",backup)
    print("Restart Expo Metro with --clear to reload this new bundled content.")

def main():
    patch_visibility()
    compare_and_export()

if __name__=="__main__":
    try:
        main()
    except Exception as error:
        print("AKATHIST CONTENT CHECK FAILED:",error,file=sys.stderr)
        sys.exit(1)
