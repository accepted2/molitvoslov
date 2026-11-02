#!/usr/bin/env python3
"""Apply narrow Expo SQLite FTS teardown workaround to local SearchScreen.

Changes only SQLiteProvider options. Requires real local provider binding.
Keeps a backup and leaves existing personal/search data unchanged.
"""
from pathlib import Path
from datetime import datetime
import shutil
import sys
import re

def main():
    root=Path(__file__).resolve().parents[1]
    target=root/"src/screens/SearchScreen.js"
    src=target.read_text(encoding="utf-8-sig")
    if "finalizeUnusedStatementsBeforeClosing" in src:
        print("ALREADY PATCHED: SQLiteProvider FTS teardown workaround")
        return 0
    pattern=r'(?m)^(\s*databaseName=\{searchSeedMeta\.dbName\}\s*\n)'
    matches=list(re.finditer(pattern,src))
    if len(matches)!=1 or src.count("<SQLiteProvider")!=1:
        raise RuntimeError("Cannot uniquely identify the local SearchScreen SQLiteProvider; no files modified")
    after=src[matches[0].end():]
    if "assetSource=" not in after.split("</SQLiteProvider>",1)[0]:
        raise RuntimeError("Expected bundled search SQLite assetSource not found; no files modified")
    line=matches[0].group(1)
    indent=re.match(r"\s*",line).group(0).replace("\n","")
    replacement=line+indent+"options={{finalizeUnusedStatementsBeforeClosing: false}}\n"
    updated=src[:matches[0].start()]+replacement+src[matches[0].end():]
    backup=root.parent/"build-backups"/("sqlite-crash-fix-"+datetime.now().strftime("%Y%m%d_%H%M%S"))
    backup.mkdir(parents=True,exist_ok=False)
    shutil.copy2(target,backup/target.name)
    target.write_text(updated,encoding="utf-8")
    print("PATCHED:",target)
    print("BACKUP:",backup)
    print("Provider option: finalizeUnusedStatementsBeforeClosing=false")
    return 0

if __name__=="__main__":
    try:sys.exit(main())
    except Exception as exc:
        print("PATCH FAILED:",exc,file=sys.stderr)
        sys.exit(1)
