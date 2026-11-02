#!/usr/bin/env python3
"""Move calendar/saint save hearts into their accordion headers and remove doubled padding.

Targets already-patched LOCAL files, preserving user changes and reader selection.
Every expected anchor is validated in memory before any write. Originals are
backed up outside the app. Safe to rerun after completion.
"""
from datetime import datetime
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
UPDATES = {}
MARKER = "CALENDAR_HEADER_HEART_COMPACT_V1"


def once(source, before, after, filename):
    count = source.count(before)
    if count != 1:
        raise RuntimeError(f"{filename}: expected one anchor, found {count}: {before[:95]!r}")
    return source.replace(before, after, 1)


def calendar(source, filename):
    # This is an accordion header with a sibling heart, not nested Pressables.
    source = once(source,
        """    <View style={styles.textBlock}>
      <Pressable
        onPress={() => setExpanded((value) => !value)}
        style={({pressed}) => [styles.textBlockHeader, pressed && styles.pressed]}
      >""",
        """    <View style={styles.textBlock}>
      {/* CALENDAR_HEADER_HEART_COMPACT_V1 */}
      <View style={styles.textBlockHeaderRow}>
        <Pressable
          onPress={() => setExpanded((value) => !value)}
          accessibilityRole="button"
          accessibilityState={{expanded}}
          style={({pressed}) => [styles.textBlockHeader, styles.textBlockHeaderTap, pressed && styles.pressed]}
        >""", filename)
    source = once(source,
        """        <SoftChevron expanded={expanded} />
      </Pressable>

      {expanded && (""",
        """        <SoftChevron expanded={expanded} />
        </Pressable>
        <CalendarSaveWholeButton text={text} saveContext={saveContext} />
      </View>

      {expanded && (""", filename)
    source = once(source,
        """          <View style={styles.textBlockSaveRow}>
            <CalendarSaveWholeButton text={text} saveContext={saveContext} />
          </View>
""", "", filename)
    source = once(source,
        "  textBlockSaveRow: {paddingHorizontal:14,paddingTop:10},\n", "", filename)
    source = once(source,
        "  textBlockHeader: {",
        """  textBlockHeaderRow: {flexDirection:'row',alignItems:'center',paddingRight:9},
  textBlockHeaderTap: {flex:1,minWidth:0,paddingRight:2},
  textBlockHeader: {""", filename)
    source = once(source,
        """  calendarLifeInset: {marginHorizontal: 4, marginTop: 5, marginBottom: 6,""",
        """  calendarLifeInset: {marginHorizontal: 2, marginTop: 2, marginBottom: 5,""", filename)
    source = once(source,
        """  textBlockContent: {
    paddingHorizontal: 16,
    paddingTop: 15,
    paddingBottom: 17,""",
        """  textBlockContent: {
    paddingHorizontal: 6,
    paddingTop: 0,
    paddingBottom: 10,""", filename)
    # Keep the upper fade when scrolling, but not over the very first line.
    source = once(source,
        "  const [lifeOverflows, setLifeOverflows] = useState(false);",
        """  const [lifeOverflows, setLifeOverflows] = useState(false);
  const [lifeScrolled, setLifeScrolled] = useState(false);""", filename)
    source = once(source,
        """              onContentSizeChange={(_width, contentHeight) =>
                setLifeOverflows(contentHeight > lifeViewport + 2)
              }""",
        """              onContentSizeChange={(_width, contentHeight) =>
                setLifeOverflows(contentHeight > lifeViewport + 2)
              }
              onScroll={({nativeEvent}) => setLifeScrolled(nativeEvent.contentOffset.y > 3)}
              scrollEventThrottle={32}""", filename)
    source = once(source,
        "            {lifeOverflows && <LinearGradient pointerEvents=\"none\"\n              colors={['#FFF8EB',",
        "            {lifeOverflows && lifeScrolled && <LinearGradient pointerEvents=\"none\"\n              colors={['#FFF8EB',", filename)
    return source


