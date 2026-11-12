#!/usr/bin/env node
'use strict';
// From molitvoslov-app: node tools/test_hours_catalog.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (relativePath) =>
  fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

const catalogSource = read('src/data/hoursCatalog.js');
const {HOURS_GROUPS, HOURS_ENTRIES, getHoursEntry} = new Function(
  catalogSource.replace(/\bexport const /g, 'const ') +
  '\nreturn {HOURS_GROUPS, HOURS_ENTRIES, getHoursEntry};'
)();

assert.equal(HOURS_GROUPS.length, 7, 'Seven worship-service groupings');
assert.deepEqual(
  HOURS_GROUPS.map((group) => group.items.length),
  [4, 4, 4, 4, 4, 1, 4],
  'Four ordinary, four Lenten, three sets of four Royal, one Paschal, four interhours'
);
assert.equal(HOURS_ENTRIES.length, 25, 'All 25 service entries must be navigable');
assert.equal(new Set(HOURS_ENTRIES.map((entry) => entry.id)).size, 25);
assert.equal(new Set(HOURS_GROUPS.map((group) => group.id)).size, 7);
assert.equal(new Set(HOURS_ENTRIES.map((entry) => entry.sourceUrl)).size, 13);

for (const entry of HOURS_ENTRIES) {
  assert.ok(entry.id && entry.title && entry.source && entry.sourceUrl, 'Incomplete hours entry');
  assert.match(entry.sourceUrl, /^https:\/\/azbyka\.ru\//);
  assert.equal(getHoursEntry(entry.id)?.id, entry.id, 'Reader must resolve every entry');
}
assert.equal(getHoursEntry('not-a-real-hour'), null);
assert.ok(HOURS_ENTRIES.some((entry) => entry.id === 'paschal-hours'));
assert.ok(HOURS_ENTRIES.some((entry) => entry.id === 'interhour-9'));
assert.equal(
  getHoursEntry('interhour-9').sourceUrl,
  'https://azbyka.ru/bogosluzhenie/cu/mezhdochasie-devyatogo-chasa/'
);

const menu = read('src/screens/MenuScreen.js');
const navigation = read('src/navigation/AppNavigator.js');
const list = read('src/screens/HoursScreen.js');
const reader = read('src/screens/HoursReadingScreen.js');

assert.match(menu, /navigation\.navigate\('Hours'\)/);
assert.match(navigation, /name="Hours"\s+component=\{HoursScreen\}/);
assert.match(navigation, /name="HoursReading"\s+component=\{HoursReadingScreen\}/);
assert.match(list, /HOURS_GROUPS\.map/);
assert.match(list, /navigation\.navigate\('HoursReading', \{entryId: item\.id\}\)/);
assert.match(list, /офлайн-тексты пока не импортированы/);
assert.match(reader, /<WebView/);
assert.match(reader, /source=\{\{uri: entry\.sourceUrl\}\}/);
assert.match(reader, /getHoursEntry\(route\.params\?\.entryId\)/);
assert.match(reader, /Linking\.openURL\(entry\.sourceUrl\)/);
assert.match(reader, /injectJavaScript\(headingScript\)/);

console.log('PASS: 25 Orthodox Hours entries, seven groups, 13 sources, navigation and in-app reader');
