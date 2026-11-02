#!/usr/bin/env python3
"""Apply reader presentation plumbing safely without replacing local files."""
from pathlib import Path
from datetime import datetime
import shutil
import sys

ROOT=Path(__file__).resolve().parents[1]
changes={}
def replace_one(source, old, new, path):
    if source.count(old)!=1:
        raise RuntimeError(f"{path}: anchor count {source.count(old)} (expected 1): {old[:88]}")
    return source.replace(old,new,1)
def edit(path,fn,already):
    src=(ROOT/path).read_text(encoding="utf-8-sig")
    if already in src:
        print("ALREADY PATCHED:",path)
        return
    changes[path]=fn(src,path)

def header(s,p):
    s=replace_one(s,"import {LinearGradient} from 'expo-linear-gradient';","import {LinearGradient} from 'expo-linear-gradient';\nimport {withOpacity} from '../../services/scopedReaderAppearance';",p)
    s=replace_one(s,"  compactReading = false,","  compactReading = false,\n  readerMode = null,\n  readerBackground = null,",p)
    s=replace_one(s,"  const headerHeight = topInset + (minimal ? 46 : 56);",
        """  const headerHeight = topInset + (minimal ? 46 : 56);
  const readerModeLabel = ({church:'ЦС',russian:'РУС',both:'ЦС + РУС',traditional:'ЦС традиц.'})[readerMode] || '';
  const gradientColors = readerBackground
    ? [readerBackground, withOpacity(readerBackground, 0.76), withOpacity(readerBackground, 0)]
    : dark
      ? ['#171310', 'rgba(23, 19, 16, 0.82)', 'rgba(23, 19, 16, 0)']
      : ['#FFF4DE', 'rgba(255, 244, 222, 0.72)', 'rgba(255, 244, 222, 0)'];""",p)
    old="""          colors={
            dark
              ? ['#171310', 'rgba(23, 19, 16, 0.82)', 'rgba(23, 19, 16, 0)']
              : ['#FFF4DE', 'rgba(255, 244, 222, 0.72)', 'rgba(255, 244, 222, 0)']
          }"""
    s=replace_one(s,old,"          colors={gradientColors}",p)
    old="""              <Text
                style={[styles.title, compactReading && styles.titleReading, dark && styles.titleDark]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {title}
              </Text>"""
    new="""              <View style={styles.readerTitleRow}>
                <Text
                  style={[styles.title, compactReading && styles.titleReading, dark && styles.titleDark, styles.readerTitleFlexible]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {title}
                </Text>
                {!!readerModeLabel && compactReading && (
                  <View style={styles.readerModeChip}>
                    <Text style={[styles.readerModeText, dark && styles.titleDark]}>{readerModeLabel}</Text>
                  </View>
                )}
              </View>"""
    s=replace_one(s,old,new,p)
    return replace_one(s,"  titleWrapReading: {",
        """  readerTitleRow: {flexDirection:'row',alignItems:'center',maxWidth:'100%',gap:6},
  readerTitleFlexible: {flexShrink:1},
  readerModeChip: {borderRadius:7,borderColor:'rgba(128,92,51,0.24)',borderWidth:1,paddingHorizontal:5,paddingVertical:2},
  readerModeText: {fontSize:10,fontWeight:'700',color:'#7A5134'},
  titleWrapReading: {""",p)

def menu(s,p):
    s=replace_one(s,"  onLanguageChange,\n","  onLanguageChange,\n  onAppearanceOpen,\n",p)
    anchor="""          <Pressable
            onPress={openBookmarks}
            style={({pressed}) => [styles.action, pressed && styles.pressed]}
          >"""
    addition="""          {!!onAppearanceOpen && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Оформление чтения"
              onPress={onAppearanceOpen}
              style={({pressed}) => [styles.action, pressed && styles.pressed]}
            >
              <View style={styles.iconWrap}><Text style={styles.icon}>Aa</Text></View>
              <View style={styles.actionTextWrap}>
                <Text style={styles.actionTitle}>Оформление чтения</Text>
                <Text style={styles.actionSubtitle}>Размер шрифта, цвет текста и фон</Text>
              </View>
            </Pressable>
          )}

"""
    return replace_one(s,anchor,addition+anchor,p)