def saint(source, filename):
    source = once(source,
        """    <View style={[styles.accordion, focusHighlight && styles.accordionFocused]}>
      <Pressable
        onPress={() => setOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{expanded: open}}
        style={styles.accordionHeader}
      >""",
        """    <View style={[styles.accordion, focusHighlight && styles.accordionFocused]}>
      {/* CALENDAR_HEADER_HEART_COMPACT_V1 */}
      <View style={styles.accordionHeaderRow}>
        <Pressable
          onPress={() => setOpen((value) => !value)}
          accessibilityRole="button"
          accessibilityState={{expanded: open}}
          style={[styles.accordionHeader, styles.accordionHeaderTap]}
        >""", filename)
    source = once(source,
        """        <View style={[styles.chevron, open && styles.chevronOpen]} />
      </Pressable>
      {open && (""",
        """        <View style={[styles.chevron, open && styles.chevronOpen]} />
        </Pressable>
        <CalendarSaveWholeButton text={text} saveContext={saveContext} />
      </View>
      {open && (""", filename)
    source = once(source,
        """          <View style={styles.saintSaveRow}>
            <CalendarSaveWholeButton text={text} saveContext={saveContext} />
          </View>
""", "", filename)
    source = once(source,
        "  saintSaveRow: {paddingHorizontal:16,paddingTop:10},\n", "", filename)
    source = once(source,
        "  accordionHeader: {",
        """  accordionHeaderRow: {flexDirection:'row',alignItems:'center',paddingRight:9},
  accordionHeaderTap: {flex:1,minWidth:0,paddingRight:2},
  accordionHeader: {""", filename)
    source = once(source,
        "  readingContent: {paddingHorizontal: 15, paddingTop: 14, paddingBottom: 16},",
        "  readingContent: {paddingHorizontal: 4, paddingTop: 0, paddingBottom: 8},", filename)
    source = once(source,
        "  lifeInset: {marginHorizontal: 5, marginTop: 8, marginBottom: 12,",
        "  lifeInset: {marginHorizontal: 2, marginTop: 4, marginBottom: 8,", filename)
    source = once(source,
        """  lifeScrollContent: {
    paddingHorizontal: 2,
    paddingTop:0,""",
        """  lifeScrollContent: {
    paddingHorizontal: 0,
    paddingTop:0,""", filename)
    return source


def webview(source, filename):
    # Previously applied padding is additive with the native wrapper. The top
    # fade is now hidden at scroll position zero in the calendar life reader.
    source = once(source,
        "  const topInset = isLife ? 38 : 18;",
        "  const topInset = isLife ? 12 : 10;", filename)
    source = once(source,
        "  const sideInset = isLife ? 16 : 14;",
        "  const sideInset = 8;", filename)
    source = once(source,
        "  const bottomInset = 18;",
        "  const bottomInset = 12;", filename)
    source = once(source,
        "  // The life panel has a 30px fixed upper fade. Keep the first line below it.",
        "  // CALENDAR_HEADER_HEART_COMPACT_V1: top fade starts only after scrolling.", filename)
    return source


for relative, transform in (
    ("src/screens/ChurchCalendarScreen.js", calendar),
    ("src/screens/SaintDetailScreen.js", saint),
    ("src/components/reader/CalendarSelectionWebText.js", webview),
):
    file = ROOT / relative
    source = file.read_text(encoding="utf-8-sig")
    if MARKER in source:
        print("ALREADY PATCHED:", relative)
        continue
    if "CalendarSaveWholeButton" not in source and relative.endswith("Screen.js"):
        raise RuntimeError(f"{relative}: earlier calendar-saving patch is missing")
    changed = transform(source, relative)
    if changed == source or MARKER not in changed:
        raise RuntimeError(f"{relative}: incomplete patch")
    UPDATES[relative] = changed

if not UPDATES:
    print("Calendar and saint header hearts + compact spacing already installed")
    sys.exit(0)

backup = ROOT.parent / "build-backups" / ("calendar-compact-header-" + datetime.now().strftime("%Y%m%d_%H%M%S"))
backup.mkdir(parents=True, exist_ok=False)
for relative in UPDATES:
    destination = backup / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ROOT / relative, destination)
for relative, changed in UPDATES.items():
    (ROOT / relative).write_text(changed, encoding="utf-8")
    print("PATCHED:", relative)
print("BACKUP:", backup)
print("Heart button now in accordion header; no extra save row.")
print("Spacing: 8px inner sides, 10-12px inner top; reduced outer padding.")
print("Fade top is visible only after scrolling the life text.")
