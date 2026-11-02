#!/usr/bin/env python3
"""Safely attach calendar hymn/life and personal-prayer saving to local UI.

Edits by unique anchors only. All transforms validated in memory before any
write, with backups outside the application; preserves the user's local fixes.
"""
from pathlib import Path
from datetime import datetime
import shutil
import sys

ROOT=Path(__file__).resolve().parents[1]
updates={}

def once(s, before, after, path):
    n=s.count(before)
    if n != 1:
        raise RuntimeError(f"{path}: expected one occurrence (got {n}): {before[:110]!r}")
    return s.replace(before,after,1)

def patch(path, builder, marker):
    source=(ROOT/path).read_text(encoding="utf-8-sig")
    if marker in source:
        print("ALREADY PATCHED:",path)
        return
    modified=builder(source,path)
    if modified == source: raise RuntimeError(f"{path}: patch had no effect")
    updates[path]=modified

def calendar(s,path):
    s=once(s,"import {colors} from '../theme';",
      "import {colors} from '../theme';\n"
      "import {CalendarSaveWholeButton, CalendarSelectableBody, makeCalendarSaveContext} from '../components/reader/CalendarSaveText';",path)
    s=once(s,
      "const ExpandableTextBlock = ({title, subtitle, text, life = false}) => {",
      "const ExpandableTextBlock = ({title, subtitle, text, life = false, feast, date, section, sourceTitle}) => {",path)
    s=once(s,
      "  if (!text) return null;\n\n  return (\n    <View style={styles.textBlock}>",
      """  if (!text) return null;
  const saveContext = makeCalendarSaveContext({
    feast, date, section, title: sourceTitle, sectionTitle: title,
  });
  return (
    <View style={styles.textBlock}>""",path)
    s=once(s,
      "      {expanded && (life ? (",
      """      {expanded && (
        <>
          <View style={styles.textBlockSaveRow}>
            <CalendarSaveWholeButton text={text} saveContext={saveContext} />
          </View>
          {life ? (""",path)
    s=once(s,
      "              <FormattedCalendarText text={text} />",
      "              <CalendarSelectableBody text={normalizeCalendarText(text)} saveContext={saveContext} textStyle={styles.textBlockParagraph} />",path)
    s=once(s,
      "      ) : <FormattedCalendarText text={text} />)}",
      """          ) : (
            <View style={styles.textBlockContent}>
              <CalendarSelectableBody text={normalizeCalendarText(text)} saveContext={saveContext} textStyle={styles.textBlockParagraph} />
            </View>
          )}
        </>
      )}""",path)
    # each of three calendar main sections: apply contextual source keys
    for name,section in [
        ("title={copy.life}","life"),
        ("title={copy.troparion}","troparion"),
        ("title={copy.kontakion}","kontakion"),
    ]:
        s=once(s,"            <ExpandableTextBlock\n              "+name,
            "            <ExpandableTextBlock\n"
            "              feast={mainFeast}\n"
            "              date={dayData?.date_gregorian || selectedDate}\n"
            f"              section=\"{section}\"\n"
            "              sourceTitle={displayTitle(mainFeast, copy)}\n"
            "              "+name,path)
    s=once(s,"  textBlockContent: {", "  textBlockSaveRow: {paddingHorizontal:14,paddingTop:10},\n  textBlockContent: {",path)
    return s

