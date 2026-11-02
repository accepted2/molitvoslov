#!/usr/bin/env node
// Syntax, imports and invariants for account-scoped reader settings patch.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
let parser;
try {
  parser = require('@babel/parser');
} catch (error) {
  console.error('Missing @babel/parser: run npm install (do not upgrade Expo).');
  process.exit(1);
}
const files = [
  'src/services/scopedReaderAppearance.js',
  'src/hooks/useScopedReaderAppearance.js',
  'src/components/reader/ReaderAppearanceSheet.js',
  'src/services/readerPreferences.js',
  'src/components/navigation/FixedSectionHeader.js',
  'src/components/reader/ReaderBookmarkMenu.js',
  'src/components/reader/SelectableDocumentReader.js',
  'src/components/reader/PrayerRuleReader.js',
  'src/screens/PrayerRuleScreen.js',
  'src/screens/KathismaScreen.js',
  'src/screens/AkathistScreen.js',
  'src/screens/CanonScreen.js',
  'src/screens/ReaderScreen.js',
];
let failures = 0;
for (const file of files) {
  const full = path.join(root, file);
  try {
    const source = fs.readFileSync(full, 'utf8');
    const ast = parser.parse(source, {
      sourceType: 'unambiguous',
      plugins: ['jsx'],
      allowReturnOutsideFunction: false,
    });
    if (!ast || !ast.program) throw new Error('Empty AST');
    for (const decl of ast.program.body) {
      if (decl.type !== 'ImportDeclaration') continue;
      const p = String(decl.source.value || '');
      if (!p.startsWith('.')) continue;
      const guess = path.resolve(path.dirname(full), p);
      if (!['.js', '.jsx', '.ts', '.tsx', '/index.js'].some(ext => fs.existsSync(guess + ext)) &&
          !fs.existsSync(guess)) {
        throw new Error('Import could not be resolved: ' + p);
      }
    }
    console.log('PASS', file);
  } catch (error) {
    failures++;
    console.error('FAIL', file, String(error.message || error));
  }
}
for (const [file, needle] of [
  ['src/screens/PrayerRuleScreen.js','readerAppearance={appearance}'],
  ['src/screens/KathismaScreen.js','readerMode={viewMode}'],
  ['src/screens/AkathistScreen.js','readerMode={viewMode}'],
  ['src/screens/CanonScreen.js','readerMode={viewMode}'],
  ['src/screens/ReaderScreen.js','readerMode={viewMode}'],
  ['src/services/readerPreferences.js','getCachedBackendUser'],
  ['src/components/reader/ReaderBookmarkMenu.js','onAppearanceOpen'],
]) {
  if (!fs.readFileSync(path.join(root, file), 'utf8').includes(needle)) {
    failures++;
    console.error('FAIL invariant:',file,needle);
  }
}
if (failures) {
  console.error('Scoped reader verification failed:', failures);
  process.exit(1);
}
console.log('SCOPED READER SYNTAX AND IMPORTS VERIFIED');
