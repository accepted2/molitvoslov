#!/usr/bin/env node
'use strict';
// From molitvoslov-app: node tools/test_hours_first_hour_russian.js
// Ensure the entire user-provided Russian First Hour is local/offline, has
// the same five disclosure groups and does not reuse stale imported readings.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const ru = JSON.parse(read('src/data/hoursFirstHourRussian.json'));
const cs = JSON.parse(read('src/data/hoursFirstHourEditorial.json'));
const MODE = {CHURCH:'church',RUSSIAN:'russian',BOTH:'both',TRADITIONAL:'traditional'};
const libCode = read('src/services/hoursFirstHourRussian.js')
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*/gm, '')
  .replace(/\bexport const /g, 'const ');
const {getFirstHourRussianSections, pairFirstHourSections} = new Function(
  'russianEdition', libCode +
    '\nreturn {getFirstHourRussianSections,pairFirstHourSections};'
)(ru);
assert.equal(ru.entryId, 'ordinary-1');
assert.equal(ru.opening.rows.length, 3);
assert.deepEqual(ru.opening.rows.map(r => r.russian), [
  'Придите, поклонимся Цареви нашему Богу.',
  'Придите, поклонимся и припадём Христу, Царю нашему Богу.',
  'Придите, поклонимся и припадём Самому Христу, Царю и Богу нашему.',
]);
assert.deepEqual(ru.psalms.map(p=>p.title), ['Псалом 5','Псалом 89','Псалом 100']);
assert.ok(ru.psalms.every(p => p.rows.length === 1));
assert.ok(ru.psalms.every(p => p.rows[0].russian.length >= 700));
assert.match(ru.psalms[0].rows[0].russian, /^Слова мои услышь, Господи/);
assert.match(ru.psalms[1].rows[0].russian, /^Господи! Ты стал для нас прибежищем/);
assert.match(ru.psalms[2].rows[0].russian, /^Милость и суд воспою Тебе, Господи/);
assert.match(ru.psalms[2].rows[0].russian, /чтобы истребить из града Господня всех делающих беззаконие\.$/);
assert.equal(ru.afterPsalms.length,12);
const expectedIds = [
  'first-hour-lent-tropar','first-hour-monday','first-hour-wednesday',
  'first-hour-saturday','first-hour-ephrem',
];
assert.deepEqual(ru.afterPsalms.filter(x=>x.collapsible).map(x=>x.accordionId),expectedIds);
assert.deepEqual(cs.afterPsalms.filter(x=>x.collapsible).map(x=>x.accordionId),expectedIds);
assert.equal(ru.afterPsalms[0].rows.length,3);
assert.equal(ru.afterPsalms[0].rows[1].russian,
  'Аллилуия, аллилуия, аллилуия,\nслава Тебе, Боже. (Трижды)');
assert.deepEqual(ru.afterPsalms[1].rows.map(x=>x.presentation),['comment','comment']);
assert.equal(ru.afterPsalms[2].rows[0].russian,
  'Слава Отцу и Сыну и Святому Духу:');
assert.equal(ru.afterPsalms[2].rows[1].russian,'Тропарь дня');
assert.equal(ru.afterPsalms[2].rows[2].russian,
  'И ныне и присно и во веки веков. Аминь.');
assert.equal(ru.afterPsalms[2].rows[2].dividerAfter,true);
assert.equal(ru.afterPsalms[2].rows[1].presentation,'placeholder');
assert.match(ru.afterPsalms[2].rows[4].russian,/^Как назвать нам Тебя, о Благодатная/);
assert.ok(!ru.afterPsalms[2].rows[4].russian.includes('\n'),
  'The Bogorodichen must wrap naturally without hard breaks after sentences.');
assert.match(ru.afterPsalms[2].rows[4].russian,
  /Солнце правды\. Раем\? Ибо израстила Ты Цвет нетления/);
