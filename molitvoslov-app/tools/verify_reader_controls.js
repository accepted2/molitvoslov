#!/usr/bin/env node
// Static regression guard for reader appearance preview, sticky language picker,
// and position-preserving switches. Read-only; never mutates user preferences.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const babel = require('@babel/parser');

const root = path.resolve(__dirname, '..');
const files = [
  'src/components/reader/ReaderAppearanceSheet.js',
  'src/components/reader/ReaderBookmarkMenu.js',
  'src/components/navigation/FixedSectionHeader.js',
  'src/components/reader/SelectableDocumentReader.js',
  'src/components/reader/PrayerRuleReader.js',
  'src/components/reader/selectableDocumentReader/runtime.js',
  'src/screens/PrayerRuleScreen.js',
  'src/screens/ReaderScreen.js',
  'src/screens/BookScreen.js',
  'src/screens/AkathistScreen.js',
  'src/screens/CanonScreen.js',
  'src/screens/KathismaScreen.js',
];
const required = {
  'src/components/reader/ReaderAppearanceSheet.js': [
    'sliderPreviewOpacity', 'sliderDragging', 'sheetBackground', 'settingsBlock',
    'setSliderPreview(true)', 'onResponderGrant', 'onResponderRelease', 'onResponderTerminate',
  ],
  'src/components/navigation/FixedSectionHeader.js': [
    'languageSwitcher', 'onLanguageChange', 'languageDropdown', 'menuButtonReading',
    'headerHidden = readingHidden && !languageOpen', 'visible={languageOpen}',
    'name="chevron-down"', 'name="chevron-back"', 'name="ellipsis-vertical"',
  ],
  'src/components/reader/SelectableDocumentReader.js': [
    'languageProgressRef', 'snapshotForViewSwitch', // runtime below owns snapshot
    'applyReaderAppearance', 'changeViewMode',
  ],
  'src/components/reader/PrayerRuleReader.js': [
    'getProgressSnapshot()', 'changeViewMode:', 'useImperativeHandle', 'applyReaderAppearance',
  ],
  'src/components/reader/selectableDocumentReader/runtime.js': [
    'snapshotForViewSwitch', 'changeViewMode:', "type: 'view-mode'",
  ],
  'src/components/reader/ReaderBookmarkMenu.js': [
    'appearanceRequested', 'ReaderAppearanceSheet', 'onAppearanceChange',
  ],
};
for (const file of ['src/screens/PrayerRuleScreen.js', 'src/screens/ReaderScreen.js',
                    'src/screens/BookScreen.js', 'src/screens/AkathistScreen.js',
                    'src/screens/CanonScreen.js', 'src/screens/KathismaScreen.js']) {
  required[file] = ['useScopedReaderAppearance', 'languageSwitcher=', 'onLanguageChange='];
}
// Runtime method lives in the WebView string, not the native wrapper.
required['src/components/reader/SelectableDocumentReader.js'] =
  ['languageProgressRef', 'applyReaderAppearance', 'changeViewMode', 'switchingLanguage'];

let count = 0;
for (const relative of files) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  babel.parse(source, {sourceType: 'module', plugins: ['jsx']});
  for (const expected of required[relative] || []) {
    if (!source.includes(expected)) throw new Error(relative + ' missing: ' + expected);
  }
  if (relative.endsWith('/FixedSectionHeader.js')) {
    if (source.includes('if (readingHidden) setLanguageOpen(false)') ||
        source.includes('visible={languageOpen && !readingHidden}')) {
      throw new Error('The language dropdown must stay open while reading chrome hides');
    }
  }
  if (relative.endsWith('/ReaderAppearanceSheet.js')) {
    if (source.includes('styles.sheet, {opacity: sliderPreviewOpacity')) {
      throw new Error('Animating the entire appearance sheet hides the active slider');
    }
    if (!source.includes('style={styles.track}') ||
        !source.includes('styles.sheetBackground, {opacity: sliderPreviewOpacity}')) {
      throw new Error('Only the appearance background and other controls should fade');
    }
  }
  if (relative.endsWith('/PrayerRuleReader.js')) {
    const startMarker = 'const HTML_TEMPLATE = String.raw' + String.fromCharCode(96);
    const start = source.indexOf(startMarker);
    const scriptStart = source.indexOf('<script>', start) + '<script>'.length;
    const scriptEnd = source.indexOf('</script>', scriptStart);
    if (start < 0 || scriptStart < '<script>'.length || scriptEnd < scriptStart) {
      throw new Error('Cannot extract prayer-rule inline WebView script');
    }
    new vm.Script(source.slice(scriptStart, scriptEnd), {filename: relative + ':inline'});
  }
  if (relative.endsWith('/runtime.js')) {
    const prefix = 'export const READER_RUNTIME = String.raw' + String.fromCharCode(96);
    const lastTick = source.lastIndexOf(String.fromCharCode(96) + ';');
    if (!source.startsWith(prefix) || lastTick < prefix.length) {
      throw new Error('Cannot extract reader WebView runtime for syntax test');
    }
    const runtime = source.slice(prefix.length, lastTick);
    new vm.Script('(function(){' + runtime + String.fromCharCode(10) + '})();', {
      filename: relative + ':inline',
    });
  }
  console.log('PASS', relative);
  count += 1;
}
console.log('READER CONTROLS VERIFIED:', count, 'files');
