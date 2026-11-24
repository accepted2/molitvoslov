#!/usr/bin/env node
'use strict';
// Run from molitvoslov-app: node tools/test_hours_typography.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (name) => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

const typographyCode = read('src/services/hoursTypography.js')
  .replace(/\bexport const /g, 'const ');
const typography = new Function(typographyCode +
  '\nreturn {classifyHoursSection, classifyHoursRow, collectHoursTextMarks};')();
const {classifyHoursSection, classifyHoursRow, collectHoursTextMarks} = typography;
assert.equal(classifyHoursSection('Псалом 50'), 'psalm');
assert.equal(classifyHoursSection('Молитва шестого часа'), 'prayer');
assert.equal(classifyHoursSection('Тропарь'), 'hymn');
assert.equal(classifyHoursSection('Богородичен'), 'hymn');
assert.equal(classifyHoursSection('Прокимен'), 'hymn');
assert.equal(classifyHoursSection('Чтение Апостола'), 'reading');
assert.equal(classifyHoursSection('Слава, и ныне'), 'rubric');
assert.equal(classifyHoursRow({text: 'Псалом 50'}), 'heading');
assert.equal(classifyHoursRow({text: 'Псалом 50. Помилуй мя, Боже.'}), 'prose');
assert.equal(classifyHoursRow({text: 'Тропарь:'}), 'rubric');
assert.equal(classifyHoursRow({text: 'Тропарь: Заступниче мой, Господи.'}), 'prose');
assert.equal(classifyHoursRow({text: 'Иерей: Господи, помилуй.'}), 'dialogue');
assert.equal(classifyHoursRow({text: 'Слава, и ныне: Аллилуиа.'}), 'doxology');
assert.equal(classifyHoursRow({text: 'Госпо́ди, поми́луй. (3)'}), 'response');
assert.equal(classifyHoursRow({text: 'И паки:'}), 'rubric');
const source = 'Священник: Госпо́ди, поми́луй. (Трижды.)\nСлава, и ныне: Аллилуиа.';
const marks = collectHoursTextMarks(source);
assert.deepEqual(marks.map(item => item.kind),
  ['speaker', 'mercy', 'repeat', 'doxology', 'alleluia']);
assert.deepEqual(marks.map(item => source.slice(item.start, item.end)),
  ['Священник:', 'Госпо́ди, поми́луй', '(Трижды.)', 'Слава, и ныне:', 'Аллилуиа']);
assert.ok(marks.every(item => item.end > item.start && item.end <= source.length));
for (let i = 1; i < marks.length; i += 1) {
  assert.ok(marks[i].start >= marks[i-1].end, 'Overlapping typography ranges');
}
assert.deepEqual(collectHoursTextMarks('Глаго́лы моѧ́ внꙋшѝ, Гд҃и.'), []);
assert.equal(classifyHoursRow({text:'Глаго́лы мои',sectionKind:'psalm'}),'psalm');

const MODE = {CHURCH:'church',RUSSIAN:'russian',BOTH:'both',TRADITIONAL:'traditional'};
const languageOptions = () => [
  {key:'church'}, {key:'russian'}, {key:'both'}, {key:'traditional'},
];
const documentCode = read('src/services/hoursDocument.js')
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*/gm, '')
  .replace(/\bexport const /g, 'const ');