assert.equal(ru.afterPsalms[3].rows[1].accentPrefix,'Стих 1:');
assert.equal(ru.afterPsalms[3].rows[2].accentPrefix,'Стих 2:');
assert.match(ru.afterPsalms[3].rows[3].russian,/^Священник: Слава Отцу/);
assert.match(ru.afterPsalms[4].rows[0].russian,/^Стопы мои направь/);
assert.match(ru.afterPsalms[4].rows[1].russian,/Да наполнятся уста мои/);
assert.equal(ru.afterPsalms[5].rows.length,10);
assert.equal(ru.afterPsalms[5].rows[0].russian,'Трисвятое. И по Отче наш:');
assert.equal(ru.afterPsalms[5].rows[0].presentation,'liturgical-label');
assert.match(ru.afterPsalms[5].rows[3].russian,/Пресвятая Троица/);
assert.match(ru.afterPsalms[5].rows[6].russian,/Отче наш, Иже еси на небесех/);
assert.equal(ru.afterPsalms[5].rows[4].presentation,'left-response');
assert.equal(ru.afterPsalms[5].rows[8].presentation,'placeholder');
assert.match(ru.afterPsalms[5].rows[9].russian,/Если же пели «Аллилуия»/);
assert.match(ru.afterPsalms[6].rows[0].russian,/^Преславную Божию Матерь/);
assert.match(ru.afterPsalms[7].rows[0].russian,/^Скоро предстань нам на помощь/);
assert.match(ru.afterPsalms[8].rows[0].russian,/^Как первые плоды природы/);
assert.match(ru.afterPsalms[9].rows[1].russian,/^Во всякое время и на всякий час/);
assert.match(ru.afterPsalms[9].rows[6].russian,/^Священник: Боже, сжалься/);
assert.equal(ru.afterPsalms[10].rows[0].russian,
  'Если Великий пост — молитва святого Ефрема Сирина с тремя великими поклонами:');
assert.equal(ru.afterPsalms[10].rows[0].presentation,'comment');
assert.equal(ru.afterPsalms[10].rows.length,9);
assert.deepEqual(ru.afterPsalms[10].rows.map(r=>r.presentation || ''),
  ['comment','','','','comment','','comment','','comment']);
assert.equal(ru.afterPsalms[10].rows[5].russian,'Боже, очисти меня, грешного.');
assert.match(ru.afterPsalms[10].rows[7].russian,/^Господи и Владыка жизни моей!/);
assert.match(ru.afterPsalms[10].rows[8].russian,/И один великий поклон/);
assert.equal(ru.afterPsalms[11].rows.length,19);
assert.equal(ru.afterPsalms[11].rows[0].russian,'Трисвятое. И по Отче наш:');
assert.match(ru.afterPsalms[11].rows[1].russian,/Чтец: Святый Боже/);
assert.equal(ru.afterPsalms[11].rows[9].russian,'Господи, помилуй. (12)');
assert.equal(ru.afterPsalms[11].rows[10].presentation,'comment');
assert.match(ru.afterPsalms[11].rows[11].russian,/Христе, Свет истинный/);
assert.equal(ru.afterPsalms[11].rows[12].presentation,'comment');
assert.match(ru.afterPsalms[11].rows[13].russian,/Обороняющей нас Военачальнице/);
assert.match(ru.afterPsalms[11].rows[14].russian,/Слава Тебе, Христе Боже/);
assert.match(ru.afterPsalms[11].rows[15].russian,/^Хор: Слава Отцу/);
assert.equal(ru.afterPsalms[11].rows[16].russian,'Господи, помилуй. (Трижды)');
assert.equal(ru.afterPsalms[11].rows[17].russian,'Благослови.');
assert.equal(ru.afterPsalms[11].rows[18].russian,'Иерей произносит отпуст.');
const allRussian = getFirstHourRussianSections();
assert.equal(allRussian.length,16);
assert.equal(allRussian[0].rows[0].russian,ru.opening.rows[0].russian);
assert.equal(allRussian[15].rows.at(-1).russian,'Иерей произносит отпуст.');
assert.ok(allRussian.every(section=>(section.rows||[]).every(row => typeof row.russian === 'string')));
const countWords = allRussian.flatMap(s=>s.rows).map(r=>r.russian.split(/\s+/).length)
  .reduce((a,b)=>a+b,0);
assert.ok(countWords > 1500,'Full user-provided text must not be reduced to shortened sample prayers');
const originalSourceRows = [ru.opening,...ru.psalms,...ru.afterPsalms]
  .flatMap(section=>section.rows);
