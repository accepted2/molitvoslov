#!/usr/bin/env python3
"""Integrate account-scoped appearance and per-document language in five readers.

No full-file checkout: source anchors are validated before any write.
Run after apply_reader_presentation.py and after restoring the 3 new JS files.
"""
from pathlib import Path
from datetime import datetime
import shutil
import sys

ROOT=Path(__file__).resolve().parents[1]
changes={}

def change(source,old,new,path):
    if source.count(old)!=1:
        raise RuntimeError(f"{path}: expected one occurrence, got {source.count(old)} of {old[:85]!r}")
    return source.replace(old,new,1)

def shared(source,path,kind,identifier,reader):
    hook="import {useReadingChrome} from '../hooks/useReadingChrome';"
    source=change(source,hook,hook+"""
import {useScopedReaderAppearance} from '../hooks/useScopedReaderAppearance';
import {resolveReaderAppearance, isDarkReaderBackground} from '../services/scopedReaderAppearance';
import {ReaderAppearanceSheet} from '../components/reader/ReaderAppearanceSheet';""",path)
    old="  const {readingChromeHidden, handleReadingScroll} = useReadingChrome();"
    new=old+f"""
  const {{appearance, changeAppearance, resetAppearance}} = useScopedReaderAppearance('{kind}', {identifier});
  const readerBackground = resolveReaderAppearance(appearance).background;
  const [appearanceVisible, setAppearanceVisible] = useState(false);"""
    source=change(source,old,new,path)
    source=change(source,f"      <{reader}\n",f"      <{reader}\n        readerAppearance={{appearance}}\n",path)
    panel="""      <ReaderAppearanceSheet
        visible={appearanceVisible}
        onClose={() => setAppearanceVisible(false)}
        appearance={appearance}
        onChange={changeAppearance}
        onReset={resetAppearance}
      />

"""
    if "      <ReaderBookmarkMenu\n" in source:
        source=change(source,"      <ReaderBookmarkMenu\n",panel+"""      <ReaderBookmarkMenu
        onAppearanceOpen={() => {
          setReaderMenuVisible(false);
          setTimeout(() => setAppearanceVisible(true), 260);
        }}
""",path)
    else:
        source=change(source,"      <FixedSectionHeader\n",panel+"""      <FixedSectionHeader
        showMenu
        onMenuPress={() => setAppearanceVisible(true)}
""",path)
    source=change(source,
        "        compactReading\n        readingHidden={readingChromeHidden}",
        "        compactReading\n        readerMode={viewMode}\n        readerBackground={readerBackground}\n        dark={isDarkReaderBackground(readerBackground)}\n        readingHidden={readingChromeHidden}",path)
    return source

