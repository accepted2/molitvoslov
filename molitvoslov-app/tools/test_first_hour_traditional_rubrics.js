#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const traditional = require('../src/data/hoursFirstHourTraditional.json');
const service = fs.readFileSync(path.join(root, 'src/services/hoursDocument.js'), 'utf8');
const css = fs.readFileSync(path.join(root,
  'src/components/reader/selectableDocumentReader/styles.js'), 'utf8');
assert.equal(traditional.sections.length, 16);
assert.equal(traditional.sections.flatMap(s => s.rows).length, 52);
assert.deepEqual(traditional.sections.filter(s => s.collapsible).map(s => s.accordionId), [
  'first-hour-lent-tropar','first-hour-monday','first-hour-wednesday',
  'first-hour-saturday','first-hour-ephrem',
]);
const notes = traditional.sections.flatMap(s => s.rows)
  .filter(r => r.presentation === 'comment');
assert.equal(notes.length, 7);
for (const row of notes) {
  assert.ok(row.traditional);
  assert.doesNotMatch(row.traditional, /Если|читается|св\. Ефрема|кондака нет|поклон един/u);
}
for (const section of traditional.sections.slice(10, 13)) {
  assert.equal(section.rows[0].redInitial, true);
}
assert.match(css, /hours-traditional-section\.hours-collapsible \.hours-accordion-toggle/);
assert.match(css, /reader-text\.hours-traditional\.hours-presentation-comment/);
assert.match(css, /reader-text\.hours-traditional \.hours-mark-repeat/);
const match = service.match(/export const getFirstHourTraditionalMarks = [\s\S]*?\n};/);
assert.ok(match, 'traditional accent range function missing');
const source = match[0].replace('export const ', 'const ');
const accents = vm.runInNewContext(source + '\ngetFirstHourTraditionalMarks;');
const rows = traditional.sections;
const glory = rows[4].rows[0].traditional;
const full = accents(glory);
assert.ok(full.some(r => r.kind === 'devotional' && r.start === 0 &&
  r.end === glory.length), 'full Glory must be red');
const separate = accents(rows[6].rows[0].traditional);
assert.ok(separate.some(r => r.kind === 'devotional'), 'separate Glory red');
const now = accents(rows[6].rows[2].traditional);
assert.ok(now.some(r => r.kind === 'devotional' && r.start === 0), 'Now red');
const inLent = accents(rows[7].rows[3].traditional);
assert.ok(inLent.some(r => r.kind === 'devotional' && r.start === 0), 'Lent Glory/Now red');
const alleluias = accents(rows[4].rows[1].traditional)
  .filter(r => r.kind === 'alleluia');
assert.equal(alleluias.length, 3, 'all three alleluias red');
assert.ok(alleluias.every(r => r.start >= 0 && r.end > r.start));
const gloryToGod = rows[4].rows[1].traditional;
const gloryOffset = gloryToGod.indexOf('сла́ва тебѣ̀ бж҃е');
assert.ok(gloryOffset >= 0, 'post-Alleluia Glory is present');
assert.ok(accents(gloryToGod).some(r => r.kind === 'alleluia' &&
  r.start === gloryOffset && r.end === gloryOffset + 'сла́ва тебѣ̀ бж҃е'.length),
  'Glory to Thee O God is also red');
const choir = accents(rows[15].rows[3].traditional);
assert.ok(choir.some(r => r.kind === 'speaker' && r.start === 0));
assert.ok(!choir.some(r => r.kind === 'devotional'), 'choir Glory must be normal text');
assert.equal(choir.length, 1, 'only the choir label is red');
const priest = accents(rows[15].rows[2].traditional);
assert.ok(priest.some(r => r.kind === 'speaker' && r.start === 0));
for (const row of [rows[13].rows[0],rows[13].rows[2],rows[14].rows[1],rows[15].rows[1]]) {
  assert.ok(accents(row.traditional).some(r => r.kind === 'repeat'),
    'count / bow needs secondary rubric color');
}
for (const row of notes) {
  assert.equal(accents(row.traditional, 'comment').length, 0, 'notes must not be prayer-red');
}
assert.match(service, /getFirstHourTraditionalMarks\(text, presentation\)/);
console.log('PASS: traditional First Hour Ponomar notes, 5 dropdowns, red doxologies, speakers, initials and secondary bow/count rubrics');