const factory = new Function(
  'hoursTexts', 'READER_LANGUAGE_MODES', 'buildReaderLanguageOptions',
  'classifyHoursRow', 'classifyHoursSection', 'collectHoursTextMarks',
  'getEditedFirstHour', 'getFirstHourRussianSections', 'pairFirstHourSections',
  documentCode + '\nreturn {buildHoursDocument};'
);
const {buildHoursDocument} = factory(
  {entries:{}}, MODE, languageOptions,
  classifyHoursRow, classifyHoursSection, collectHoursTextMarks,
  () => ({applied: false}),
  () => [{title:'',kind:'psalm',rows:[{russian:'Русский отрывок.'}]}],
  () => null
);
const entry = {id:'ordinary-3',groupId:'ordinary',title:'Третий час',sourceId:910003};
const content = {sections: [
  {title:'Псалом 5',rows:[
    {church:'Внуши, Господи, глаголы моя.',
      russian:'Услышь, Господи, слова мои.'},
    {church:'Иерей: Господи, помилуй. (3)',
      russian:'Священник: Господи, помилуй. (3)'},
  ]},
  {title:'Тропарь',rows:[
    {church:'Тропарь: Заутра услыши глас мой.',
      russian:'Тропарь: Рано утром услышь мой голос.'},
  ]},
]};
const original = JSON.stringify(content);
const csl = buildHoursDocument({entry,content,viewMode:'church'});
const rus = buildHoursDocument({entry,content,viewMode:'russian'});
const both = buildHoursDocument({entry,content,viewMode:'both'});
assert.equal(JSON.stringify(content), original, 'Input corpus must remain unchanged');
assert.equal(csl.sections[0].className, 'hours-section hours-section-psalm');
assert.equal(csl.sections[1].className, 'hours-section hours-section-hymn');
assert.match(csl.sections[0].rows[0].blocks[0].className, /hours-psalm-opening/);
assert.match(csl.sections[0].rows[1].blocks[0].className, /hours-dialogue/);
assert.equal(rus.sections[0].rows[0].blocks[0].text, content.sections[0].rows[0].russian);
assert.equal(both.sections[0].rows[0].blocks.length, 2);
assert.equal(both.sections[0].rows[0].blocks[0].text, content.sections[0].rows[0].church);
assert.equal(both.sections[0].rows[0].blocks[1].text, content.sections[0].rows[0].russian);
assert.deepEqual(both.sections[0].rows[0].blocks[0].hoursMarks.map(mark => mark.kind),
  ['initial']);
assert.equal(both.sections[0].rows[0].blocks[0].text.slice(
  both.sections[0].rows[0].blocks[0].hoursMarks[0].start,
  both.sections[0].rows[0].blocks[0].hoursMarks[0].end), 'В');
assert.deepEqual(both.sections[0].rows[1].blocks[0].hoursMarks.map(m=>m.kind),
  ['speaker','mercy','repeat']);
assert.equal(csl.sections[0].progressAnchorId, rus.sections[0].progressAnchorId,
  'Progress anchor must not change on language switch');
const incomplete = {...content,sections:[{title:'Псалом 5',rows:[
  {church:'Внуши, Господи, глаголы моя.',russian:''},
  {church:'Господи, помилуй.',russian:'Господи, помилуй.'},
]}]};
const incompleteBoth = buildHoursDocument({entry,content:incomplete,viewMode:'both'});
assert.equal(incompleteBoth.sections[0].rows[0].blocks.length, 1);
assert.match(incompleteBoth.description, /часть фрагментов/i);

// Editorial flags must be transformed to inline color marks and CSS classes
// without adding punctuation or changing the source prayer sentences.
const liturgical = buildHoursDocument({
  entry,
  content: {sections: [
    {title:'Если Великий пост — тропарь, глас 6',
      kind:'conditional',
      collapsible:true,
      accordionId:'test-lent',
      rows:[
        {church:'Зау́тра услыши глас мой.',redInitial:true,dividerAfter:true},
        {church:'Стих 1: Глаголы моя внуши́.',accentPrefix:'Стих 1:',dividerAfter:true},
        {church:'Стих 2: Яко к Тебе помолюся.',accentPrefix:'Стих 2:',dividerAfter:true},
        {church:'Слава, и ныне:',dividerAfter:true},
        {church:'Богородичен: Что Тя наречем.',accentPrefix:'Богородичен:'},
      ]},
    {title:'',kind:'prayer',rows:[
      {church:'Стопы́ моя направи.',redInitial:true,dividerAfter:true},
      {church:'Да испо́лнятся уста́ моя.',redInitial:true},
    ]},
    {title:'',kind:'rubric',noBottomDivider:true,rows:[
      {church:'Трисвятое. И по Отче наш:',presentation:'liturgical-label'},
      {church:'Кондак праздника',presentation:'placeholder'},
      {church:'Если кондака нет, читаем Богородичен:',presentation:'comment'},
    ]},
  ]},
  viewMode:'church',
});
const marksOf = (block) =>
  block.hoursMarks.map(m => ({kind:m.kind, text:block.text.slice(m.start,m.end)}));
