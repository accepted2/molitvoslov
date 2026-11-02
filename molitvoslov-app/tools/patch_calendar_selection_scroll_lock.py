#!/usr/bin/env python3
"""Stop native calendar/saint ScrollViews stealing selection-handle drags.

Run after the existing calendar saved-text and two-handle patches.
Only uniquely matched local code is modified; original screens backed up.
"""
from pathlib import Path
from datetime import datetime
import shutil, sys

ROOT=Path(__file__).resolve().parents[1]
changed={}

def change(s,a,b,p,n=1):
    count=s.count(a)
    if count!=n:
        raise RuntimeError(f"{p}: expected {n} of {a[:90]!r}; found {count}")
    return s.replace(a,b,n)

def calendar(s,p):
    s=change(s,
      "const ExpandableTextBlock = ({title, subtitle, text, life = false, feast, date, section, sourceTitle}) => {",
      "const ExpandableTextBlock = ({title, subtitle, text, life = false, feast, date, section, sourceTitle, onSelectionLockChange}) => {",p)
    s=change(s,
      "  const [expanded, setExpanded] = useState(false);\n  const {height: windowHeight} = useWindowDimensions();",
      """  const [expanded, setExpanded] = useState(false);
  const [selectionLocked, setSelectionLocked] = useState(false);
  const updateSelectionLock = React.useCallback((locked) => {
    setSelectionLocked(Boolean(locked));
    onSelectionLockChange?.(Boolean(locked));
  }, [onSelectionLockChange]);
  const {height: windowHeight} = useWindowDimensions();""",p)
    s=change(s,
      "              scrollEnabled={lifeOverflows}",
      "              scrollEnabled={lifeOverflows && !selectionLocked}",p)
    s=change(s,
      "saveContext={saveContext} textStyle={styles.textBlockParagraph} />",
      "saveContext={saveContext} textStyle={styles.textBlockParagraph} onSelectionLockChange={updateSelectionLock} />",p,2)
    s=change(s,
      "  const [refreshVersion, setRefreshVersion] = useState(0);",
      "  const [refreshVersion, setRefreshVersion] = useState(0);\n  const [calendarSelectionLocked, setCalendarSelectionLocked] = useState(false);",p)
    s=change(s,
      "              sourceTitle={displayTitle(mainFeast, copy)}",
      "              sourceTitle={displayTitle(mainFeast, copy)}\n              onSelectionLockChange={setCalendarSelectionLocked}",p,3)
    s=change(s,
      "      <ScrollView\n        ref={scrollRef}\n        showsVerticalScrollIndicator={false}",
      "      <ScrollView\n        ref={scrollRef}\n        scrollEnabled={!calendarSelectionLocked}\n        showsVerticalScrollIndicator={false}",p)
    return s

def saint(s,p):
    s=change(s,
      "import React, {useEffect, useState} from 'react';",
      "import React, {useCallback, useEffect, useState} from 'react';",p)
    s=change(s,
      "  sourceTitle,\n}) => {",
      "  sourceTitle,\n  onSelectionLockChange,\n}) => {",p)
    s=change(s,
      "  const [open, setOpen] = useState(initialOpen || focusHighlight);",
      """  const [open, setOpen] = useState(initialOpen || focusHighlight);
  const [selectionLocked, setSelectionLocked] = useState(false);
  const updateSelectionLock = useCallback((locked) => {
    setSelectionLocked(Boolean(locked));
    onSelectionLockChange?.(Boolean(locked));
  }, [onSelectionLockChange]);""",p)
    s=change(s,
      "<CalendarSelectableBody text={text} saveContext={saveContext} textStyle={styles.body} />",
      "<CalendarSelectableBody text={text} saveContext={saveContext} textStyle={styles.body} onSelectionLockChange={updateSelectionLock} />",p)
    s=change(s,
      "                  scrollEnabled={hasMoreText}",
      "                  scrollEnabled={hasMoreText && !selectionLocked}",p)
    s=change(s,
      "  const [imageViewerOpen, setImageViewerOpen] = useState(false);",
      "  const [imageViewerOpen, setImageViewerOpen] = useState(false);\n  const [readerSelectionLocked, setReaderSelectionLocked] = useState(false);",p)
    s=change(s,
      "        <Accordion\n",
      "        <Accordion\n          onSelectionLockChange={setReaderSelectionLocked}\n",p,3)
    s=change(s,
      '''{!!prayer && <Accordion title={uk ? 'Молитва' : 'Молитва'} icon="✝" text={prayer}''',
      '''{!!prayer && <Accordion onSelectionLockChange={setReaderSelectionLocked} title={uk ? 'Молитва' : 'Молитва'} icon="✝" text={prayer}''',p)
    s=change(s,
      "      <ScrollView\n        showsVerticalScrollIndicator={false}\n        contentContainerStyle=",
      "      <ScrollView\n        scrollEnabled={!readerSelectionLocked}\n        showsVerticalScrollIndicator={false}\n        contentContainerStyle=",p)
    return s

def shared_component(s,p):
    s=change(s,
      "export const CalendarSelectableBody = ({text, saveContext, textStyle}) => {",
      "export const CalendarSelectableBody = ({text, saveContext, textStyle, onSelectionLockChange}) => {",p)
    s=change(s,
      "      fullSaveType={null}\n",
      "      fullSaveType={null}\n      onSelectionLockChange={onSelectionLockChange}\n",p)
    return s

for p,fn,done in (
    ("src/components/reader/CalendarSaveText.js",shared_component,"onSelectionLockChange={onSelectionLockChange}"),
    ("src/screens/ChurchCalendarScreen.js",calendar,"calendarSelectionLocked"),
    ("src/screens/SaintDetailScreen.js",saint,"readerSelectionLocked"),
):
    original=(ROOT/p).read_text(encoding='utf-8-sig')
    if done in original:
        print("ALREADY PATCHED:",p)
        continue
    if p.endswith('CalendarSaveText.js'):
        if 'CalendarSelectionWebText' not in original:
            raise RuntimeError('Install the two-handle calendar component first')
    elif "CalendarSelectableBody" not in original or not (
        "calendar selection handles: heart only" in original or
        "saint selection handles: heart only" in original
    ):
        raise RuntimeError(f"Missing earlier calendar selection patch: {p}")
    changed[p]=fn(original,p)

if not changed:
    print("Parent ScrollView gesture lock already installed")
    sys.exit(0)
backup=ROOT.parent/'build-backups'/('calendar-scroll-lock-'+datetime.now().strftime('%Y%m%d_%H%M%S'))
backup.mkdir(parents=True,exist_ok=False)
for p in changed:
    dst=backup/p
    dst.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(ROOT/p,dst)
for p,s in changed.items():
    (ROOT/p).write_text(s,encoding='utf-8')
    print("PATCHED:",p)
print("BACKUP:",backup)
print("Parent/nested native scrolling disabled during fragment selection")
