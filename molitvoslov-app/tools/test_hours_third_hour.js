#!/usr/bin/env node
'use strict';
// From molitvoslov-app: node tools/test_hours_third_hour.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = rel => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const source = JSON.parse(read('src/data/hoursTexts.json'));
const firstHour = JSON.parse(read('src/data/hoursFirstHourEditorial.json'));
const third = JSON.parse(read('src/data/hoursThirdHourEditorial.json'));
assert.ok(third,'Third Hour must be available offline');
assert.equal(third.entryId,'ordinary-3');
assert.equal(source.entries['ordinary-3'],undefined,
  'Third Hour is a standalone file: do not overwrite local imported hoursTexts');
assert.equal(third.sections.length,13);
assert.deepEqual(third.sections.slice(1,4).map(s=>s.title),
  ['Псалом 16','Псалом 24','Псалом 50']);
assert.deepEqual(third.sections.filter(s=>s.collapsible).map(s=>s.accordionId),[
  'third-hour-lent-tropar','third-hour-fasting-kontakia',
]);
assert.deepEqual(third.sections[5].rows,firstHour.afterPsalms[1].rows,
  'First Hour instructions about one or two troparia are reused unchanged');
assert.deepEqual(third.sections.map(s=>s.rows.length),
  [16,1,1,1,3,2,5,6,1,2,5,8,1]);
assert.equal(third.sections[1].rows[0].church.startsWith('Услыши, Господи'),true);
assert.equal(third.sections[2].rows[0].church.startsWith('К Тебе, Господи'),true);
assert.equal(third.sections[3].rows[0].church.startsWith('Помилуй мя, Боже'),true);
assert.ok(third.sections.slice(1,4).every(s=>s.rows[0].church.length > 900),
  'Three Psalms must be complete rather than placeholders');
assert.ok(third.sections[3].rows[0].church.endsWith('тельцы.'));
assert.equal(third.sections[6].rows[1].church,'Тропарь дня');
assert.equal(third.sections[6].rows[3].church,'Богородичен:');
assert.equal(third.sections[7].rows[3].church,'Слава, и ныне:');
assert.equal(third.sections[7].rows[4].church,'Богородичен:');
assert.equal(third.sections[7].rows[5].church,third.sections[6].rows[4].church);
assert.ok(third.sections[10].rows[0].church.startsWith('Благословен еси, Христе'));
assert.ok(third.sections[10].rows[2].church.startsWith('Скорое и известное'));
assert.ok(third.sections[10].rows[4].church.startsWith('Надежда, и предстательство'));
assert.ok(third.sections[12].rows[0].church.startsWith('Владыко Боже, Отче Вседержителю'));
assert.ok(third.sections.every(s=>s.rows.every(r=>typeof r.church==='string' &&
  r.church.trim().length>0 && !r.church.includes('\uFFFD'))));
assert.ok(third.sections.every(s=>s.rows.every(r=>r.russian===undefined)),
  'Unprovided Russian translations must not be synthesized');
const MODE={CHURCH:'church',RUSSIAN:'russian',BOTH:'both',TRADITIONAL:'traditional'};
const opts=()=>[
 {key:'church'},{key:'russian'},{key:'both'},{key:'traditional'},
];
const typography=new Function(read('src/services/hoursTypography.js')
  .replace(/\bexport const /g,'const ') +
  '\nreturn {classifyHoursRow,classifyHoursSection,collectHoursTextMarks};')();
const docCode=read('src/services/hoursDocument.js')
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*/gm,'')
  .replace(/\bexport const /g,'const ');
const builder=new Function(
  'hoursTexts','thirdHourChurch','firstHourTraditional','READER_LANGUAGE_MODES',
  'buildReaderLanguageOptions','classifyHoursRow','classifyHoursSection',
  'collectHoursTextMarks','getEditedFirstHour','getFirstHourRussianSections',
  'pairFirstHourSections',docCode +
  '\nreturn {buildHoursDocument,getOfflineHoursText,getHoursLanguageAvailability};'
)(source,third,{sections:[]},MODE,opts,
  typography.classifyHoursRow,typography.classifyHoursSection,
  typography.collectHoursTextMarks,
  ()=>({applied:false}),()=>[],()=>null
);
const entry={id:'ordinary-3',groupId:'ordinary',title:'Третий час',sourceId:910002};
const content=builder.getOfflineHoursText(entry.id);
assert.equal(content,third);
const available=builder.getHoursLanguageAvailability(content);
assert.deepEqual(available,{hasChurch:true,hasRussian:false,hasTraditional:false});
const church=builder.buildHoursDocument({entry,content,viewMode:MODE.CHURCH});
assert.equal(church.sections.length,13);
assert.equal(church.sections.filter(s=>s.collapsible).length,2);
assert.ok(church.sections.every(s=>s.className.includes('hours-third-hour')));
const accordionIds=church.sections.filter(s=>s.collapsible).map(s=>s.accordionId);
assert.deepEqual(accordionIds,['third-hour-lent-tropar','third-hour-fasting-kontakia']);
assert.ok(church.sections.filter(s=>s.collapsible).every(s=>
 s.className.includes('hours-divider-after-dropdown')));
