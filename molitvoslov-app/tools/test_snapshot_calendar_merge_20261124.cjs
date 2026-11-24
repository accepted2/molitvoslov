#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const parser = require('@babel/parser');
const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

for (const name of [
  'src/screens/ChurchCalendarScreen.js',
  'src/screens/SaintDetailScreen.js',
  'src/services/calendarCardPresentation.js',
  'src/services/calendarCivicDecoder.js',
  'src/services/uocIconSelection.js',
]) {
  const source = read(name);
  parser.parse(source, {sourceType:'module',plugins:['jsx']});
  console.log('SYNTAX OK: ' + name);
}
const day = read('src/screens/ChurchCalendarScreen.js');
const saint = read('src/screens/SaintDetailScreen.js');
const service = read('src/services/churchCalendar.js');
const icon = read('src/data/calendarIconAssets.js');
for (const [name, screen] of [['Day',day],['Saint',saint]]) {
  assert.match(screen, /cardHymns\.sections\.map\(/,name+': multiple hymn sections not rendered');
  assert.match(screen, /getCalendarCardHymns\(/,name+': canonical hymn selection missing');
  assert.match(screen, /selectUocIcon\(/,name+': curated icon selection missing');
  assert.match(screen, /getBundledCalendarIconSource\(/,name+': offline icon fallback was lost');
  assert.match(screen, /CalendarSaveWholeButton/,name+': old save/share action was lost');
  assert.match(screen, /shareContent\(/,name+': old content sharing was lost');
}
assert.match(day, /useCalendarTodayRollover/, 'Local day rollover was lost');
assert.match(day, /displayCalendarNumber/, 'Traditional calendar numbers were lost');
assert.match(saint, /focusSection/, 'Deep link section highlighting was lost');
assert.match(saint, /findSaintForSharedLink/, 'Shared card recovery was lost');
assert.match(saint, /CalendarCleanupPreviewPanel/, 'Calendar editorial preview was lost');
assert.match(service, /Release-only calendar/, 'Offline-release calendar mode was lost');
assert.match(icon, /require\(/, 'Bundled icon table was overwritten');
assert.ok(icon.length > 100000, 'Original full-sized bundled icon table must be retained');
console.log('PASS: Snapshot UI features, read/save/share, local calendar and offline icons preserved.');
