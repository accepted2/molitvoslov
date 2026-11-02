#!/usr/bin/env python3
"""Remove full-section tint from calendar/saint hearts; use draggable WebView selection.

Only makes uniquely verified changes in the locally patched UI. Does not
reset screens or the user's layout. All edits are staged in memory first,
then the originals are backed up before anything is written.
"""
from datetime import datetime
from pathlib import Path
import shutil
import sys

ROOT=Path(__file__).resolve().parents[1]
changes={}

def one(source,old,new,path):
    count=source.count(old)
    if count!=1:
        raise RuntimeError(f"{path}: expected one occurrence, found {count}: {old[:95]!r}")
    return source.replace(old,new,1)

def patch(relative,transformation,marker):
    text=(ROOT/relative).read_text(encoding='utf-8-sig')
    if marker in text:
        print('ALREADY PATCHED:',relative)
        return
    result=transformation(text,relative)
    if result == text:raise RuntimeError('No change in '+relative)
    changes[relative]=result

def calendar(source,p):
    if 'CalendarSelectableBody' not in source:
        raise RuntimeError('Calendar saving integration must be applied first')
    source=one(source,
      '  const [wholeSaved, setWholeSaved] = useState(false);\n','',p)
    source=one(source,
      '<View style={[styles.textBlock, wholeSaved && styles.calendarSavedBlock]}>',
      '<View style={styles.textBlock}>',p)
    source=one(source,
      '<View style={[styles.calendarLifeInset, wholeSaved && styles.calendarSavedContent]}>',
      '<View style={styles.calendarLifeInset}>',p)
    source=one(source,
      '<View style={[styles.textBlockContent, wholeSaved && styles.calendarSavedContent]}>',
      '<View style={styles.textBlockContent}>',p)
    source=one(source,
      '<CalendarSaveWholeButton text={text} saveContext={saveContext} onSavedChange={setWholeSaved} />',
      '<CalendarSaveWholeButton text={text} saveContext={saveContext} />',p)
    source=one(source,
      """  calendarSavedBlock: {
    borderColor: 'rgba(123, 79, 36, 0.18)',
    backgroundColor: '#EAD7B8',
  },
  calendarSavedContent: {
    backgroundColor: 'rgba(161, 110, 53, 0.075)',
  },
""",'',p)
    if 'wholeSaved' in source:
        raise RuntimeError('Calendar still has a full-section saved style')
    return '// calendar selection handles: heart only\n' + source

def saint(source,p):
    if 'CalendarSelectableBody' not in source:
        raise RuntimeError('Saint saving integration must be applied first')
    source=one(source,
      '  const [wholeSaved, setWholeSaved] = useState(false);\n','',p)
    source=one(source,
      '<View style={[styles.accordion, focusHighlight && styles.accordionFocused, wholeSaved && styles.accordionSaved]}>',
      '<View style={[styles.accordion, focusHighlight && styles.accordionFocused]}>',p)
    source=one(source,
      '<View style={[styles.expandedWrap, wholeSaved && styles.expandedWrapSaved]}>',
      '<View style={styles.expandedWrap}>',p)
    source=one(source,
      '<View style={[styles.lifeInset, wholeSaved && styles.lifeInsetSaved]}>',
      '<View style={styles.lifeInset}>',p)
    source=one(source,
      '<CalendarSaveWholeButton text={text} saveContext={saveContext} onSavedChange={setWholeSaved} />',
      '<CalendarSaveWholeButton text={text} saveContext={saveContext} />',p)
    source=one(source,
      "  accordionSaved: {borderColor:'rgba(123, 79, 36, 0.18)'},\n",'',p)
    source=one(source,
      """  expandedWrapSaved: {backgroundColor:'rgba(161, 110, 53, 0.075)'},
  lifeInsetSaved: {backgroundColor:'rgba(161, 110, 53, 0.075)'},
""",'',p)
    if 'wholeSaved' in source:
        raise RuntimeError('Saint still has full-section saved styling')
    return '// saint selection handles: heart only\n' + source

def calendar_save(source,p):
    source=one(source,
      "import SelectableSaveText from './SelectableSaveText';",
      "import CalendarSelectionWebText from './CalendarSelectionWebText';",p)
    source=one(source,
      '    <SelectableSaveText\n      text={normalized}',
      '    <CalendarSelectionWebText\n      text={normalized}',p)
    return source

def selection_classifier(source,p):
    return one(source,
      'const classifySelection = ({text, range, fullSaveType}) => {',
      'export const classifySelection = ({text, range, fullSaveType}) => {',p)

patch('src/screens/ChurchCalendarScreen.js',calendar,'// calendar selection handles: heart only')
patch('src/screens/SaintDetailScreen.js',saint,'// saint selection handles: heart only')
patch('src/components/reader/CalendarSaveText.js',calendar_save,"import CalendarSelectionWebText from './CalendarSelectionWebText';")
patch('src/components/reader/SelectableSaveText.js',selection_classifier,'export const classifySelection = ')

if not changes:
    print('Calendar saved styling and two-handle selection already patched')
    sys.exit(0)

backup=ROOT.parent/'build-backups'/('calendar-selection-handles-'+datetime.now().strftime('%Y%m%d_%H%M%S'))
backup.mkdir(parents=True,exist_ok=False)
for relative,s in changes.items():
    target=backup/relative
    target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(ROOT/relative,target)
for relative,s in changes.items():
    (ROOT/relative).write_text(s,encoding='utf-8')
    print('PATCHED:',relative)
print('BACKUP:',backup)
print('No whole-section highlight: heart state only')
print('Two native-reader-style selection handles now use the WebView selection surface')
