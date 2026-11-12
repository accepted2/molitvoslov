#!/usr/bin/env node
'use strict';
// Run from molitvoslov-app: node tools/test_hours_first_hour_editorial.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const edition = JSON.parse(read('src/data/hoursFirstHourEditorial.json'));
const service = new Function('editedFirstHour',
  read('src/services/hoursFirstHourEditorial.js')
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*/gm, '')
    .replace(/\bexport const /g, 'const ') +
  '\nreturn {getEditedFirstHour,trimImportedPsalmAppendix};'
)(edition);
const {getEditedFirstHour,trimImportedPsalmAppendix} = service;

assert.equal(edition.entryId, 'ordinary-1');
assert.equal(edition.opening.rows.length, 3);
assert.equal(edition.opening.rows[0].church,
  'Прииди́те, поклони́мся Царе́ви на́шему Бо́гу.');
assert.ok((JSON.stringify(edition).match(/[\u0300\u0301]/gu) || []).length > 50);
assert.doesNotMatch(JSON.stringify(edition), /[áéíóúýÁÉÓ]/u);

const after = edition.afterPsalms;
assert.equal(after.length, 12);
assert.deepEqual(after.map(s => s.title), [
  '', '', '', 'Если Великий пост — тропарь, глас 6',
  '', '', 'В понедельник, вторник и четверг',
  'В среду и пятницу', 'В субботу', '',
  'Если Великий пост — молитва святого Ефрема Сирина', '',
]);
assert.equal(after[0].rows.length, 3);
assert.equal(after[0].rows[0].church,
  'Сла́ва Отцу́ и Сы́ну и Свято́му Ду́ху, и ны́не и при́сно и во ве́ки веко́в. Ами́нь.');
assert.equal(after[0].rows[1].church,
  'Аллилу́иа, аллилу́иа, аллилу́иа,\nСла́ва Тебе́ Бо́же. (Трижды)');
assert.equal(after[0].rows[2].church, 'Го́споди, поми́луй. (Трижды)');
assert.equal(after[0].rows[0].dividerAfter, true);
assert.equal(after[0].rows[1].dividerAfter, true);
assert.equal(after[0].rows[2].dividerAfter, undefined);
assert.match(after[1].rows[0].church, /Если два тропаря/);
assert.match(after[1].rows[1].church, /Если один тропарь/);
assert.ok(after[1].rows.every(row => row.presentation === 'comment'));
assert.equal(after[2].rows[0].church, 'Сла́ва Отцу́ и Сы́ну и Свято́му Ду́ху:');
assert.equal(after[2].rows[1].church, 'Тропарь дня');
assert.equal(after[2].rows[1].presentation, 'placeholder');
assert.equal(after[2].rows[2].church,
  'И ны́не и при́сно и во ве́ки веко́в. Ами́нь.');
assert.equal(after[2].rows[2].dividerAfter, true);
assert.equal(after[2].rows[3].church, 'Богородичен:');
assert.equal(after[2].rows[3].presentation, 'rubric-label');
assert.equal(after[2].rows[3].compactAfter, true);
assert.match(after[2].rows[4].church, /^Что Тя нарече́м, о Благода́тная\?/);
assert.match(after[2].rows[4].church, /Того́ моли́ спасти́ся душа́м на́шим\.$/);
assert.equal(after[3].rows.length, 5);
assert.match(after[3].rows[0].church, /^Зау́тра услыши/);
assert.equal(after[3].rows[0].redInitial, true);
assert.equal(after[3].rows[0].dividerAfter, true);
assert.equal(after[3].rows[1].accentPrefix, 'Стих 1:');
assert.equal(after[3].rows[1].dividerAfter, true);
assert.equal(after[3].rows[2].accentPrefix, 'Стих 2:');
assert.equal(after[3].rows[2].dividerAfter, true);
assert.equal(after[3].rows[3].church, 'Слава, и ныне:');
assert.equal(after[3].rows[3].dividerAfter, true);
assert.equal(after[3].rows[4].accentPrefix, 'Богородичен:');
assert.equal(after[3].rows[4].church, 'Богородичен: ' + after[2].rows[4].church);
assert.equal(after[3].collapsible, true);
assert.match(after[4].rows[0].church, /^Стопы́ моя направи/);
assert.equal(after[4].rows[0].redInitial, true);
assert.equal(after[4].rows[0].dividerAfter, true);
assert.match(after[4].rows[1].church, /^Да испо́лнятся/);
assert.equal(after[4].rows[1].redInitial, true);
assert.deepEqual(after[5].rows.map(x => x.church), [
  'Трисвятое. И по Отче наш:',
  'Кондак праздника',
  'Если кондака нет, или Великий пост, читаем Богородичен:',
]);
assert.deepEqual(after[5].rows.map(x => x.presentation), [
  'liturgical-label', 'placeholder', 'comment',
]);
assert.equal(after[5].noBottomDivider, true);
assert.match(after[9].rows[0].church, /^Господи, помилуй\. \(40\)/);
assert.match(after[9].rows[1].church, /^Иже на всякое время/);
assert.match(after[10].rows[1].church, /^Го́споди и Влады́ко/);
assert.match(after[11].rows[0].church, /^Трисвятое/);
assert.match(after[11].rows.at(-1).church, /Иерей произносит отпуст/);
assert.deepEqual(after.filter(s => s.collapsible).map(s => s.accordionId), [
  'first-hour-lent-tropar', 'first-hour-monday',
  'first-hour-wednesday', 'first-hour-saturday', 'first-hour-ephrem',
]);
assert.ok(!after.some(s => s.title === 'После псалмов'));
assert.ok(!after.some(s => s.title.includes('Тропари по уставу')));
assert.ok(!JSON.stringify(after).includes('Первый тропарь (!)'));