const text=(section,row)=>church.sections[section].rows[row].blocks[0];
const marks=(section,row,kind)=>text(section,row).hoursMarks
  .filter(mark=>mark.kind===kind).map(mark=>text(section,row).text.slice(mark.start,mark.end));
assert.ok(marks(4,0,'devotional').includes(third.sections[4].rows[0].church),
  'Glory after the Psalms is fully red');
const ali=text(4,1);
const redSpan=ali.hoursMarks.find(m=>m.kind==='devotional');
assert.ok(redSpan && ali.text.slice(redSpan.start,redSpan.end).includes(
  'Аллилуиа, аллилуиа, аллилуиа, слава Тебе Боже.'));
assert.deepEqual(marks(4,1,'repeat'),[' (Трижды)'],
  'Repeat notes retain their explanatory color');
for(const [i,j,num] of [[0,11,'12'],[4,2,'Трижды'],[11,0,'40'],[11,2,'Трижды']]){
 assert.ok(text(i,j).hoursMarks.some(m=>m.kind==='devotional' && m.start===0),
   'Mercy must be red: '+i+'/'+j);
 assert.ok(marks(i,j,'repeat')[0].includes(num));
 assert.ok(text(i,j).className.includes('hours-mercy-left'),'Mercy must align left');
}
assert.deepEqual(marks(7,3,'devotional'),['Слава, и ныне:']);
assert.deepEqual(marks(10,1,'devotional'),['Слава Отцу и Сыну и Святому Духу.']);
assert.deepEqual(marks(10,3,'devotional'),['И ныне и присно и во веки веков. Аминь.']);
assert.deepEqual(text(5,0).hoursMarks,[],'Quotations in comments cannot become red');
assert.deepEqual(text(5,1).hoursMarks,[]);
assert.deepEqual(marks(0,0,'speaker'),['Иерей:']);
assert.deepEqual(marks(0,1,'speaker'),['Чтец:']);
assert.deepEqual(marks(0,9,'speaker'),['Иерей:']);
assert.equal(text(12,0).hoursMarks[0].kind,'initial');
assert.equal(text(12,0).hoursMarks[0].start,0);
for(const i of [1,2,3]) assert.equal(text(i,0).hoursMarks[0].kind,'initial');
assert.equal(text(6,1).className.includes('hours-presentation-placeholder'),true);
assert.equal(text(6,3).className.includes('hours-presentation-rubric-label'),true);
assert.ok(church.sections[7].rows.every(r=>r.blocks.length===1));
assert.ok(church.sections[10].rows.every(r=>r.blocks.length===1));
const both=builder.buildHoursDocument({entry,content,viewMode:MODE.BOTH});
assert.equal(both.sections.length,13);
assert.ok(both.sections.every(s=>s.rows.every(r=>r.blocks.length===1)),
  'No fake Russian parallel translation');
assert.match(both.description,/русск|перевод/i);
const ru=builder.buildHoursDocument({entry,content,viewMode:MODE.RUSSIAN});
const traditional=builder.buildHoursDocument({entry,content,viewMode:MODE.TRADITIONAL});
assert.match(ru.sections[0].rows[0].blocks[0].text,/пока не добавлен/);
assert.match(traditional.sections[0].rows[0].blocks[0].text,/пока не добавлен/);
const css=read('src/components/reader/selectableDocumentReader/styles.js');
assert.match(css,/hours-third-hour[^\n]*\n[\s\S]*?hours-presentation-shared-doxology/);
assert.match(css,/hours-third-hour\.hours-collapsible \.hours-accordion-toggle/);
assert.match(css,/hours-divider-after-dropdown/);
console.log('PASS: Third Hour CS offline, Psalms 16/24/50, two dropdowns, rubrics, colors and honest missing translations');