const lentRows = liturgical.sections[0].rows;
assert.equal(liturgical.sections[0].collapsible,true);
assert.equal(liturgical.sections[0].accordionId,'test-lent');
assert.deepEqual(marksOf(lentRows[0].blocks[0]),[{kind:'initial',text:'З'}]);
assert.deepEqual(marksOf(lentRows[1].blocks[0]),[{kind:'cue',text:'Стих 1:'}]);
assert.deepEqual(marksOf(lentRows[2].blocks[0]),[{kind:'cue',text:'Стих 2:'}]);
assert.equal(lentRows[3].dividerAfter,true);
assert.deepEqual(marksOf(lentRows[4].blocks[0]),
  [{kind:'cue',text:'Богородичен:'}]);
assert.deepEqual(marksOf(liturgical.sections[1].rows[0].blocks[0]),
  [{kind:'initial',text:'С'}]);
assert.deepEqual(marksOf(liturgical.sections[1].rows[1].blocks[0]),
  [{kind:'initial',text:'Д'}]);
assert.match(liturgical.sections[2].className, /hours-no-bottom-divider/);
assert.match(liturgical.sections[2].rows[0].blocks[0].className,
  /hours-presentation-liturgical-label/);
assert.match(liturgical.sections[2].rows[1].blocks[0].className,
  /hours-presentation-placeholder/);
assert.match(liturgical.sections[2].rows[2].blocks[0].className,
  /hours-presentation-comment/);

// The end of the First Hour uses explicit row metadata. The choir's
// proclamation stays normal text; only the speaker cue is red.
const closing = buildHoursDocument({
  entry,
  content: {sections: [
    {title:'',kind:'prayer',dividerBefore:true,rows:[
      {church:'Господи, помилуй. (40)',presentation:'left-response',dividerAfter:true},
      {church:'Иже на всякое время.',redInitial:true,dividerAfter:true},
      {church:'Честне́йшую Херувим.',redInitial:true,dividerAfter:true},
      {church:'Именем Господним благослови, отче.',
        presentation:'liturgical-red',dividerAfter:true},
      {church:'Хор: Слава Отцу и Сыну и Святому Духу.',
        dividerAfter:true},
      {church:'Благослови.',presentation:'liturgical-red'},
    ]},
  ]},
  viewMode:'church',
});
const closingSection = closing.sections[0];
assert.match(closingSection.className, /hours-divider-before/);
assert.equal(closingSection.rows[0].dividerAfter,true);
assert.match(closingSection.rows[0].blocks[0].className,
  /hours-presentation-left-response/);
assert.deepEqual(marksOf(closingSection.rows[1].blocks[0]),
  [{kind:'initial',text:'И'}]);
assert.deepEqual(marksOf(closingSection.rows[2].blocks[0]),
  [{kind:'initial',text:'Ч'}]);
assert.match(closingSection.rows[3].blocks[0].className,
  /hours-presentation-liturgical-red/);
assert.deepEqual(marksOf(closingSection.rows[4].blocks[0]),
  [{kind:'speaker',text:'Хор:'}]);
assert.match(closingSection.rows[5].blocks[0].className,
  /hours-presentation-liturgical-red/);

const runtime = read('src/components/reader/selectableDocumentReader/runtime.js');
const styles = read('src/components/reader/selectableDocumentReader/styles.js');
assert.match(runtime, /itemConfig\?\.sourceType === 'hours'/);
assert.match(runtime, /span\.classList\.add\('hours-mark-' \+ hoursMark\.kind\)/);
assert.match(styles, /HOURS_READER_TYPOGRAPHY_V1/);
assert.match(styles, /\.rule-item\.hours-section \.reader-text\.hours-text/);
assert.match(styles, /\.hours-mark-doxology/);
assert.match(styles, /\.hours-mark-mercy/);
assert.match(styles, /\.hours-divider-before/);
assert.match(styles, /\.hours-presentation-left-response/);
assert.match(styles, /\.hours-presentation-liturgical-red/);
assert.match(styles, /\.hours-presentation-liturgical-label/);
console.log('PASS: Hours typography, Cyrillic accents, original text/selection indices, four language modes');
