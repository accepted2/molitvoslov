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
assert.equal(paired[4].pairedByRow, false,
  'The expanded dialogue must not pair unrelated CS and RU paragraphs.');
assert.equal(paired[4].rows.length,
  cs.afterPsalms[3].rows.length + ru.afterPsalms[3].rows.length);
assert.ok(paired[4].rows.some(r=>r.russian === 'Священник:'));
assert.ok(paired[4].rows.some(r=>r.russian === 'Чтец:'));
assert.ok(paired[4].rows.some(r=>r.russian ===
  'И ныне, и всегда, и во веки веков. Аминь.'));
assert.ok(!paired[4].rows.some(r=>r.church && r.russian));
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
assert.equal(lentRu.length,8);
assert.equal(lentRu[3].blocks[0].text,'Священник:');
assert.equal(lentRu[5].blocks[0].text,'Чтец:');
assert.match(lentRu[3].blocks[0].className,/hours-presentation-liturgical-red/);
assert.match(lentRu[5].blocks[0].className,/hours-presentation-liturgical-red/);
assert.match(lentRu[4].blocks[0].className,/hours-presentation-plain-prayer/);
assert.match(lentRu[6].blocks[0].className,/hours-presentation-plain-prayer/);
assert.deepEqual(marked(lentRu[4].blocks[0],'devotional'),[],
  'The Lenten priest prayer must remain normal text.');
assert.deepEqual(marked(lentRu[6].blocks[0],'devotional'),[],
  'The Lenten reader prayer must remain normal text.');
assert.deepEqual(lentRu[3].blocks[0].hoursMarks,[],
  'The red role label is styled by its liturgical-red block class.');
assert.deepEqual(lentRu[5].blocks[0].hoursMarks,[],
  'The red role label is styled by its liturgical-red block class.');
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
assert.match(bothDoc.sections[4].rows[1].blocks[1].className,
  /hours-preserve-line-breaks/);
assert.equal(bothDoc.sections[1].rows[0].blocks[1].text,ru.psalms[0].rows[0].russian);
assert.ok(!bothDoc.sections.flatMap(s=>s.rows).flatMap(r=>r.blocks)
  .some(b=>b.text.includes('СТАРЫЙ ИМПОРТ') || b.text.includes('СТАРЫЙ ОТПУСТ')));
assert.equal(bothDoc.description,'');
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