def saint(s,path):
    s=once(s,
      "import {getOfflineCalendarDay} from '../services/calendarOfflineStore';",
      "import {getOfflineCalendarDay} from '../services/calendarOfflineStore';\n"
      "import {CalendarSaveWholeButton, CalendarSelectableBody, makeCalendarSaveContext} from '../components/reader/CalendarSaveText';",path)
    s=once(s,
      "  height = 320,\n}) => {",
      "  height = 320,\n  feast,\n  date,\n  section,\n  sourceTitle,\n}) => {",path)
    s=once(s,
      "  const paragraphs = String(text).replace(/\\r\\n?/g, '\\n').split(/\\n\\s*\\n/).map((part) => part.trim()).filter(Boolean);",
      """  const saveContext = makeCalendarSaveContext({
    feast, date, section, title: sourceTitle, sectionTitle: title,
  });""",path)
    s=once(s,
      """      {paragraphs.map((paragraph, index) => (
        <Text key={index} selectable style={styles.body}>{paragraph}</Text>
      ))}""",
      """      <CalendarSelectableBody text={text} saveContext={saveContext} textStyle={styles.body} />""",path)
    s=once(s,
      """      {open && (
        <View style={styles.expandedWrap}>
          {innerScroll ? (""",
      """      {open && (
        <View style={styles.expandedWrap}>
          <View style={styles.saintSaveRow}>
            <CalendarSaveWholeButton text={text} saveContext={saveContext} />
          </View>
          {innerScroll ? (""",path)
    # apply props using unique section anchors
    s=once(s,
      '''          title={getStoryHeading(title, uk)}
          icon="life"''',
      '''          title={getStoryHeading(title, uk)}
          feast={resolvedFeast}
          date={date}
          sourceTitle={title}
          section="life"
          icon="life"''',path)
    s=once(s,
      """          title={uk ? 'Тропар' : 'Тропарь'}
          focusHighlight=""",
      """          title={uk ? 'Тропар' : 'Тропарь'}
          feast={resolvedFeast}
          date={date}
          sourceTitle={title}
          section="troparion"
          focusHighlight=""",path)
    s=once(s,
      '''          title="Кондак"
          focusHighlight=''',
      '''          title="Кондак"
          feast={resolvedFeast}
          date={date}
          sourceTitle={title}
          section="kontakion"
          focusHighlight=''',path)
    s=once(s,
      """        {!!prayer && <Accordion title={uk ? 'Молитва' : 'Молитва'} icon="✝" text={prayer} />}""",
      """        {!!prayer && <Accordion title={uk ? 'Молитва' : 'Молитва'} icon="✝" text={prayer}
          feast={resolvedFeast} date={date} sourceTitle={title} section="prayer" />}""",path)
    s=once(s,"  readingContent: {", "  saintSaveRow: {paddingHorizontal:16,paddingTop:10},\n  readingContent: {",path)
    return s

def personal(s,path):
    s=once(s,"import {getPrayerBook} from '../services/prayerBooks';",
        "import {getPrayerBook} from '../services/prayerBooks';\n"
        "import SelectableSaveText from '../components/reader/SelectableSaveText';\n"
        "import {savedSourceId} from '../components/reader/CalendarSaveText';",path)
    s=once(s,
      """                  {!!prayer.text && (
                    <Text style={styles.text} selectable>
                      {prayer.text}
                    </Text>
                  )}""",
      """                  {!!prayer.text && (
                    <SelectableSaveText
                      text={String(prayer.text)}
                      textStyle={styles.text}
                      sourceType="personal_prayer"
                      sourceId={savedSourceId(prayer.sync_id)}
                      anchorType="personal_prayer"
                      anchorId={savedSourceId(prayer.sync_id)}
                      sourceTitle={book?.title || t('prayerBooks.title')}
                      itemTitle={prayer.title || 'Молитва'}
                      metadata={{
                        book_sync_id: bookSyncId,
                        prayer_sync_id: prayer.sync_id,
                      }}
                      fullSaveType="prayer"
                    />
                  )}""",path)
    return s

def favorites(s,path):
    old = """    if (item.source_type === 'daily_quote') {
      navigation.navigate('Menu');
      return;
    }"""
    new = """    if (item.source_type === 'calendar') {
      navigation.push('SaintDetail', {
        date: metadata.date || undefined,
        feastId: metadata.feast_id || undefined,
        feastUid: metadata.feast_uid || undefined,
        feastTitle: metadata.feast_title || item.source_title,
        focusSection: metadata.section || 'life',
      });
      return;
    }

    if (item.source_type === 'personal_prayer' && metadata.book_sync_id) {
      navigation.push('PrayerBookReader', {
        bookSyncId: metadata.book_sync_id,
        prayerSyncId: metadata.prayer_sync_id || null,
      });
      return;
    }

""" + old
    return once(s,old,new,path)

patch("src/screens/ChurchCalendarScreen.js",calendar,"makeCalendarSaveContext")
patch("src/screens/SaintDetailScreen.js",saint,"makeCalendarSaveContext")
patch("src/screens/PrayerBookReaderScreen.js",personal,"sourceType=\"personal_prayer\"")
patch("src/screens/FavoritesScreen.js",favorites,"item.source_type === 'calendar'")

if not updates:
    print("All calendar and personal-prayer saving changes are already present")
    sys.exit(0)

backup=ROOT.parent/"build-backups"/("calendar-selection-"+datetime.now().strftime("%Y%m%d_%H%M%S"))
backup.mkdir(parents=True,exist_ok=False)
for relative,modified in updates.items():
    target=backup/relative
    target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(ROOT/relative,target)
for relative,modified in updates.items():
    (ROOT/relative).write_text(modified,encoding="utf-8")
    print("PATCHED:",relative)
print("SOURCE BACKUP:",backup)
print("Syntax check before building Android APK: node tools/verify_calendar_text_saving.js")
