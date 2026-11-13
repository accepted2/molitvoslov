#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const traditional = require('../src/data/hoursFirstHourTraditional.json');
const editorial = require('../src/data/hoursFirstHourEditorial.json');

assert.equal(traditional.version, 1);
assert.equal(traditional.entryId, 'ordinary-1');
assert.equal(traditional.sections.length, 16);
assert.equal(traditional.sections[0].kind, 'opening');
assert.deepEqual(traditional.sections.slice(1, 4).map(section => section.psalmNumber),
  [5, 89, 100]);
// The civil CS edition now has a separate reader Amen and a Theotokos
// kontakion that have not yet been transliterated to traditional typography.
const expectedTraditionalRows = editorial.afterPsalms.map((section,index)=>
  section.rows.length - (index===9?1:index===11?2:0));
assert.deepEqual(traditional.sections.slice(4).map(section=>section.rows.length),
  expectedTraditionalRows);
assert.equal(editorial.afterPsalms[9].rows[7].church,'Чтец: Аминь.');
assert.ok(editorial.afterPsalms[11].rows[4].church.startsWith('Хор: Взбранной Воеводе'));
assert.deepEqual(traditional.sections[0].rows.length, editorial.opening.rows.length);

for (let i = 0; i < 12; i += 1) {
  const actual = traditional.sections[i + 4];
  const original = editorial.afterPsalms[i];
  for (const field of ['kind', 'collapsible', 'accordionId', 'noBottomDivider',
    'dividerBefore']) {
    assert.deepEqual(actual[field], original[field], `section ${i + 1}: ${field}`);
  }
  const aligned = i === 9 ? original.rows.slice(0, 7)
    : i === 11 ? [0, 1, 2, 5, 6, 7, 8].map(j=>original.rows[j])
    : original.rows;
  for (let rowIndex = 0; rowIndex < aligned.length; rowIndex += 1) {
    const input = aligned[rowIndex];
    const translated = actual.rows[rowIndex];
    for (const field of ['presentation', 'redInitial', 'dividerAfter', 'compactAfter',
      'preserveLineBreaks']) {
      if (i === 9 && rowIndex === 6 && field === 'dividerAfter') {
        assert.equal(input.dividerAfter,true,'CS priest line has new divider');
        assert.equal(translated.dividerAfter,undefined);
        continue;
      }
      if (i === 11 && rowIndex === 2 && field === 'redInitial') {
        assert.equal(input.redInitial,true,'CS priest prayer receives red initial Х');
        continue;
      }
      if (i === 11 && rowIndex === 3 && field === 'presentation') {
        assert.equal(input.presentation,'choir-response');
        continue;
      }
      // The three optional weekday hymns have deliberately red initials.
      if (field === 'redInitial' && i >= 6 && i <= 8 && rowIndex === 0) {
        assert.equal(translated.redInitial, true, 'weekday hymn starts with red initial');
        continue;
      }
      assert.deepEqual(translated[field], input[field],
        `section ${i + 1}, row ${rowIndex + 1}: ${field}`);
    }
  }
}
const flattened = traditional.sections.flatMap(section => section.rows);
assert.equal(flattened.length, 52);
for (const [i, row] of flattened.entries()) {
  assert.equal(typeof row.traditional, 'string', `row ${i + 1}`);
  assert.ok(row.traditional.trim().length, `row ${i + 1} is empty`);
  assert.doesNotMatch(row.traditional, /\uFFFD/, `row ${i + 1} has a replacement glyph`);
  assert.equal(row.church, undefined, 'Original CS is stored separately');
}
for (const psalm of traditional.sections.slice(1, 4)) {
  assert.ok(psalm.rows[0].traditional.length > 500,
    `Psalm ${psalm.psalmNumber} is incomplete`);
  assert.match(psalm.rows[0].traditional, /[ѧѣꙋѡ҃]/u);
}
assert.deepEqual(traditional.sections.filter(section => section.collapsible)
  .map(section => section.accordionId), [
    'first-hour-lent-tropar',
    'first-hour-monday',
    'first-hour-wednesday',
    'first-hour-saturday',
    'first-hour-ephrem',
  ]);
assert.match(traditional.sections[6].rows[4].traditional, /нарече́мъ/u);
assert.match(traditional.sections[13].rows[1].traditional, /всѧ́кое вре́мѧ/u);
assert.match(traditional.sections[14].rows[7].traditional, /пра́здности/u);
assert.match(traditional.sections[15].rows[2].traditional, /свѣ́те и҆́стинный/u);

const service = fs.readFileSync(path.join(root, 'src/services/hoursDocument.js'), 'utf8');
const screen = fs.readFileSync(path.join(root, 'src/screens/HoursReadingScreen.js'), 'utf8');
assert.match(service, /import firstHourTraditional from/);
assert.match(service, /isFirstHour \? firstHourTraditional\.sections/);
assert.match(screen, /documentData\?\.available\?\.hasTraditional/);
console.log('PASS: traditional First Hour, 16 sections, 52 rows, 3 Psalms, 5 accordions, reader wiring');
