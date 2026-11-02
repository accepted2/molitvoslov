#!/usr/bin/env python3
"""Refine existing reader appearance UI without overwriting unrelated local code.

1. Remove the jumping font preview; keep the modal compact.
2. Apply selected text color to normal titles/notes/translations, not liturgical red.
3. Permit two-line reader titles, lift header content 2.5 dp and shield it
   against text underneath while it is visible. The permanent gradient remains.
All anchors are checked before any file is modified. Backups are outside app.
"""
from pathlib import Path
from datetime import datetime
import re
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
changes = {}

def replace_once(source, old, new, name):
    occurrences = source.count(old)
    if occurrences != 1:
        raise RuntimeError(f"{name}: expected one anchor (found {occurrences}): {old[:75]!r}")
    return source.replace(old, new, 1)

def process(relative, method, marker):
    source = (ROOT / relative).read_text(encoding="utf-8-sig")
    if marker in source:
        print("ALREADY PATCHED:", relative)
        return
    updated = method(source, relative)
    if updated == source:
        raise RuntimeError(f"No effective change: {relative}")
    changes[relative] = updated

def refine_sheet(s, name):
    s = replace_once(s,
        '<ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>',
        '<ScrollView style={styles.scrollArea} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>', name)
    s = replace_once(s, "Размер шрифта: {resolved.fontSize} пт",
                     "Размер шрифта: {resolved.fontSize}", name)
    sample = """            <View style={[styles.preview,{backgroundColor:resolved.background}]}>
              <Text style={[styles.previewText,{fontSize:resolved.fontSize,color:resolved.text,lineHeight:resolved.fontSize*1.5}]}>
                Господи, научи меня творить волю Твою.
              </Text>
              <Text style={[styles.caption,{color:resolved.text}]}>Изменения сразу видны в читалке и сохраняются только для этого текста.</Text>
            </View>
"""
    s = replace_once(s, sample, "", name)
    s = replace_once(s,
        "sheet:{maxHeight:'88%',backgroundColor:'#FFF4DE',borderTopLeftRadius:23,borderTopRightRadius:23,paddingHorizontal:18,paddingTop:16},",
        "sheet:{maxHeight:'78%',backgroundColor:'#FFF4DE',borderTopLeftRadius:23,borderTopRightRadius:23,paddingHorizontal:18,paddingTop:16},",name)
    s = replace_once(s,"  scroll:{paddingBottom:20,gap:13},",
        "  scrollArea:{flexGrow:0,flexShrink:1},\n  scroll:{paddingBottom:8,gap:13},",name)
    s = replace_once(s,
        "  preview:{borderRadius:14,padding:15,marginTop:6},\n  previewText:{fontFamily:'serif'},\n  caption:{fontSize:11,marginTop:7,opacity:.75},\n",
        "",name)
    return s

def refine_text_colors(s,name):
    anchor = """  const traditional = isRule ? '.traditional-mode .reader-text' : 'body:not(.book-mode) .reader-language-traditional .reader-text';
  const js = """
    insert = """  const traditional = isRule ? '.traditional-mode .reader-text' : 'body:not(.book-mode) .reader-language-traditional .reader-text';
  // The custom text color covers headings and ordinary explanations.
  // Liturgical invocations, verse numbers, bows and special rubric spans
  // retain their existing dedicated colors.
  const scope = isRule ? '' : 'body:not(.book-mode) ';
  const headingSelector = [
    '.rule-title', '.prayer-title', '.section-title', '.rule-description',
    '.description', '.note', '.instruction', '.reader-label', '.reader-inline-label',
  ].map(name => scope + name).join(',');
  const secondarySelector = isRule
    ? '.translation-text, .section-content'
    : 'body:not(.book-mode) .reader-text.secondary, body:not(.book-mode) .reader-text.akathist-russian, body:not(.book-mode) .section-content';
  const js = """
    s = replace_once(s,anchor,insert,name)
    old = """    traditional + "{font-size:'+s.traditional+'px !important;}';" +"""
    new = """    traditional + "{font-size:'+s.traditional+'px !important;} " +
    headingSelector + "{color:'+s.text+' !important;} " +
    secondarySelector + "{color:'+s.text+' !important;}';" +"""
    s = replace_once(s,old,new,name)
    return s

