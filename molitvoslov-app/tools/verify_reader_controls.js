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
    'sliderPreviewOpacity', 'onResponderGrant', 'onResponderRelease', 'onResponderTerminate',
  ],
  'src/components/navigation/FixedSectionHeader.js': [
    'languageSwitcher', 'onLanguageChange', 'languageDropdown', 'menuButtonReading',
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
  if (relative.endsWith('/runtime.js')) {
    const matched = /^export const READER_RUNTIME = String\\.raw`([\\s\\S]*)`;\\s*$/.exec(source);
    if (!matched) throw new Error('Cannot extract reader WebView runtime for syntax test');
    new vm.Script('(function(){' + matched[1] + '\\n})();', {filename: relative + ':inline'});
  }
  console.log('PASS', relative);
  count += 1;
}
console.log('READER CONTROLS VERIFIED:', count, 'files');
