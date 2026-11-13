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
assert.deepEqual(ru.afterPsalms[3].rows.slice(3,7).map(r=>r.russian), [
  'Священник:',
  'Слава Отцу, и Сыну, и Святому Духу.',
  'Чтец:',
  'И ныне, и всегда, и во веки веков. Аминь.',
]);
assert.deepEqual(ru.afterPsalms[3].rows.slice(3,7).map(r=>r.presentation), [
  'liturgical-red', 'plain-prayer', 'liturgical-red', 'plain-prayer',
]);
assert.ok(ru.afterPsalms[3].rows[3].compactAfter);
assert.ok(ru.afterPsalms[3].rows[5].compactAfter);
assert.equal(ru.afterPsalms[3].rows[6].dividerAfter, true);
assert.equal(ru.afterPsalms[3].rows.length,8);
assert.match(ru.afterPsalms[4].rows[0].russian,/^Стопы мои направь/);
assert.match(ru.afterPsalms[4].rows[1].russian,/Да наполнятся уста мои/);
assert.equal(ru.afterPsalms[5].rows.length,9);
assert.equal(ru.afterPsalms[5].rows[0].russian,
  'Святый Боже, Святый Крепкий, Святый Безсмертный, помилуй нас. (Трижды)');
assert.ok(!ru.afterPsalms[5].rows.some(r=>r.russian==='Трисвятое. И по Отче наш:'));
assert.match(ru.afterPsalms[5].rows[2].russian,/Пресвятая Троица/);
assert.equal(ru.afterPsalms[5].rows[2].redInitial,true);
assert.equal(ru.afterPsalms[11].rows[2].redInitial,true,
  'The concluding Presvyataya Troitsa has a red initial P.');
assert.equal(ru.afterPsalms[11].rows[2].presentation,'final-trinity',
  'The last Trinity prayer needs an explicit WebView color override.');
assert.equal(ru.afterPsalms[11].rows[14].presentation,'choir-response');
assert.match(ru.afterPsalms[5].rows[5].russian,/Отче наш, Иже еси на небесех/);
assert.equal(ru.afterPsalms[5].rows[3].presentation,'left-response');
assert.equal(ru.afterPsalms[5].rows[5].redInitial,true);
assert.equal(ru.afterPsalms[11].rows[5].redInitial,true);
const completePriest='Священник: Яко Твое есть царство, и сила, и слава Отца и Сына и Святаго Духа ныне и присно и во веки веков.';
assert.equal(ru.afterPsalms[5].rows[6].russian,completePriest);
assert.equal(ru.afterPsalms[11].rows[6].russian,completePriest);
assert.equal(ru.afterPsalms[11].rows[7].russian,'Чтец: Аминь.');
assert.equal(ru.afterPsalms[5].rows[7].presentation,'placeholder');
assert.match(ru.afterPsalms[5].rows[8].russian,/Если же пели «Аллилуия»/);
assert.ok(!ru.afterPsalms[11].rows.some(r=>r.russian==='Трисвятое. И по Отче наш:'),
  'The redundant Trisagion heading is removed after St Ephrem too.');
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
assert.equal(ru.afterPsalms[11].rows.length,18);
assert.equal(ru.afterPsalms[11].rows[0].russian,
  'Чтец: Святый Боже, Святый Крепкий, Святый Безсмертный, помилуй нас. (Трижды)');
assert.equal(ru.afterPsalms[11].rows[8].russian,'Господи, помилуй. (12)');
assert.equal(ru.afterPsalms[11].rows[9].presentation,'comment');
assert.match(ru.afterPsalms[11].rows[10].russian,/Христе, Свет истинный/);
assert.equal(ru.afterPsalms[11].rows[11].presentation,'comment');
assert.match(ru.afterPsalms[11].rows[12].russian,/Обороняющей нас Военачальнице/);
assert.match(ru.afterPsalms[11].rows[13].russian,/Слава Тебе, Христе Боже/);
assert.match(ru.afterPsalms[11].rows[14].russian,/^Хор: Слава Отцу/);
assert.equal(ru.afterPsalms[11].rows[15].russian,'Господи, помилуй. (Трижды)');
assert.equal(ru.afterPsalms[11].rows[16].russian,'Благослови.');
assert.equal(ru.afterPsalms[11].rows[17].russian,'Иерей произносит отпуст.');
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
assert.equal(originalSourceRows.filter(row => row.russian.includes('(Трижды)')).length,8);
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
const normalizedRussianSections = getFirstHourRussianSections();
const russianSections = [normalizedRussianSections[0],
  ...normalizedRussianSections.slice(4)];