const original = {sections:[
  {title:'Старое начало',rows:[{church:'До псалмов',russian:'Opening Russian'}]},
  {title:'Псалом 5',rows:[{church:'Пятый псалом',russian:'5th Psalm'}]},
  {title:'Псалом 89',rows:[{church:'89-й псалом',russian:'89th Psalm'}]},
  {title:'Псалом 100',rows:[
    {church:'Последний стих псалма 100.',russian:'Psalm 100 final verse.'},
    {church:'Слава, и ныне: Аллилуиа, аллилуиа, аллилуиа. Господи, помилуй.',
      russian:'Слава, и ныне: Аллилуиа, аллилуиа, аллилуиа.'},
    {church:'И аще убо Бог Господь поется, глаголем:',russian:'Following rubric'},
  ]},
  {title:'После старого окончания',rows:[
    {church:'Старое окончание',russian:'Russian unedited ending'}]},
]};
const unchanged = JSON.stringify(original);
const result = getEditedFirstHour(original);
assert.equal(result.applied,true);
assert.equal(result.removedImportedPostPsalmAppendix,true);
assert.deepEqual(result.preservedPsalms,[5,89,100]);
assert.equal(result.sections.length, 1 + 3 + after.length);
assert.deepEqual(result.sections[1],original.sections[1]);
assert.deepEqual(result.sections[2],original.sections[2]);
assert.deepEqual(result.sections[3].rows,original.sections[3].rows.slice(0,1));
assert.equal(result.sections[4].title,'');
assert.equal(result.sections[4].rows[0].church,after[0].rows[0].church);
assert.ok(!JSON.stringify(result.sections).includes('И аще убо Бог Господь'));
assert.ok(!JSON.stringify(result.sections).includes('Русское старое окончание'));
assert.ok(!JSON.stringify(result.sections).includes('Старое окончание'));
assert.equal(JSON.stringify(original), unchanged, 'Source corpus must not change');

const inline = trimImportedPsalmAppendix({title:'Псалом 100',rows:[
  {church:'Стихи псалма. Слава, и ныне: Аллилуиа, аллилуиа, аллилуиа.',
    russian:'Russian psalm. Слава, и ныне: Аллилуиа, аллилуиа.'},
]});
assert.equal(inline.trimmed,true);
assert.deepEqual(inline.section.rows,[{church:'Стихи псалма.',russian:'Russian psalm.'}]);

const noRite = trimImportedPsalmAppendix({title:'Псалом 100',rows:[
  {church:'Стихи псалма. Слава, и ныне: обыкновенный оборот без аллилуиа рядом.',russian:'Psalm'},
]});
assert.equal(noRite.trimmed,false);

const missing = getEditedFirstHour({sections:original.sections.slice(1,3)});
assert.equal(missing.applied,false);

const doc = read('src/services/hoursDocument.js');
const runtime = read('src/components/reader/selectableDocumentReader/runtime.js');
const styles = read('src/components/reader/selectableDocumentReader/styles.js');
assert.match(doc,/collapsible: section\.collapsible === true/);
assert.match(doc,/dividerAfter: row\.dividerAfter === true/);
assert.match(doc,/redInitial: row\.redInitial === true/);
assert.match(doc,/accentPrefix: row\.accentPrefix \|\| ''/);
assert.match(doc,/section\.noBottomDivider === true/);
assert.match(doc,/compactAfter: row\.compactAfter === true/);
assert.match(doc,/hours-presentation-/);
assert.match(doc,/accordionId: section\.accordionId \|\| null/);
assert.doesNotMatch(doc,/firstHourEdit\.russianUnpaired/);
assert.match(runtime,/const details = el\('details', 'hours-accordion'\)/);
assert.match(runtime,/const summary = el\('summary', 'hours-accordion-toggle', section\.title\)/);
assert.match(runtime,/rowsContainer\.appendChild\( rowNode \)/);
assert.match(runtime,/hours-row-divider-after/);
assert.match(runtime,/hours-row-compact-after/);
assert.match(styles,/\.hours-accordion-toggle/);
assert.match(styles,/\.hours-accordion\[open\]/);
assert.match(styles,/hours-section \.section-header::after\s*\{\s*content: none/);
assert.match(styles,/font-size: inherit !important/);
assert.match(styles,/hours-section-postpsalm\s*\{[^}]*border-top: 0/s);
assert.match(styles,/\.hours-mark-initial/);
assert.match(styles,/hours-section-postpsalm \.reader-text\.hours-response/);
assert.match(styles,/hours-presentation-comment/);
assert.match(styles,/hours-presentation-placeholder/);
assert.match(styles,/hours-presentation-liturgical-label/);
assert.match(styles,/hours-no-bottom-divider/);
assert.match(styles,/hours-section-rubric \.reader-text\.hours-presentation-comment/);
assert.match(styles,/hours-presentation-rubric-label/);
assert.match(styles,/\.reader-row\.hours-row-divider-after/);
assert.match(styles,/\.reader-row\.hours-row-compact-after/);
assert.doesNotMatch(styles,/hours-psalm-opening::first-letter/);
console.log('PASS: First Hour — Lenten tropar verses, red initials, Trisagion rubric, kondak, comments and five dropdowns');
