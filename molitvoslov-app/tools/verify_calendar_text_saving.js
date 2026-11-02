#!/usr/bin/env node
/* Verify calendar and personal-prayer text saving code after applying local patch. */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const parser = require('@babel/parser');
const files = [
  'src/components/reader/CalendarSaveText.js',
  'src/screens/ChurchCalendarScreen.js',
  'src/screens/SaintDetailScreen.js',
  'src/screens/PrayerBookReaderScreen.js',
  'src/screens/FavoritesScreen.js',
  'src/components/reader/SelectableSaveText.js',
  'src/context/TextSelectionContext.js',
  'src/services/savedItems.js',
];
let failures = 0;
for (const file of files) {
  try {
    const filename = path.resolve(root, file);
    const src = fs.readFileSync(filename, 'utf8');
    const program = parser.parse(src, {sourceType: 'module', plugins: ['jsx']});
    for (const item of program.program.body) {
      if (item.type !== 'ImportDeclaration') continue;
      if (!item.source.value.startsWith('.')) continue;
      const resolved = path.resolve(path.dirname(filename), item.source.value);
      if (!['.js', '.jsx', '/index.js'].some(suffix => fs.existsSync(resolved+suffix)) && !fs.existsSync(resolved))
        throw new Error('Missing relative import ' + item.source.value);
    }
    console.log('PASS', file);
  } catch (error) {
    console.error('FAIL', file, error.message);
    failures++;
  }
}
const mustHave = {
  'src/screens/ChurchCalendarScreen.js': [
    'CalendarSaveWholeButton', 'CalendarSelectableBody', 'section="life"', 'section="troparion"', 'section="kontakion"',
  ],
  'src/screens/SaintDetailScreen.js': [
    'CalendarSaveWholeButton', 'CalendarSelectableBody', 'section="life"', 'section="troparion"', 'section="kontakion"',
  ],
  'src/screens/PrayerBookReaderScreen.js': [
    'sourceType="personal_prayer"', 'SelectableSaveText', 'metadata={{',
  ],
  'src/screens/FavoritesScreen.js': [
    "item.source_type === 'calendar'", "item.source_type === 'personal_prayer'", "navigation.push('SaintDetail'",
  ],
};
for (const [file, strings] of Object.entries(mustHave)) {
  const s = fs.readFileSync(path.resolve(root,file),'utf8');
  for (const text of strings) if (!s.includes(text)) { failures++; console.error('FAIL missing:',file,text); }
}
if (failures) {
  console.error('Calendar saving verification failed:',failures);
  process.exit(1);
}
console.log('CALENDAR AND PERSONAL-PRAYER SAVING SYNTAX VERIFIED');
