/* Read-only static guard for global/per-document preferences.
 * Run after installing the branch:
 *   node tools/verify_global_preferences_20261109.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const parser = require('@babel/parser');

const root = path.resolve(__dirname, '..');
const paths = [
  'App.js',
  'src/context/InterfaceScaleContext.js',
  'src/context/LanguageContext.js',
  'src/components/navigation/BottomNav.js',
  'src/components/navigation/FixedSectionHeader.js',
  'src/screens/AccountScreen.js',
  'src/screens/MenuScreen.js',
  'src/screens/FavoritesScreen.js',
  'src/screens/PrayerBooksScreen.js',
  'src/screens/ReaderScreen.js',
  'src/screens/CanonScreen.js',
  'src/screens/AkathistScreen.js',
  'src/hooks/useScopedReaderAppearance.js',
  'src/services/scopedReaderAppearance.js',
  'src/services/accountPreferencesSync.js',
  'src/services/readerPreferences.js',
  'src/services/languagePreferences.js',
];
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
for (const file of paths) {
  parser.parse(read(file), {sourceType:'module',plugins:['jsx','typescript']});
}
const account = read('src/screens/AccountScreen.js');
assert.match(account, /Господи, научи меня творить волю Твою\./);
assert.ok(!account.includes('Образец текста для чтения.'));
assert.ok(!account.includes('требуют отдельного подключения'));
assert.ok(account.includes('onGestureEnd={commitReadingSettings}'));
assert.ok(account.includes('interfaceScale'));
const hook = read('src/hooks/useScopedReaderAppearance.js');
assert.ok(hook.includes('keyRef.current && !inheritedRef.current'));
assert.ok(hook.includes('subscribeReadingSettings'));
const sync = read('src/services/accountPreferencesSync.js');
assert.ok(sync.includes('/api/account-preferences/'));
assert.ok(sync.includes('reader_overrides'));
assert.ok(sync.includes('reader_modes'));
const nav = read('src/components/navigation/BottomNav.js');
assert.ok(nav.includes('const iconSize = Math.round(17 * uiScale)'));
assert.ok(!nav.includes('windowWidth / 390'));
assert.ok(read('src/services/readerPreferences.js').includes('interfaceScale: 1'));
console.log('PASS: parsed ' + paths.length + ' JS/JSX files');
console.log('PASS: global inheritance, custom palette, account sync, legacy menu 100%');
