#!/usr/bin/env python3
"""Give calendar saved sections the same heart and warm saved effect as prayer readers.

Run after tools/install_calendar_text_saving.ps1 has successfully installed its
previous calendar patch. No screen files are reset from GitHub. Both screens are
validated entirely before writing, and originals are backed up outside app.
"""
from datetime import datetime
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
updates = {}

def replace_one(value, before, after, path):
    count = value.count(before)
    if count != 1:
        raise RuntimeError(f"{path}: expected exactly one anchor, found {count}: {before[:100]!r}")
    return value.replace(before, after, 1)

def calendar(source, path):
    if "CalendarSaveWholeButton" not in source or "CalendarSelectableBody" not in source:
        raise RuntimeError(f"{path}: the previous calendar selection patch must be applied first")

    source = replace_one(source,
      "  const [expanded, setExpanded] = useState(false);\n  const {height: windowHeight} = useWindowDimensions();",
      "  const [expanded, setExpanded] = useState(false);\n  const [wholeSaved, setWholeSaved] = useState(false);\n  const {height: windowHeight} = useWindowDimensions();", path)
    source = replace_one(source,
      "    <View style={styles.textBlock}>\n      <Pressable",
      "    <View style={[styles.textBlock, wholeSaved && styles.calendarSavedBlock]}>\n      <Pressable", path)
    source = replace_one(source,
      "<CalendarSaveWholeButton text={text} saveContext={saveContext} />",
      "<CalendarSaveWholeButton text={text} saveContext={saveContext} onSavedChange={setWholeSaved} />", path)
    source = replace_one(source,
      "<View style={styles.calendarLifeInset}>",
      "<View style={[styles.calendarLifeInset, wholeSaved && styles.calendarSavedContent]}>", path)
    source = replace_one(source,
      '<View style={styles.textBlockContent}>\n              <CalendarSelectableBody',
      '<View style={[styles.textBlockContent, wholeSaved && styles.calendarSavedContent]}>\n              <CalendarSelectableBody', path)

    source = replace_one(source, "  textBlockHeader: {",
      """  calendarSavedBlock: {
    borderColor: 'rgba(123, 79, 36, 0.36)',
    backgroundColor: '#EAD7B8',
  },
  calendarSavedContent: {
    backgroundColor: 'rgba(194, 145, 73, 0.13)',
  },
  textBlockHeader: {""", path)
    return source

def saint(source,path):
    if "CalendarSaveWholeButton" not in source or "CalendarSelectableBody" not in source:
        raise RuntimeError(f"{path}: the previous saint selection patch must be applied first")
    source = replace_one(source,
      "  const [open, setOpen] = useState(initialOpen || focusHighlight);",
      "  const [open, setOpen] = useState(initialOpen || focusHighlight);\n  const [wholeSaved, setWholeSaved] = useState(false);",path)
    source = replace_one(source,
      "<View style={[styles.accordion, focusHighlight && styles.accordionFocused]}>",
      "<View style={[styles.accordion, focusHighlight && styles.accordionFocused, wholeSaved && styles.accordionSaved]}>",path)
    source = replace_one(source,
      "<CalendarSaveWholeButton text={text} saveContext={saveContext} />",
      "<CalendarSaveWholeButton text={text} saveContext={saveContext} onSavedChange={setWholeSaved} />",path)
    source = replace_one(source,
      "<View style={styles.expandedWrap}>",
      "<View style={[styles.expandedWrap, wholeSaved && styles.expandedWrapSaved]}>",path)
    source = replace_one(source,
      "<View style={styles.lifeInset}>",
      "<View style={[styles.lifeInset, wholeSaved && styles.lifeInsetSaved]}>",path)
    source = replace_one(source,
      "  accordionFocused: {borderColor: '#A16E35', borderWidth: 2},",
      """  accordionFocused: {borderColor: '#A16E35', borderWidth: 2},
  accordionSaved: {borderColor:'rgba(123, 79, 36, 0.36)'},""",path)
    source = replace_one(source,
      "  readingContent: {paddingHorizontal: 15, paddingTop: 14, paddingBottom: 16},",
      """  expandedWrapSaved: {backgroundColor:'rgba(194, 145, 73, 0.13)'},
  lifeInsetSaved: {backgroundColor:'rgba(194, 145, 73, 0.13)'},
  readingContent: {paddingHorizontal: 15, paddingTop: 14, paddingBottom: 16},""",path)
    return source

for relative, method, marker in (
  ("src/screens/ChurchCalendarScreen.js",calendar,"calendarSavedBlock:"),
  ("src/screens/SaintDetailScreen.js",saint,"accordionSaved:"),
):
    original = (ROOT / relative).read_text(encoding="utf-8-sig")
    if marker in original:
        print("ALREADY PATCHED:",relative)
        continue
    updates[relative] = method(original,relative)

if not updates:
    print("Calendar saved-section styling already applied")
    sys.exit(0)

backup = ROOT.parent / "build-backups" / ("calendar-hearts-" + datetime.now().strftime("%Y%m%d_%H%M%S"))
backup.mkdir(parents=True,exist_ok=False)
for relative, contents in updates.items():
    dest = backup / relative
    dest.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(ROOT / relative,dest)
for relative, contents in updates.items():
    (ROOT / relative).write_text(contents,encoding="utf-8")
    print("PATCHED:",relative)
print("BACKUP:",backup)
print("Check: node tools/verify_calendar_text_saving.js")
