#!/usr/bin/env node
// Static guard for the public-content-in-APK policy.
// Does not mutate app files, SQLite or any user record.
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const root = path.resolve(__dirname, '..');

const checks = [
  ['App.js', [
    'PUBLIC_CONTENT_BUNDLED_ONLY_V1',
  ]],
  ['src/services/contentStore.js', [
    'PUBLIC_CONTENT_BUNDLED_ONLY_V1',
    'activateContent(bundledContent, bundledVersion, {notify: false})',
    'db.withExclusiveTransactionAsync',
  ]],
  ['src/services/bibleStore.js', [
    'BIBLE_CONTENT_BUNDLED_ONLY_V1',
    'activateBibleContent(bundledBible',
  ]],
  ['src/services/calendarOfflineStore.js', [
    'CALENDAR_BUNDLED_ONLY_V1',
    'getBundledCalendarDay(date, language)',
    'getBundledCalendarMonth(year, month, language)',
  ]],
  ['src/services/contentApi.js', [
    'AKATHIST_PUBLISHED_ONLY_V1',
    'PUBLIC_RULES_BUNDLED_BY_DEFAULT_V1',
    "process.env.EXPO_PUBLIC_PRAYER_RULES_SOURCE === 'django'",
    'item.is_visible === true',
  ]],
  ['src/screens/SearchScreen.js', [
    "import searchSeedBuild from '../data/searchSeedBuild.json';",
    'databaseName={searchSeedBuild.database_name}',
  ]],
  ['scripts/copy-search-seed.js', [
    'SEARCH_SEED_METRO_ONLY_V1',
    'cleanupFs.unlinkSync(nativeSeed)',
  ]],
];

try {
  for (const [name, tokens] of checks) {
    const source = fs.readFileSync(path.join(root, name), 'utf8');
    parser.parse(source, {sourceType: 'module', plugins: ['jsx']});
    for (const token of tokens) {
      if (!source.includes(token)) throw new Error(name + ' is missing: ' + token);
    }
    if (name === 'App.js' &&
        (source.includes("import {syncContentDeltas}") || source.includes("syncContentDeltas()"))) {
      throw new Error('App still fetches public OTA deltas');
    }
    if (name === 'scripts/copy-search-seed.js') {
      const postcondition = source.split('// SEARCH_SEED_METRO_ONLY_V1').slice(-1)[0];
      if (!postcondition || !postcondition.includes('cleanupFs.unlinkSync(nativeSeed)') ||
          !postcondition.includes('hash(sourceSeed) !== hash(nativeSeed)') ||
          postcondition.includes('fs.copyFileSync(src, dest)')) {
        throw new Error('Search seed cleanup must verify a byte-identical duplicate before deletion');
      }
    }
    if (name === 'src/services/contentStore.js') {
      const hydrate = source.split('export const hydratePublicContent = async')[1]
        ?.split('export const saveSyncedPublicContent = async')[0];
      if (!hydrate || hydrate.includes('if (__DEV__)') ||
          hydrate.includes('activateContent(parsed')) {
        throw new Error('Public hydration still depends on device cache or dev mode');
      }
    }
    if (name === 'src/services/bibleStore.js') {
      const hydrate = source.split('export const hydrateBibleContent = async')[1]
        ?.split('export const saveSyncedBibleContent = async')[0];
      if (!hydrate || hydrate.includes('SELECT version, payload')) {
        throw new Error('Bible hydration still reads old OTA cache');
      }
    }
    if (name === 'src/services/calendarOfflineStore.js') {
      const offline = source.split('// CALENDAR_BUNDLED_ONLY_V1')[1]
        ?.split('export const storeCalendarDay = async')[0];
      if (!offline || offline.includes('storedByDate') || offline.includes('getStoredCalendarDay(')) {
        throw new Error('Calendar offline reader still uses stale OTA or AsyncStorage');
      }
    }
    console.log('PASS', name);
  }
  const manifest = JSON.parse(fs.readFileSync(
    path.join(root, 'src/data/searchSeedBuild.json'), 'utf8'));
  if (manifest.schema_version !== 1 ||
      !/^molitvoslov_search_v10_[A-Za-z0-9]+\.db$/.test(manifest.database_name)) {
    throw new Error('Missing or invalid search seed bundle manifest');
  }
  const release = fs.readFileSync(path.join(root, 'tools/build_release_1_0_20.ps1'), 'utf8');
  if (!release.includes('prepare_offline_apk.py') ||
      !release.includes('Offline APK verification')) {
    throw new Error('Release build does not enforce offline content preflight');
  }
  console.log('PASS versioned search manifest and guarded release builder');
  console.log('APK-ONLY PUBLIC CONTENT SOURCE VERIFIED');
} catch (e) {
  console.error('APK-ONLY CONTENT VERIFICATION FAILED:', e.message || e);
  process.exitCode = 1;
}
