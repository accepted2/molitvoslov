#!/usr/bin/env node
'use strict';
// From molitvoslov-app: node tools/test_hours_catalog.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (relative) => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');

const catalog = new Function(
  read('src/data/hoursCatalog.js').replace(/\bexport const /g, 'const ') +
  '\nreturn {HOURS_GROUPS, HOURS_ENTRIES, getHoursEntry};'
)();
const {HOURS_GROUPS, HOURS_ENTRIES, getHoursEntry} = catalog;
assert.equal(HOURS_GROUPS.length, 7);
assert.deepEqual(HOURS_GROUPS.map(group => group.items.length), [4,4,4,4,4,1,4]);
assert.equal(HOURS_ENTRIES.length, 25);
assert.equal(new Set(HOURS_ENTRIES.map(x => x.id)).size, 25);
assert.equal(new Set(HOURS_ENTRIES.map(x => x.sourceId)).size, 25);
assert.ok(HOURS_ENTRIES.every(x => Number.isInteger(x.sourceId)));
assert.equal(getHoursEntry('interhour-9')?.title, 'Междочасие девятого часа');
assert.equal(getHoursEntry('missing'), null);

const data = JSON.parse(read('src/data/hoursTexts.json'));
assert.equal(data.version, 1);
assert.ok(data.entries && typeof data.entries === 'object');
const MODE = {CHURCH:'church', RUSSIAN:'russian', BOTH:'both', TRADITIONAL:'traditional'};
const options = ({hasChurch,hasRussian,hasTraditional}) => [
  ...(hasChurch ? [{key:'church'}] : []),
  ...(hasRussian ? [{key:'russian'}, {key:'both'}] : []),
  ...(hasTraditional ? [{key:'traditional'}] : []),
];
const code = read('src/services/hoursDocument.js')
  .replace(/^import .*;\s*$/gm, '')
  .replace(/\bexport const /g, 'const ');
const fn = new Function('hoursTexts', 'READER_LANGUAGE_MODES', 'buildReaderLanguageOptions',
  code + '\nreturn {buildHoursDocument, getHoursLanguageAvailability};');
const {buildHoursDocument, getHoursLanguageAvailability} = fn(data, MODE, options);
const fixture = {
  sections: [{title:'Псалом 5', rows:[
    {church:'Церковнославянский отрывок.', russian:'Русский отрывок.'},
    {church:'ЦС второй абзац.', russian:'РУС второй абзац.'},
  ]}],
  traditionalSections: [{title:'Ѱало́мъ є҃', rows:[
    {traditional:'Глаго́лы моѧ́ внꙋшѝ, Гд҃и.'},
  ]}],
};
assert.deepEqual(getHoursLanguageAvailability(fixture),
  {hasChurch:true,hasRussian:true,hasTraditional:true});
const entry = getHoursEntry('ordinary-1');
const church = buildHoursDocument({entry,content:fixture,viewMode:'church'});
const russian = buildHoursDocument({entry,content:fixture,viewMode:'russian'});
const both = buildHoursDocument({entry,content:fixture,viewMode:'both'});
const traditional = buildHoursDocument({entry,content:fixture,viewMode:'traditional'});
assert.equal(church.sections[0].rows[0].blocks[0].text, 'Церковнославянский отрывок.');
assert.equal(russian.sections[0].rows[0].blocks[0].text, 'Русский отрывок.');
assert.equal(both.sections[0].rows[0].blocks.length, 2);
assert.equal(both.sections[0].rows[0].blocks[1].metadata.language, 'russian');
assert.equal(traditional.sections[0].rows[0].blocks[0].text,
  'Глаго́лы моѧ́ внꙋшѝ, Гд҃и.');
assert.deepEqual(both.viewSwitcher.options.map(x=>x.key),
  ['church','russian','both','traditional']);
const missing = buildHoursDocument({
  entry,content:{...fixture,traditionalSections:[]},viewMode:'traditional'
});
assert.equal(missing.sections.length, 1);
assert.equal(missing.sections[0].rows.length, 1);
assert.match(missing.sections[0].rows[0].blocks[0].text, /пока не добавлен/);

const menu = read('src/screens/MenuScreen.js');
const navigation = read('src/navigation/AppNavigator.js');
const list = read('src/screens/HoursScreen.js');
const reader = read('src/screens/HoursReadingScreen.js');
const importer = read('tools/import_hours_texts.py');
assert.match(menu, /navigation\.navigate\('Hours'\)/);
assert.match(navigation, /name="Hours"\s+component=\{HoursScreen\}/);
assert.match(navigation, /name="HoursReading"\s+component=\{HoursReadingScreen\}/);
assert.match(list, /HOURS_GROUPS\.map/);
assert.match(list, /navigation\.navigate\('HoursReading', \{entryId: item\.id\}\)/);
assert.doesNotMatch(list, /Азбука|источник|Браузер|онлайн-текст/i);
assert.match(reader, /<SelectableDocumentReader/);
assert.match(reader, /<ReaderAppearanceSheet/);
assert.match(reader, /useReadingChrome/);
assert.match(reader, /sourceType: 'hours'/);
assert.match(reader, /getOfflineHoursText\(entryId\)/);
assert.match(reader, /languageSwitcher=\{documentData\?\.viewSwitcher\}/);
assert.doesNotMatch(reader, /<WebView|Linking|sourceUrl|Азбука|Браузер/);
assert.match(importer, /hoursTexts\.json/);
assert.match(importer, /def parse_paired/);
assert.match(importer, /def parse_paschal/);
assert.match(importer, /def parse_single_lenten/);
console.log('PASS: 25 Hours, local corpus, 4 reader modes, no external page in reading UI');