assert.ok(!originalSourceRows.some(row =>
  /[⁰¹²³⁴⁵⁶⁷⁸⁹]|(?:^|\s)Пс\s*\d+\s*:\s*\d+/u.test(row.russian)),
  'No publisher footnotes or embedded Psalm citations in prayer text.');
assert.ok(!originalSourceRows.some(row => /\(3\)/u.test(row.russian)),
  'Threefold responses must read (Трижды) throughout First Hour.');
assert.equal(originalSourceRows.filter(row => row.russian.includes('(Трижды)')).length,6);
assert.ok(!originalSourceRows.some(row =>
  row.russian.includes('\n') && row.preserveLineBreaks !== true),
  'Only explicitly requested Alleluia/speaker line breaks remain.');
assert.equal(ru.afterPsalms[0].rows[1].preserveLineBreaks,true);
assert.ok(ru.afterPsalms[6].rows[0].russian.includes('молится непрестанно'));
assert.ok(!ru.afterPsalms[6].rows[0].russian.includes('\n'));
assert.ok(!ru.afterPsalms[7].rows[0].russian.includes('\n'));
assert.ok(!ru.afterPsalms[8].rows[0].russian.includes('\n'));
assert.ok(!ru.afterPsalms[9].rows[4].russian.includes('\n'));
const orig = JSON.stringify(ru);
allRussian[0].rows[0].russian = 'mutated in test';
assert.equal(JSON.stringify(ru),orig,'The imported Russian text remains immutable');
const churchSections = [
  {...cs.opening},
  ...cs.afterPsalms.map(s=>({...s,rows:s.rows.map(r=>({...r}))})),
];
const russianSections = [
  {...ru.opening},
  ...ru.afterPsalms.map(s=>({...s,rows:s.rows.map(r=>({...r}))})),
];
const paired = pairFirstHourSections({
  churchSections:churchSections.map(s=>({...s,rows:(s.rows||[]).map(r=>({...r}))})),
  russianSections:russianSections.map(s=>({...s,rows:(s.rows||[]).map(r=>({...r}))})),
});
assert.equal(paired.length,13);
assert.ok(paired.every(Boolean));
assert.deepEqual(paired.filter(s=>s.collapsible).map(s=>s.accordionId),expectedIds);
assert.equal(paired[0].rows[0].russian,ru.opening.rows[0].russian);
assert.equal(paired[4].rows[0].russian,ru.afterPsalms[3].rows[0].russian);
assert.equal(paired[11].rows[5].russian,ru.afterPsalms[10].rows[5].russian);
assert.equal(paired[12].pairedByRow,false);
assert.ok(paired[12].rows.some(r=>r.russian?.startsWith('Обороняющей нас Военачальнице')));
assert.ok(!paired[12].rows.some(r=>r.church && r.russian),
  'Mismatched dismissal text must never be falsely paired with unrelated Church Slavonic');
const wrongLength = pairFirstHourSections({churchSections:[{title:'bad',rows:[]}],russianSections:[]});
assert.equal(wrongLength,null);

// Verify the actual application document builder in all three modes.
const typographyCode=read('src/services/hoursTypography.js').replace(/\bexport const /g,'const ');
const typography=new Function(typographyCode +
  '\nreturn {classifyHoursRow,classifyHoursSection,collectHoursTextMarks};')();
const editorCode=read('src/services/hoursFirstHourEditorial.js')
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*/gm,'')
  .replace(/\bexport const /g,'const ');
const {getEditedFirstHour} = new Function('editedFirstHour',editorCode +
  '\nreturn {getEditedFirstHour};')(cs);
const docCode=read('src/services/hoursDocument.js')
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*/gm,'')
  .replace(/\bexport const /g,'const ');
const docFactory=new Function(
  'hoursTexts','READER_LANGUAGE_MODES','buildReaderLanguageOptions',
  'classifyHoursRow','classifyHoursSection','collectHoursTextMarks',
  'getEditedFirstHour','getFirstHourRussianSections','pairFirstHourSections',
  docCode + '\nreturn {buildHoursDocument};');
