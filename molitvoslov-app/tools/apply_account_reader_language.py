#!/usr/bin/env python3
"""Scope previously per-document reader language selections to the cached account.

Preserves old device-local selections by one-time migration and never deletes
the legacy keys. The last backend user is intentionally retained after logout.
"""
from pathlib import Path
from datetime import datetime
import shutil
import sys

root=Path(__file__).resolve().parents[1]
path=root/"src/services/readerPreferences.js"
s=path.read_text(encoding="utf-8-sig")
if "buildLegacyKey" in s and "getCachedBackendUser" in s:
    print("ALREADY PATCHED: language selection keyed by account")
    sys.exit(0)

def replace(old,new):
    global s
    if s.count(old)!=1:
        raise RuntimeError("readerPreferences.js differs from expected: "+old[:100])
    s=s.replace(old,new,1)

replace(
    "import {READER_LANGUAGE_MODES, setDefaultReaderMode} from './readerLanguageModes';",
    "import {READER_LANGUAGE_MODES, setDefaultReaderMode} from './readerLanguageModes';\n"
    "import {getCachedBackendUser} from './backendAuth';"
)
replace("const buildStorageKey = ({sourceType, sourceId}) =>",
        "const buildLegacyKey = ({sourceType, sourceId}) =>")
replace("export const getReaderLanguageModePreference = async",
        """const buildStorageKey = async (scope) => {
  // Last signed-in user remains cached even after sign-out.
  // This avoids losing settings when users sign out and sign back in.
  const user = await getCachedBackendUser().catch(() => null);
  return buildLegacyKey(scope) + ':' + (user?.id ? encodeURIComponent(String(user.id)) : 'guest');
};

export const getReaderLanguageModePreference = async""")
replace(
    "  const storedMode = await AsyncStorage.getItem(buildStorageKey({sourceType, sourceId}));",
    """  const scope = {sourceType, sourceId};
  const key = await buildStorageKey(scope);
  let storedMode = await AsyncStorage.getItem(key);
  if (!SUPPORTED_MODES.has(storedMode)) {
    // Existing devices previously stored a per-rule mode without account ID.
    const legacyMode = await AsyncStorage.getItem(buildLegacyKey(scope));
    if (SUPPORTED_MODES.has(legacyMode)) {
      storedMode = legacyMode;
      await AsyncStorage.setItem(key, legacyMode);
    }
  }""")
replace("await AsyncStorage.setItem(buildStorageKey({sourceType, sourceId}), mode);",
        "await AsyncStorage.setItem(await buildStorageKey({sourceType, sourceId}), mode);")

backup=root.parent/"build-backups"/("account-reader-mode-"+datetime.now().strftime("%Y%m%d_%H%M%S"))
backup.mkdir(parents=True,exist_ok=False)
shutil.copy2(path,backup/path.name)
path.write_text(s,encoding="utf-8")
print("PATCHED:",path)
print("BACKUP:",backup)