def refine_header(s,name):
    if "readerModeLabel" not in s or "readerBackground" not in s or "withOpacity" not in s:
        raise RuntimeError("Reader title/gradient patch is missing; apply earlier reader settings first")
    s=replace_once(s,
        "numberOfLines={1}",
        "numberOfLines={compactReading ? 2 : 1}",name)
    s=replace_once(s,
        "  titleReading: {\n    fontSize: 17,\n    fontWeight: '700',\n    lineHeight: 23,",
        "  titleReading: {\n    fontSize: 17,\n    fontWeight: '700',\n    lineHeight: 20,",name)
    # The independent-gradient patch indents the Animated.View subtree by
    # two more spaces. Match the existing whitespace rather than assuming it.
    header_size = re.compile(r'(?m)^([ \t]*)height: headerHeight,\n\1paddingTop: topInset,')
    if len(header_size.findall(s)) != 1:
        raise RuntimeError(f"{name}: could not uniquely find header size/padding")
    s = header_size.sub(
        lambda m: m.group(1) + "height: headerHeight,\n" +
                  m.group(1) + "paddingTop: topInset,\n" +
                  m.group(1) + "transform: [{translateY: compactReading ? -2.5 : 0}],",
        s, count=1)

    # Locate exactly one main header View, independently of indentation from
    # the previous local-only fixed-gradient patch.
    candidates=list(re.finditer(
        r'(?m)^(?P<indent>[ \t]*)<View\n[ \t]*pointerEvents="box-none"',
        s))
    if len(candidates)!=1:
        raise RuntimeError(f"{name}: expected one header content View, got {len(candidates)}")
    m=candidates[0]
    indent=m.group('indent')
    shield = (
        indent + "{compactReading && (\n" +
        indent + "  <LinearGradient\n" +
        indent + "    pointerEvents=\"none\"\n" +
        indent + "    colors={[\n" +
        indent + "      withOpacity(readerBackground || (dark ? '#171310' : '#FFF4DE'), 0.99),\n" +
        indent + "      withOpacity(readerBackground || (dark ? '#171310' : '#FFF4DE'), 0.96),\n" +
        indent + "      withOpacity(readerBackground || (dark ? '#171310' : '#FFF4DE'), 0),\n" +
        indent + "    ]}\n" +
        indent + "    locations={[0, 0.75, 1]}\n" +
        indent + "    style={[styles.readingHeaderShield, {height: headerHeight + 18}]}\n" +
        indent + "  />\n" +
        indent + ")}\n\n")
    s=s[:m.start()]+shield+s[m.start():]
    s=replace_once(s,"  fixedHeader: {",
        """  readingHeaderShield: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  fixedHeader: {""",name)
    return s

process("src/components/reader/ReaderAppearanceSheet.js",refine_sheet,"scrollArea:{flexGrow:0,flexShrink:1}")
process("src/services/scopedReaderAppearance.js",refine_text_colors,"const headingSelector = [")
process("src/components/navigation/FixedSectionHeader.js",refine_header,"readingHeaderShield:")

if not changes:
    print("All appearance refinements already applied")
    sys.exit(0)

backup = ROOT.parent / "build-backups" / ("reader-refinements-" + datetime.now().strftime("%Y%m%d_%H%M%S"))
backup.mkdir(parents=True,exist_ok=False)
for relative,content in changes.items():
    target=backup/relative
    target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(ROOT/relative,target)
for relative,content in changes.items():
    (ROOT/relative).write_text(content,encoding="utf-8")
    print("PATCHED:",relative)
print("SOURCE BACKUP:",backup)
print("Check syntax with: node tools/verify_scoped_reader_settings.js")
