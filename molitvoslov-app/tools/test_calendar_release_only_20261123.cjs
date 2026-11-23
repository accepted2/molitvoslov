#!/usr/bin/env node
'use strict';
// Validate the release-only calendar policy after the one-time migration.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const parser = require('@babel/parser');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
function exportedBody(file, name) {
  const source = read(file);
  const ast = parser.parse(source, {sourceType: 'module', plugins: ['jsx']});
  for (const n of ast.program.body) {
    if (n.type !== 'ExportNamedDeclaration') continue;
    if (n.declaration?.type === 'FunctionDeclaration' &&
        n.declaration.id?.name === name) {
      return source.slice(n.declaration.body.start, n.declaration.body.end);
    }
    if (n.declaration?.type !== 'VariableDeclaration') continue;
    for (const d of n.declaration.declarations) {
      if (d.id?.name === name && d.init?.body) {
        return source.slice(d.init.body.start, d.init.body.end);
      }
    }
  }
  throw new Error('Missing exported function: ' + name + ' in ' + file);
}
const service = 'src/services/churchCalendar.js';
const store = 'src/services/calendarOfflineStore.js';
const screen = read('src/screens/ChurchCalendarScreen.js');
assert.match(exportedBody(service, 'getCalendarDay'), /return getBundledCalendarDay\(value, language\)/);
assert.match(exportedBody(service, 'getCalendarMonth'), /return getBundledCalendarMonth\(year, month, language\)/);
assert.match(exportedBody(store, 'getOfflineCalendarDay'), /return getBundledCalendarDay\(date, language\)/);
assert.match(exportedBody(store, 'getOfflineCalendarMonth'), /return getBundledCalendarMonth\(year, month, language\)/);
assert.match(exportedBody(store, 'getStoredCalendarDay'), /return null/);
assert.match(exportedBody(store, 'storeCalendarDay'), /return false/);
assert.match(exportedBody(store, 'storeCalendarMonth'), /return false/);
assert.doesNotMatch(screen, /refreshFromNetwork/);
assert.doesNotMatch(screen, /getCalendarMonth\(visibleYear,\s*visibleMonth/);
assert.doesNotMatch(screen, /getCalendarDay\(selectedDate,/);
for (const year of [2025, 2026, 2027]) {
  for (let month = 1; month <= 12; month += 1) {
    const file = 'src/data/calendar/' + year + '-' + String(month).padStart(2, '0') + '.json';
    assert.ok(fs.existsSync(path.join(root, file)), 'Missing packaged calendar: ' + file);
  }
}
console.log('PASS: bundled calendar is authoritative for day and month');
console.log('PASS: server cache cannot override the installed APK');
console.log('PASS: screen has no HTTP day/month refresh effects');
console.log('PASS: 36 packaged months exist for 2025-2027');
console.log('NOTE: this test checks source policy; on-device smoke test is still needed.');
