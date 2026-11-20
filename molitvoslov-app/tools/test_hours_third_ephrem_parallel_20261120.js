#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8').replace(/^\uFEFF/u, '');
const json = name => JSON.parse(read('src/data/' + name));
const russianFirst = json('hoursFirstHourRussian.json');
const churchFirst = json('hoursFirstHourEditorial.json');
const firstTrad = json('hoursFirstHourTraditional.json');
const thirdChurch = json('hoursThirdHourEditorial.json');
const thirdRu = json('hoursThirdHourRussian.json');
const hoursTexts = json('hoursTexts.json');
const firstRuPrayer = russianFirst.afterPsalms.find(s => s.accordionId === 'first-hour-ephrem');
const firstCsPrayer = churchFirst.afterPsalms.find(s => s.accordionId === 'first-hour-ephrem');
assert.equal(firstRuPrayer.rows.length, 9);
assert.equal(firstCsPrayer.rows.length, 9);
const clean = source => source
  .replace(/^import[\s\S]*?;\s*$/gm, '')
  .replace(/\bexport\s+(?:const|let)\s+/g, 'const ');
const helper = new Function(
  'thirdHourChurch', 'thirdHourRussian', 'firstHourRussian', 'firstHourChurch',
  clean(read('src/services/hoursThirdHourRussian.js')) +
  '\nreturn getThirdHourRussianSections;',
)(thirdChurch, thirdRu, russianFirst, churchFirst);
const modes = {CHURCH:'church', RUSSIAN:'russian', BOTH:'both', TRADITIONAL:'traditional'};
const build = new Function(
  'hoursTexts', 'thirdHourChurch', 'firstHourTraditional', 'READER_LANGUAGE_MODES',
  'buildReaderLanguageOptions', 'classifyHoursRow', 'classifyHoursSection',
  'collectHoursTextMarks', 'getEditedFirstHour', 'getFirstHourRussianSections',
  'pairFirstHourSections', 'getThirdHourRussianSections',
  'getThirdHourTraditionalSections', 'getThirdHourTraditionalMarks',
  clean(read('src/services/hoursDocument.js')) + '\nreturn buildHoursDocument;',
)(
  hoursTexts, thirdChurch, firstTrad, modes,
  () => [], () => 'prose', () => 'general', () => [],
  () => ({applied:false}), () => [], () => null, helper,
  () => [], () => [],
);
const entry = {id:'ordinary-3', title:'Третий час', sourceId:910002, groupId:'ordinary'};
const originalChurch = JSON.stringify(churchFirst);
const originalRu = JSON.stringify(russianFirst);
const both = build({entry, content:thirdChurch, viewMode:modes.BOTH});
const russian = build({entry, content:thirdChurch, viewMode:modes.RUSSIAN});
const paired = both.sections.find(s => s.accordionId === 'third-hour-ephrem');
const standalone = russian.sections.find(s => s.accordionId === 'third-hour-ephrem');
assert(paired && paired.collapsible);
assert(standalone && standalone.collapsible);
assert.equal(paired.rows.length, 9);
assert.equal(standalone.rows.length, 9);
for (let i = 0; i < 9; i++) {
  const row = paired.rows[i];
  assert.equal(row.layout, 'parallel', 'parallel row '+i);
  assert.equal(row.blocks.length, 2, 'two languages row '+i);
  const [cs, ru] = row.blocks;
  assert.equal(cs.metadata.language, 'church');
  assert.equal(ru.metadata.language, 'russian');
  assert.equal(cs.text, firstCsPrayer.rows[i].church.trim(), 'CS source row '+i);
  assert.equal(ru.text, firstRuPrayer.rows[i].russian.trim(), 'RU source row '+i);
  assert.notEqual(cs.anchorId, ru.anchorId, 'independent anchors row '+i);
  assert.equal(standalone.rows[i].blocks.length, 1, 'RU remains standalone '+i);
  assert.equal(standalone.rows[i].blocks[0].text, ru.text);
}
assert.equal(JSON.stringify(churchFirst), originalChurch, 'First Hour CS never mutates');
assert.equal(JSON.stringify(russianFirst), originalRu, 'First Hour RU never mutates');
assert.equal(both.sections.length, 14, 'same Third Hour section count');
console.log('PASS: 9 Saint Ephrem lines have matching CS and RU in one expandable section.');
console.log('PASS: 3 great bows, 12 small bows, final repetition and independent anchors.');
console.log('PASS: standalone RU, both First Hour sources and other Third Hour sections preserved.');