def add_memory(source,path,kind,identifier):
    anchor="import {useReadingChrome} from '../hooks/useReadingChrome';"
    source=change(source,anchor,anchor+
       "\nimport {getReaderLanguageModePreference, saveReaderLanguageModePreference} from '../services/readerPreferences';",path)
    if kind=="kathisma":
        old="""    setViewMode(
      preferred === 'russian' ? (hasRussianTranslation ? READER_LANGUAGE_MODES.RUSSIAN : initial) :
      preferred === 'ukrainian' ? (hasUkrainianTranslation ? READER_LANGUAGE_MODES.UKRAINIAN : initial) :
      preferred === 'traditional' ? (hasTraditionalTranslation ? READER_LANGUAGE_MODES.TRADITIONAL : initial) :
      preferred === 'church' ? READER_LANGUAGE_MODES.CHURCH : initial
    );"""
        new="""    const explicitMode =
      preferred === 'russian' ? (hasRussianTranslation ? READER_LANGUAGE_MODES.RUSSIAN : initial) :
      preferred === 'traditional' ? (hasTraditionalTranslation ? READER_LANGUAGE_MODES.TRADITIONAL : initial) :
      preferred === 'church' ? READER_LANGUAGE_MODES.CHURCH : null;
    let active = true;
    if (explicitMode) {
      setViewMode(explicitMode);
    } else {
      getReaderLanguageModePreference({sourceType:'kathisma',sourceId:String(kathisma.number)})
        .then((mode) => {
          if (!active) return;
          setViewMode(
            mode === READER_LANGUAGE_MODES.TRADITIONAL && !hasTraditionalTranslation ? initial :
            mode === READER_LANGUAGE_MODES.RUSSIAN && !hasRussianTranslation ? initial :
            mode === READER_LANGUAGE_MODES.BOTH && !hasRussianTranslation ? initial :
            [READER_LANGUAGE_MODES.CHURCH,READER_LANGUAGE_MODES.RUSSIAN,READER_LANGUAGE_MODES.BOTH,READER_LANGUAGE_MODES.TRADITIONAL].includes(mode)
              ? mode : initial
          );
        }).catch(() => {if(active) setViewMode(initial);});
    }
    return () => {active = false;};"""
    else:
        old="""    setViewMode(nextMode);
  }, ["""
        new="""    let active = true;
    if (preferred) {
      setViewMode(nextMode);
    } else {
      getReaderLanguageModePreference({sourceType:'KIND',sourceId:String(SOURCEID)})
        .then((mode) => {
          if (!active) return;
          setViewMode(
            mode === READER_LANGUAGE_MODES.TRADITIONAL && !hasTraditionalTranslation ? nextMode :
            mode === READER_LANGUAGE_MODES.RUSSIAN && !hasRussianTranslation ? nextMode :
            mode === READER_LANGUAGE_MODES.BOTH && !hasRussianTranslation ? nextMode :
            [READER_LANGUAGE_MODES.CHURCH,READER_LANGUAGE_MODES.RUSSIAN,READER_LANGUAGE_MODES.BOTH,READER_LANGUAGE_MODES.TRADITIONAL].includes(mode)
              ? mode : nextMode
          );
        }).catch(() => {if(active) setViewMode(nextMode);});
    }
    return () => {active = false;};
  }, ["""
        new=new.replace("KIND",kind).replace("SOURCEID",identifier)
    source=change(source,old,new,path)
    original="        onViewModeChange={setViewMode}"
    replacement="""        onViewModeChange={(nextMode) => {
          setViewMode(nextMode);
          saveReaderLanguageModePreference({sourceType:'KIND',sourceId:String(SOURCEID),mode:nextMode})
            .catch((error) => console.warn('[reader mode] save:',error?.message || error));
        }}""".replace("KIND",kind).replace("SOURCEID",identifier)
    source=change(source,original,replacement,path)
    return source

def patch(path,fn):
    text=(ROOT/path).read_text(encoding="utf-8-sig")
    if "useScopedReaderAppearance" in text:
        print("ALREADY PATCHED:",path)
        return
    changes[path]=fn(text,path)

def prayer(s,p):
    s=shared(s,p,"prayer_rule","slug","PrayerRuleReader")
    return change(s,"focusTarget?.highlightQuery ? MODE_CHURCH : resolveAvailableViewMode(savedMode, {",
                    "resolveAvailableViewMode(savedMode, {",p)

def standard(s,p,kind,ident):
    s=shared(s,p,kind,ident,"SelectableDocumentReader")
    return add_memory(s,p,kind,ident)

patch("src/screens/PrayerRuleScreen.js",prayer)
patch("src/screens/AkathistScreen.js",lambda s,p: standard(s,p,"akathist","akathist?.slug || slug"))
patch("src/screens/CanonScreen.js",lambda s,p: standard(s,p,"canon","canon?.slug || slug"))
patch("src/screens/KathismaScreen.js",lambda s,p: standard(s,p,"kathisma","kathisma?.number || kathismaNumber"))
patch("src/screens/ReaderScreen.js",lambda s,p: standard(s,p,"text","slug"))

if not changes:
    print("Reader screens already patched")
    sys.exit(0)
backup=ROOT.parent/"build-backups"/("reader-screens-"+datetime.now().strftime("%Y%m%d_%H%M%S"))
backup.mkdir(parents=True,exist_ok=False)
for relative,data in changes.items():
    target=backup/relative
    target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(ROOT/relative,target)
for relative,data in changes.items():
    (ROOT/relative).write_text(data,encoding="utf-8")
    print("PATCHED:",relative)
print("BACKUP:",backup)