const paired = pairFirstHourSections({
  churchSections:churchSections.map(s=>({...s,rows:(s.rows||[]).map(r=>({...r}))})),
  russianSections:russianSections.map(s=>({...s,rows:(s.rows||[]).map(r=>({...r}))})),
});
assert.equal(paired.length,13);
assert.ok(paired.every(Boolean));
assert.deepEqual(paired.filter(s=>s.collapsible).map(s=>s.accordionId),expectedIds);
assert.equal(paired[0].rows[0].russian,ru.opening.rows[0].russian);
assert.equal(paired[4].rows.length,6,'Lenten dropdown has shared rubrics and translated prayers');
assert.ok(paired[4].rows[3].church==='Слава, и ныне:');
assert.equal(paired[4].rows[3].russian,undefined,'Lenten doxology is not doubled');
assert.equal(paired[4].rows[4].church,'Богородичен:');
assert.equal(paired[4].rows[4].russian,undefined,'One shared Bogorodichen caption');
assert.ok(paired[4].rows[5].church.startsWith('Что Тя') &&
  paired[4].rows[5].russian.startsWith('Как назвать нам Тебя'));
assert.equal(paired[3].rows[3].russian,undefined,'Ordinary Bogorodichen caption shared');
assert.equal(paired[1].rows[0].russian,undefined,'After-Psalm Glory is not doubled');
assert.equal(paired[1].rows[1].russian,undefined,'Alleluia shared once');
assert.equal(paired[1].rows[2].russian,undefined,'Mercy shared once');
assert.ok(paired[2].rows.every(r=>r.russian===undefined),'Comments shared once');
assert.equal(paired[10].rows[0].russian,undefined,'Mercy 40 shared once');
assert.equal(paired[10].rows[3].russian,undefined,'Doxology after prayer shared once');
assert.ok(paired[10].rows[6].church.includes('Чтец: Аминь.'),
  'Reader Amen is added to the left column');
assert.ok(paired[11].rows.filter(r=>r.presentation==='comment').every(r=>!r.russian),
  'St Ephrem instructions are shared');
assert.ok(!paired[12].rows.some(r=>r.church?.includes('Трисвятое. И по Отче наш')),
  'A redundant rubric before complete prayers is suppressed');
assert.ok(paired[12].rows.some(r=>r.russian?.startsWith('Обороняющей нас Военачальнице')));
assert.ok(paired[12].rows.some(r=>r.russian?.startsWith('Хор:') && !r.church),
  'One final choir response is shown in Russian');
assert.ok(paired[12].rows.some(r=>r.church?.startsWith('Христе́') && r.russian),
  'The priest cue is removed on the CS side of the parallel prayer');
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
  'firstHourTraditional',
  docCode + '\nreturn {buildHoursDocument};');