def selectable(s,p):
    s=replace_one(s,
        "import {getReadingSettings, DEFAULT_READING_SETTINGS} from '../../services/readerPreferences';",
        "import {getReadingSettings, DEFAULT_READING_SETTINGS} from '../../services/readerPreferences';\n"
        "import {applyReaderAppearance, resolveReaderAppearance, withOpacity} from '../../services/scopedReaderAppearance';",p)
    s=replace_one(s,"    onReadingScroll,\n  },","    onReadingScroll,\n    readerAppearance = null,\n  },",p)
    s=replace_one(s,"  const webViewRef = useRef(null);",
        """  const webViewRef = useRef(null);
  const localColors = readerAppearance ? resolveReaderAppearance(readerAppearance) : null;
  useEffect(() => {
    if (documentData.readerMode !== 'book' && readerAppearance) {
      applyReaderAppearance(webViewRef.current, readerAppearance);
    }
  }, [readerAppearance, documentData.readerMode]);""",p)
    s=replace_one(s,"          backgroundColor,\n","          backgroundColor: localColors?.background || backgroundColor,\n",p)
    s=replace_one(s,"        onLoadEnd={onReady}",
        """        onLoadEnd={(event) => {
          if (documentData.readerMode !== 'book' && readerAppearance) {
            applyReaderAppearance(webViewRef.current, readerAppearance);
          }
          onReady?.(event);
        }}""",p)
    s=replace_one(s,
        "style={[styles.webView, {backgroundColor: documentData.readerMode === 'book' ? backgroundColor : (readingSettings.palette === 'custom' ? readingSettings.customBackground : (PALETTE_COLORS[readingSettings.palette]?.background || backgroundColor))}]}",
        "style={[styles.webView, {backgroundColor: documentData.readerMode === 'book' ? backgroundColor : (localColors?.background || (readingSettings.palette === 'custom' ? readingSettings.customBackground : (PALETTE_COLORS[readingSettings.palette]?.background || backgroundColor)))}]}",p)
    s=replace_one(s,
        "colors={['rgba(255, 244, 222, 0)', 'rgba(255, 244, 222, 0.72)', '#FFF4DE']}",
        "colors={localColors ? [withOpacity(localColors.background, 0), withOpacity(localColors.background, 0.72), localColors.background] : ['rgba(255, 244, 222, 0)', 'rgba(255, 244, 222, 0.72)', '#FFF4DE']}",p)
    return s

def prayer(s,p):
    s=replace_one(s,
        "import {getReadingSettings, DEFAULT_READING_SETTINGS} from '../../services/readerPreferences';",
        "import {getReadingSettings, DEFAULT_READING_SETTINGS} from '../../services/readerPreferences';\n"
        "import {applyReaderAppearance, resolveReaderAppearance} from '../../services/scopedReaderAppearance';",p)
    s=replace_one(s,"  onReadingScroll,\n}) {","  onReadingScroll,\n  readerAppearance = null,\n}) {",p)
    s=replace_one(s,"  const webViewRef = useRef(null);",
        """  const webViewRef = useRef(null);
  useEffect(() => {
    if (readerAppearance) applyReaderAppearance(webViewRef.current, readerAppearance, true);
  }, [readerAppearance]);""",p)
    s=replace_one(s,
        "  const readerBg = readingSettings.palette === 'custom' ? readingSettings.customBackground : ({night:'#29231F',warm:'#DEBE94',ivory:'#FFFDF3'}[readingSettings.palette] || '#FFF4DE');",
        "  const readerBg = readerAppearance ? resolveReaderAppearance(readerAppearance).background : (readingSettings.palette === 'custom' ? readingSettings.customBackground : ({night:'#29231F',warm:'#DEBE94',ivory:'#FFFDF3'}[readingSettings.palette] || '#FFF4DE'));",p)
    s=replace_one(s,"        onMessage={handleMessage}\n        style={[styles.webView",
        """        onMessage={handleMessage}
        onLoadEnd={() => {
          if (readerAppearance) applyReaderAppearance(webViewRef.current, readerAppearance, true);
        }}
        style={[styles.webView""",p)
    return s

edit("src/components/navigation/FixedSectionHeader.js",header,"readerModeLabel")
edit("src/components/reader/ReaderBookmarkMenu.js",menu,"onAppearanceOpen")
edit("src/components/reader/SelectableDocumentReader.js",selectable,"applyReaderAppearance")
edit("src/components/reader/PrayerRuleReader.js",prayer,"applyReaderAppearance")

if not changes:
    print("All common reader presentation patches already applied")
    sys.exit(0)
backup=ROOT.parent/"build-backups"/("reader-presentation-"+datetime.now().strftime("%Y%m%d_%H%M%S"))
backup.mkdir(parents=True,exist_ok=False)
for relative,contents in changes.items():
    destination=backup/relative
    destination.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(ROOT/relative,destination)
for relative,contents in changes.items():
    (ROOT/relative).write_text(contents,encoding="utf-8")
    print("PATCHED:",relative)
print("BACKUP:",backup)
