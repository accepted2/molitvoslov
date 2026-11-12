#!/usr/bin/env node
'use strict';
// From molitvoslov-app: node tools/test_hours_first_hour_editorial.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

const editable = JSON.parse(read('src/data/hoursFirstHourEditorial.json'));
const code = read('src/services/hoursFirstHourEditorial.js')
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*/gm, '')
  .replace(/\bexport const /g, 'const ');
const {getEditedFirstHour} = new Function('editedFirstHour', code +
  '\nreturn {getEditedFirstHour};')(editable);

assert.equal(editable.entryId, 'ordinary-1');
assert.equal(editable.opening.rows.length, 3);
assert.equal(editable.opening.rows[0].church,
  'Прииди́те, поклони́мся Царе́ви на́шему Бо́гу.');
assert.equal(editable.opening.rows[2].church,
  'Прииди́те, поклони́мся и припаде́м Самому́ Христу́, Царе́ви и Бо́гу на́шему.');
assert.ok(editable.afterPsalms.length >= 12);
assert.match(JSON.stringify(editable.afterPsalms), /Сла́ва Отцу́ и Сы́ну/);
assert.match(JSON.stringify(editable.afterPsalms), /Аллилу́иа/);
assert.match(JSON.stringify(editable.afterPsalms), /Го́споди, поми́луй/);
assert.match(JSON.stringify(editable.afterPsalms), /молитва св. Ефрема Сирина/);
assert.match(JSON.stringify(editable.afterPsalms), /понедельник, вторник и четверг/);
assert.match(JSON.stringify(editable.afterPsalms), /среда и пятница/);
assert.match(JSON.stringify(editable.afterPsalms), /Богородичен — суббота/);
assert.match(JSON.stringify(editable.afterPsalms), /Иерей произносит отпуст/);

const psalm = (num, s) => ({
  title: 'Псалом ' + num + ':',
  rows: [{church:'Церковнославянский псалом ' + num + ': ' + s,
    russian:'Русский псалом ' + num + ': ' + s}],
});
const fixture = {sections: [
  {title:'Начало часа',rows:[
    {church:'Старое начало',russian:'Русское начало'}]},
  psalm(5,'Глаго́лы моя'),
  psalm(89,'Отче наш'),
  psalm(100,'Милость и суд'),
  {title:'Исходное окончание',rows:[
    {church:'Прежнее окончание',russian:'Русское окончание'}]},
]};
const before = JSON.stringify(fixture);
const result = getEditedFirstHour(fixture);
assert.equal(result.applied, true);
assert.deepEqual(result.preservedPsalms, [5,89,100]);
assert.equal(result.sections.length, 1 + 3 + editable.afterPsalms.length);
assert.deepEqual(result.sections.slice(1,4), fixture.sections.slice(1,4));
assert.equal(result.sections[0].rows[0].church, editable.opening.rows[0].church);
assert.equal(result.sections[4].title, 'После псалмов');
assert.equal(result.sections[4].rows[0].church,
  'Сла́ва Отцу́ и Сы́ну и Свято́му Ду́ху, и ны́не и при́сно и во ве́ки веко́в. Ами́нь.');
assert.ok(result.russianUnpaired.some(section =>
  section.rows.some(row => row.russian === 'Русское окончание')));
assert.equal(JSON.stringify(fixture), before, 'Do not rewrite 20 imported local texts');

const missing = getEditedFirstHour({sections: [fixture.sections[1],fixture.sections[2]]});
assert.equal(missing.applied, false);
assert.match(missing.reason, /Psalms 5, 89, 100/);

const css = read('src/components/reader/selectableDocumentReader/styles.js');
assert.match(css, /hours-section \.section-header::after\s*\{\s*content: none/);
assert.match(css, /\.reader-text\.hours-psalm-opening::first-letter/);
assert.match(css, /font-size: inherit !important/);
assert.doesNotMatch(css, /hours-psalm-opening::first-letter\s*\{[^}]*font-size:\s*2\.2em/s);
const document = read('src/services/hoursDocument.js');
assert.match(document, /getEditedFirstHour\(content\)/);
assert.match(document, /cleanHeading\(section.title\)/);
assert.match(document, /viewMode === READER_LANGUAGE_MODES.BOTH/);
console.log('PASS: first-hour prayers, three Psalms preserved, accents, rubrics, no drop cap or underline');