const {buildHoursDocument}=docFactory(
  {entries:{}},MODE,()=>[{key:'church'},{key:'russian'},{key:'both'},{key:'traditional'}],
  typography.classifyHoursRow,typography.classifyHoursSection,typography.collectHoursTextMarks,
  getEditedFirstHour,getFirstHourRussianSections,pairFirstHourSections,
  JSON.parse(read('src/data/hoursFirstHourTraditional.json')),
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
// Full doxologies are red in standalone РУС, not in quoted instructions.
const marked = (block, kind) =>
  block.hoursMarks.filter(m => m.kind === kind)
    .map(m => block.text.slice(m.start, m.end));
const glory = russianDoc.sections[4].rows[0].blocks[0];
assert.deepEqual(marked(glory,'devotional'),[ru.afterPsalms[0].rows[0].russian]);
const alleluia = russianDoc.sections[4].rows[1].blocks[0];
assert.equal(marked(alleluia,'alleluia').length,3);
assert.deepEqual(marked(alleluia,'devotional'),['слава Тебе, Боже']);
assert.equal(russianDoc.sections[4].rows[2].blocks[0].text,
  'Господи, помилуй. (Трижды)');
assert.deepEqual(marked(russianDoc.sections[4].rows[2].blocks[0],'mercy'),
  ['Господи, помилуй']);
assert.deepEqual(marked(russianDoc.sections[6].rows[0].blocks[0],'devotional'),
  ['Слава Отцу и Сыну и Святому Духу']);
assert.deepEqual(marked(russianDoc.sections[6].rows[2].blocks[0],'devotional'),
  ['И ныне и присно и во веки веков. Аминь.']);
const finalChoir = russianDoc.sections[15].rows[14].blocks[0];
assert.equal(finalChoir.text,
  'Хор: Слава Отцу и Сыну и Святому Духу, и ныне и присно и во веки веков. Аминь.');
assert.match(finalChoir.className,/hours-presentation-choir-response/);
assert.deepEqual(marked(finalChoir,'speaker'), ['Хор:']);
assert.deepEqual(marked(finalChoir,'devotional'), [],
  'The final choir Glory stays normal color.');
assert.deepEqual(finalChoir.hoursMarks.map(mark=>mark.kind),['speaker']);
assert.deepEqual(marked(russianDoc.sections[9].rows[2].blocks[0],'initial'), ['П']);
assert.deepEqual(marked(russianDoc.sections[15].rows[2].blocks[0],'initial'), ['П']);
assert.match(russianDoc.sections[15].rows[2].blocks[0].className,
  /hours-presentation-final-trinity/);
assert.equal(russianDoc.sections[15].rows[2].blocks[0].hoursMarks[0].start,0);
assert.equal(russianDoc.sections[15].rows[2].blocks[0].hoursMarks[0].end,1);
const lentRu=russianDoc.sections[7].rows;
assert.equal(lentRu.length,5);
assert.equal(lentRu[3].blocks[0].text,'Слава, и ныне:');
assert.match(lentRu[3].blocks[0].className,/hours-presentation-liturgical-red/);
assert.ok(!lentRu.some(row=>/Священник:|Чтец:/u.test(row.blocks[0].text)),
  'No separate priest/reader lines in the Russian Lent troparion');
assert.equal(russianDoc.sections[9].rows[0].blocks[0].text,
  'Святый Боже, Святый Крепкий, Святый Безсмертный, помилуй нас. (Трижды)');
assert.equal(russianDoc.sections[15].rows[0].blocks[0].text,
  'Чтец: Святый Боже, Святый Крепкий, Святый Безсмертный, помилуй нас. (Трижды)');
assert.deepEqual(marked(russianDoc.sections[9].rows[5].blocks[0],'initial'),['О']);
assert.deepEqual(marked(russianDoc.sections[15].rows[5].blocks[0],'initial'),['О']);
assert.equal(russianDoc.sections[9].rows[6].blocks[0].text,completePriest);
assert.equal(russianDoc.sections[15].rows[6].blocks[0].text,completePriest);
for(const section of russianDoc.sections) {
  for(const row of section.rows) for(const block of row.blocks) {
    if (block.className.includes('hours-presentation-comment')) {
      assert.deepEqual(block.hoursMarks,[],
        'Quoted glory in Russian rubrics must not be red.');
    }
  }
}
const repeatRows=[ru.opening,...ru.psalms,...ru.afterPsalms]
  .flatMap(s=>s.rows).filter(r=>r.russian.includes('(Трижды)'));
assert.equal(repeatRows.length,8);
assert.ok(!russianText.includes('(3)'));
assert.equal(ru.afterPsalms[10].rows[0].russian,
  'Если Великий пост — молитва святого Ефрема Сирина с тремя великими поклонами:');
const colorsCss=read('src/components/reader/selectableDocumentReader/styles.js');
assert.match(colorsCss,/hours-russian-primary \.hours-mark-devotional/);
assert.match(colorsCss,/hours-presentation-shared-heading/);
assert.match(colorsCss,/hours-divider-after-dropdown/);

assert.match(colorsCss,/hours-russian-primary \.hours-mark-mercy/);
assert.match(colorsCss,/hours-presentation-comment span/);
assert.match(colorsCss,/hours-presentation-plain-prayer span/);
assert.match(colorsCss,/hours-presentation-choir-response \.hours-mark-speaker/);
assert.match(colorsCss,/hours-russian-primary\.hours-presentation-final-trinity/);
assert.match(colorsCss,/hours-russian-primary\.hours-presentation-choir-response/);
const runtimeCode=read('src/components/reader/selectableDocumentReader/runtime.js');
assert.match(runtimeCode,/const isFirstHourPrimaryRussian/);
assert.match(runtimeCode,/blockClasses\.includes\('hours-presentation-final-trinity'\)/);
assert.match(runtimeCode,/blockClasses\.includes\('hours-presentation-choir-response'\)/);
assert.match(runtimeCode,/span\.style\.setProperty\('color', 'var\(--liturgical\)', 'important'\)/);
assert.match(runtimeCode,/span\.style\.setProperty\('color', choirColor, 'important'\)/);
assert.match(runtimeCode,/child\.style\.setProperty\('color', choirColor, 'important'\)/);

const bothDoc=buildHoursDocument({entry,content:src,viewMode:MODE.BOTH});
assert.equal(bothDoc.sections.length,16);
assert.deepEqual(bothDoc.sections.filter(s=>s.collapsible).map(s=>s.accordionId),expectedIds);
assert.equal(bothDoc.sections[0].rows[0].blocks.length,2);
assert.equal(bothDoc.sections[0].rows[0].blocks[1].text,ru.opening.rows[0].russian);
assert.match(bothDoc.sections[0].rows[0].blocks[1].className,
  /hours-russian-parallel/);
assert.match(bothDoc.sections[0].rows[0].blocks[1].className,/secondary/);
assert.equal(bothDoc.sections[4].rows[1].blocks.length,1);
assert.equal(bothDoc.sections[4].rows[1].layout,'stack');
assert.match(bothDoc.sections[4].rows[1].blocks[0].className,
  /hours-preserve-line-breaks/);
assert.equal(bothDoc.sections[0].rows[0].layout,'parallel');
assert.equal(bothDoc.sections[7].rows[0].layout,'parallel');
assert.equal(bothDoc.sections[7].rows[3].layout,'stack');
assert.equal(bothDoc.sections[7].rows[3].blocks.length,1);
assert.equal(bothDoc.sections[7].rows[3].blocks[0].text,'Слава, и ныне:');
assert.match(bothDoc.sections[7].rows[3].blocks[0].className,
  /hours-presentation-shared-doxology/);
assert.equal(bothDoc.sections[7].rows[4].layout,'stack');
assert.equal(bothDoc.sections[7].rows[4].blocks[0].text,'Богородичен:');
assert.match(bothDoc.sections[7].rows[4].blocks[0].className,
  /hours-presentation-shared-heading/);
assert.equal(bothDoc.sections[7].rows[5].layout,'parallel');
assert.equal(bothDoc.sections[7].rows[5].blocks.length,2);
assert.match(bothDoc.sections[7].className,/hours-divider-after-dropdown/);
for (const id of expectedIds) {
  const disclosure=bothDoc.sections.find(s=>s.accordionId===id);
  assert.ok(disclosure && disclosure.collapsible,'Missing disclosure '+id);
  assert.ok(disclosure.rows.some(row=>row.layout==='parallel'),
    'Disclosure has no parallel translation: '+id);
}
assert.ok(bothDoc.sections[14].rows.some(r=>r.blocks.length===1 &&
  r.blocks[0].className.includes('hours-presentation-comment')),
  'Ephrem comments are not double translated');
assert.equal(bothDoc.sections[1].rows[0].blocks[1].text,ru.psalms[0].rows[0].russian);
assert.ok(!bothDoc.sections.flatMap(s=>s.rows).flatMap(r=>r.blocks)
  .some(b=>b.text.includes('СТАРЫЙ ИМПОРТ') || b.text.includes('СТАРЫЙ ОТПУСТ')));
assert.equal(bothDoc.description,'');

const sharedBlock=(section,row)=>bothDoc.sections[section].rows[row].blocks[0];
const isFullyRed = block => block.hoursMarks.some(mark=>
  mark.kind==='devotional' && mark.start===0 && mark.end===block.text.length);
for(const [section,row] of [[4,0],[6,0],[6,2],[7,3],[9,1],[9,4],
  [13,3],[15,1],[15,4],[15,13]]) {
  const block=sharedBlock(section,row);
  assert.equal(bothDoc.sections[section].rows[row].blocks.length,1,
    'Full doxology cannot have a second language column');
  assert.ok(isFullyRed(block),'One full red doxology: '+section+'/'+row);
}
for (const [section,row] of [[4,1],[4,2],[9,3],[13,0],[13,2],[15,3],
  [15,8],[15,14]]) {
  const block=sharedBlock(section,row);
  assert.equal(bothDoc.sections[section].rows[row].blocks.length,1,
    'Shared Alleluia or Mercy cannot appear twice');
  assert.ok(block.hoursMarks.some(mark=>mark.kind==='devotional'&&mark.start===0),
    'Shared response text is red: '+section+'/'+row);
  assert.ok(block.hoursMarks.some(mark=>mark.kind==='repeat'),
    'Repeat count stays secondary: '+section+'/'+row);
}
assert.equal(bothDoc.sections[6].rows[3].blocks[0].text,'Богородичен:');
assert.equal(bothDoc.sections[7].rows[4].blocks[0].text,'Богородичен:');
assert.ok(bothDoc.sections[7].rows[5].blocks[0].text.startsWith('Что Тя'));
assert.ok(bothDoc.sections[7].rows[5].blocks[1].text.startsWith('Как назвать'));
assert.ok(bothDoc.sections[15].rows[10].blocks[0].text.startsWith('Христе́'),
  'No Иерей before the prayer');

assert.equal(bothDoc.sections[4].rows[0].blocks.length,1,'Glory after Psalms is shared');
assert.equal(bothDoc.sections[6].rows[0].blocks.length,1,'Glory before tropar is shared');
assert.equal(bothDoc.sections[6].rows[2].blocks.length,1,'And Now is shared');
assert.equal(bothDoc.sections[6].rows[3].blocks.length,1,'Bogorodichen caption shared');
assert.equal(bothDoc.sections[6].rows[4].blocks.length,2,'Bogorodichen text paired');
assert.ok(bothDoc.sections[9].rows.some(r=>r.blocks[0].text.startsWith('Святый Боже')),
  'Full Trisagion is retained');
assert.ok(bothDoc.sections[9].rows.filter(r=>r.blocks.length===1).some(
  r=>r.blocks[0].className.includes('shared-doxology')),'Full Glory is shared');
assert.ok(!bothDoc.sections[9].rows.some(r=>
  r.blocks.some(b=>b.text==='Трисвятое. И по Отче наш:')),
  'Repeated Trisagion rubric removed');
assert.ok(bothDoc.sections[13].rows[3].blocks.length===1,'Prayer doxology once');
assert.ok(bothDoc.sections[13].rows[5].blocks.length===1,'Name of the Lord once');
assert.equal(bothDoc.sections[13].rows[6].layout,'parallel');
assert.match(bothDoc.sections[13].rows[6].blocks[0].text,/Чтец: Аминь\./);
assert.ok(!bothDoc.sections[15].rows.some(r=>r.blocks.some(b=>
  b.text==='Трисвятое. И по Отче наш:')),'Second redundant rubric removed');
assert.ok(bothDoc.sections[15].rows.some(r=>r.blocks.length===1 &&
  r.blocks[0].text.startsWith('Хор:')),'Final choir appears only once');
assert.ok(bothDoc.sections[15].rows.some(r=>r.blocks.length===1 &&
  r.blocks[0].text==='Благослови.'),'Final blessing appears only once');
assert.ok(bothDoc.sections[15].rows.some(r=>r.blocks.length===2 &&
  r.blocks[0].text.startsWith('Христе́')),'No Иерей label before prayer');

assert.ok(bothDoc.sections[4].rows.slice(1).every(r=>r.blocks.length===1),
  'Alleluia and mercy are displayed once');
assert.ok(bothDoc.sections[5].rows.every(r=>r.blocks.length===1),
  'Editorial notes are displayed once');
assert.ok(bothDoc.sections[13].rows
  .filter(row=>row.blocks[0].text.startsWith('Господи, помилуй'))
  .every(row=>row.blocks.length===1),'Mercy 40 and thrice are displayed once');
assert.ok(bothDoc.sections[15].rows
  .filter(row=>row.blocks[0].text.startsWith('Господи, помилуй'))
  .every(row=>row.blocks.length===1),'Concluding mercy stays shared');
for (const section of bothDoc.sections) for (const row of section.rows) {
  if (row.blocks.length===2) {
    assert.equal(row.layout,'parallel','Paired text is side-by-side');
    assert.equal(row.blocks[0].metadata.language,'church');
    assert.equal(row.blocks[1].metadata.language,'russian');
  }
  if (row.blocks.length===1) assert.equal(row.layout,'stack','Shared/unique text is full width');
}
assert.ok(bothDoc.sections[9].rows.some(row =>
  row.blocks.length===1 && row.blocks[0].metadata.language==='russian' &&
  row.blocks[0].text.includes('Пресвятая Троица')),
'Full Russian-only prayers remain available after Trisagion rubric');
assert.ok(bothDoc.sections[15].rows.some(row =>
  row.blocks.length===1 && row.blocks[0].text.startsWith('Обороняющей нас Военачальнице')),
'Russian-only kondak remains intact');
const churchDoc=buildHoursDocument({entry,content:src,viewMode:MODE.CHURCH});
assert.equal(churchDoc.sections[1].rows[0].blocks[0].text,
  'Слова церковнославянского псалма 5.');
for (const row of churchDoc.sections[5].rows) {
  const block=row.blocks[0];
  assert.ok(block.className.includes('hours-presentation-comment'));
  assert.deepEqual(block.hoursMarks,[],
    'ЦС commentary quoting "Слава Отцу" must not receive red spans.');
}
assert.equal(JSON.stringify(src),saved);
console.log('PASS: First Hour RU final Trinity П red, final Хор alone red, scoped runtime color overrides verified');