const {buildHoursDocument}=docFactory(
  {entries:{}},MODE,()=>[{key:'church'},{key:'russian'},{key:'both'},{key:'traditional'}],
  typography.classifyHoursRow,typography.classifyHoursSection,typography.collectHoursTextMarks,
  getEditedFirstHour,getFirstHourRussianSections,pairFirstHourSections,
);
const entry={id:'ordinary-1',groupId:'ordinary',title:'Первый час',sourceId:910001};
const sourcePsalms = [5,89,100].map(n=>({title:'Псалом '+n,rows:[
  {church:'Слова церковнославянского псалма '+n+'.',russian:'СТАРЫЙ ИМПОРТ '+n},
]}));
const src={sections:[
  {title:'Вход',rows:[{church:'Старое начало',russian:'СТАРОЕ НАЧАЛО'}]},
  ...sourcePsalms,
  {title:'Старый отпуст',rows:[{church:'Не использовать',russian:'СТАРЫЙ ОТПУСТ'}]},
]};
const saved=JSON.stringify(src);
const russianDoc=buildHoursDocument({entry,content:src,viewMode:MODE.RUSSIAN});
assert.equal(russianDoc.sections.length,16);
assert.deepEqual(russianDoc.sections.filter(s=>s.collapsible).map(s=>s.accordionId),expectedIds);
assert.equal(russianDoc.sections[0].rows[0].blocks[0].text,
  'Придите, поклонимся Цареви нашему Богу.');
assert.match(russianDoc.sections[0].rows[0].blocks[0].className,
  /hours-russian-primary/);
assert.ok(!russianDoc.sections[0].rows[0].blocks[0].className.includes('secondary'));
assert.equal(russianDoc.sections[6].rows[4].blocks[0].text,
  ru.afterPsalms[2].rows[4].russian);
assert.match(russianDoc.sections[4].rows[1].blocks[0].className,
  /hours-preserve-line-breaks/);
assert.equal(russianDoc.sections[1].rows[0].blocks[0].text,ru.psalms[0].rows[0].russian);
assert.equal(russianDoc.sections[3].rows[0].blocks[0].text,ru.psalms[2].rows[0].russian);
assert.equal(russianDoc.sections[15].rows.at(-1).blocks[0].text,
  'Иерей произносит отпуст.');
const russianText=russianDoc.sections.flatMap(s=>s.rows).flatMap(r=>r.blocks)
  .map(b=>b.text).join('\n');
assert.ok(!russianText.includes('СТАРЫЙ ИМПОРТ'));
assert.ok(!russianText.includes('СТАРЫЙ ОТПУСТ'));
assert.match(russianText,/Чтец: Святый Боже/);
assert.match(russianText,/Обороняющей нас Военачальнице/);
const bothDoc=buildHoursDocument({entry,content:src,viewMode:MODE.BOTH});
assert.equal(bothDoc.sections.length,16);
assert.deepEqual(bothDoc.sections.filter(s=>s.collapsible).map(s=>s.accordionId),expectedIds);
assert.equal(bothDoc.sections[0].rows[0].blocks.length,2);
assert.equal(bothDoc.sections[0].rows[0].blocks[1].text,ru.opening.rows[0].russian);
assert.match(bothDoc.sections[0].rows[0].blocks[1].className,
  /hours-russian-parallel/);
assert.match(bothDoc.sections[0].rows[0].blocks[1].className,/secondary/);
assert.match(bothDoc.sections[4].rows[1].blocks[1].className,
  /hours-preserve-line-breaks/);
assert.equal(bothDoc.sections[1].rows[0].blocks[1].text,ru.psalms[0].rows[0].russian);
assert.ok(!bothDoc.sections.flatMap(s=>s.rows).flatMap(r=>r.blocks)
  .some(b=>b.text.includes('СТАРЫЙ ИМПОРТ') || b.text.includes('СТАРЫЙ ОТПУСТ')));
assert.equal(bothDoc.description,'');
const churchDoc=buildHoursDocument({entry,content:src,viewMode:MODE.CHURCH});
assert.equal(churchDoc.sections[1].rows[0].blocks[0].text,
  'Слова церковнославянского псалма 5.');
assert.equal(JSON.stringify(src),saved);
console.log('PASS: Russian First Hour typography, full tropar doxology, prayer wrapping, no footnotes, and parallel appearance');
