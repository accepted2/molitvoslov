#!/usr/bin/env node
// Guard against regressions where reusable reader components exist in Git
// but the screens using them were left only in a local stash.
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

const root = path.resolve(__dirname, '..');
const expectations = {
  'src/screens/ChurchCalendarScreen.js': [
    "makeCalendarSaveContext", 'CalendarSaveWholeButton',
    'CalendarSelectableBody', 'onSavedChange={setWholeSaved}',
    'section="life"', 'section="troparion"', 'section="kontakion"',
    'CalendarSelectableBody',
  ],
  'src/screens/SaintDetailScreen.js': [
    "makeCalendarSaveContext", 'CalendarSaveWholeButton',
    'CalendarSelectableBody', 'onSavedChange={setWholeSaved}',
    'section="life"', 'section="troparion"', 'section="kontakion"',
    'CalendarSelectableBody',
  ],
  'src/screens/PrayerBookReaderScreen.js': [
    'SelectableSaveText', 'sourceType="personal_prayer"', 'fullSaveType="prayer"',
  ],
  'src/screens/PrayerBookScreen.js': [
    'searchAllPrayers(', 'existingResultKeys', 'setAddedKeys',
    'onPress={() => onAdd(item)}', 'search_key: result.key',
  ],
  'src/screens/FavoritesScreen.js': [
    "item.source_type === 'calendar'", "item.source_type === 'personal_prayer'",
    "navigation.push('SaintDetail'", "navigation.push('PrayerBookReader'",
  ],
  'src/screens/AkathistListScreen.js': [
    'LocalSearchField', 'filterByTitle(', 'data={visibleRows}', 'ListHeaderComponent',
  ],
  'src/screens/CanonListScreen.js': [
    'LocalSearchField', 'filterByTitle(', 'data={visibleRows}', 'ListHeaderComponent',
  ],
  'src/screens/MiscPrayersScreen.js': [
    'LocalSearchField', 'matchesLocalQuery(', 'data={visibleItems}', 'ListHeaderComponent',
  ],
  'src/screens/TextsListScreen.js': [
    'LocalSearchField', 'filterByTitle(', 'data={visibleTexts}', 'ListHeaderComponent',
  ],
  'src/components/reader/CalendarSaveText.js': [
    'export const CalendarSaveWholeButton', 'export const CalendarSelectableBody',
    "name={saved ? 'heart' : 'heart-o'}", 'onSavedChange',
    '<SelectableDocumentReader', 'embedded',
  ],
  'src/components/search/LocalSearchField.js': [
    'export const LocalSearchField', 'export const filterByTitle',
  ],
};

let errors = 0;
for (const [file, required] of Object.entries(expectations)) {
  try {
    const filename = path.resolve(root, file);
    const source = fs.readFileSync(filename, 'utf8');
    const parsed = parser.parse(source, {sourceType: 'unambiguous', plugins: ['jsx']});
    for (const node of parsed.program.body) {
      if (node.type !== 'ImportDeclaration' || !node.source.value.startsWith('.')) continue;
      const target = path.resolve(path.dirname(filename), node.source.value);
      const resolved = ['', '.js', '.jsx', '/index.js'].some(ext => fs.existsSync(target + ext));
      if (!resolved) throw new Error('Missing import: ' + node.source.value);
    }
    for (const key of required) {
      if (!source.includes(key)) throw new Error('Missing integration: ' + key);
    }
    console.log('PASS', file);
  } catch (error) {
    errors += 1;
    console.error('FAIL', file, error.message);
  }
}

// Heart-only saves must not tint calendar/life content or re-enable TextInput.
for (const file of ['src/screens/ChurchCalendarScreen.js', 'src/screens/SaintDetailScreen.js']) {
  const source = fs.readFileSync(path.resolve(root, file), 'utf8');
  if (/wholeSaved && styles\\.(?:calendarSavedBlock|calendarSavedContent|expandedWrapSaved|lifeInsetSaved|accordionSaved)/.test(source)) {
    errors += 1;
    console.error('FAIL heart-only styling:', file);
  }
}
const calendar = fs.readFileSync(path.resolve(root, 'src/components/reader/CalendarSaveText.js'), 'utf8');
if (calendar.includes('<SelectableSaveText') || !calendar.includes('<SelectableDocumentReader')) {
  errors += 1;
  console.error('FAIL calendar must use read-only WebView selection, not TextInput');
}

if (errors) {
  console.error('RESTORED FEATURES REGRESSION CHECK FAILED:', errors);
  process.exit(1);
}
console.log('CALENDAR HEARTS + PERSONAL SAVES + LIBRARY TITLE SEARCH VERIFIED');
