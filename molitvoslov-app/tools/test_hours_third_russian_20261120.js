#!/usr/bin/env node
'use strict';
// Test actual Third Hour data, the First Hour Ephrem reuse and the real
// HoursDocument renderer in CS, RU, CS+RU and unsupported traditional mode.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const app=path.resolve(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(app,relative),'utf8').replace(/^\uFEFF/u,'');
const church=JSON.parse(read('src/data/hoursThirdHourEditorial.json'));
const russian=JSON.parse(read('src/data/hoursThirdHourRussian.json'));
const firstHourRussian=JSON.parse(read('src/data/hoursFirstHourRussian.json'));
const hoursTexts=JSON.parse(read('src/data/hoursTexts.json'));
const docSource=read('src/services/hoursDocument.js');
const helperSource=read('src/services/hoursThirdHourRussian.js');
const styleSource=read('src/components/reader/selectableDocumentReader/styles.js');
const marker='MOLITVOSLOV_THIRD_HOUR_RUSSIAN_FULL_20261120_V1';
assert(docSource.includes(marker)&&styleSource.includes(marker),
 'Apply the third hour Russian patch before running this test');
assert.equal(russian.entryId,'ordinary-3');
assert.equal(russian.language,'russian');
assert.equal(russian.sections.length,13);
assert.deepEqual(russian.sections.map(s=>s.rows.length),
 [16,1,1,1,3,2,5,6,1,2,5,8,1]);
assert(russian.sections.every(s=>s.rows.every(r=>r.russian&&
 typeof r.russian==='string'&&!r.russian.includes('\uFFFD'))));
assert.deepEqual(church.sections.slice(1,4).map(s=>s.title),
 ['Псалом 16','Псалом 24','Псалом 50']);
for(let i=1;i<=3;i++){
 const source=russian.sections[i].rows[0].russian;
 assert(source.length>1100,'Psalm '+i+' is incomplete');
 assert(!source.includes('[...]'),'Psalm '+i+' contains placeholders');
}
assert(russian.sections[1].rows[0].russian.startsWith('Услышь, Господи, правду мою'));
assert(russian.sections[2].rows[0].russian.startsWith('К Тебе, Господи, возвысил я душу мою'));
assert(russian.sections[3].rows[0].russian.startsWith('Помилуй меня, Боже, по великой милости'));
assert.equal(russian.sections[11].rows[7].russian,'Чтец: Аминь.');
assert(russian.sections[12].rows[0].russian.startsWith('Владыка Боже, Отче Вседержитель'));
assert.deepEqual([2,3,5,8].map(i=>russian.sections[0].rows[i].heading),[
 'Молитва Святому Духу','Трисвятое','Молитва Святой Троице','Молитва Господня'
]);
const helper=new Function('thirdHourChurch','thirdHourRussian','firstHourRussian',
 helperSource.replace(/^import .*?;\s*$/gm,'')
 .replace(/\bexport const /g,'const ') +
 '\nreturn {getThirdHourRussianSections,getThirdHourRussianSource};'
)(church,russian,firstHourRussian);
const originals=helper.getThirdHourRussianSections('russian');
const paired=helper.getThirdHourRussianSections('both');
assert.equal(originals.length,14,'Russian third hour + Saint Ephrem accordion');
assert.equal(paired.length,14,'CS+RU retains matching sections + Saint Ephrem');
assert.deepEqual(originals.map(s=>s.originalSectionIndex),
 [0,1,2,3,4,5,6,7,9,10,8,11,13,12],
 'User-provided order: Господь Бог благословен follows the fasting tropares');
assert.deepEqual(paired.map(s=>s.originalSectionIndex),
 [0,1,2,3,4,5,6,7,8,9,10,11,13,12],
 'CS+RU follows the Church Slavonic sequence and shares pair positions');
const ephrem=firstHourRussian.afterPsalms.find(s=>s.accordionId==='first-hour-ephrem');
assert(ephrem);
assert.equal(originals[12].accordionId,'third-hour-ephrem');
assert.deepEqual(originals[12].rows.map(x=>x.russian),
 ephrem.rows.map(x=>x.russian),
 'Ephrem texts copied from the actual first hour without rewritten wording');
assert.notEqual(originals[12].rows[1],ephrem.rows[1],
 'The Third Hour receives a clone, not a mutating reference');
const typography=new Function(read('src/services/hoursTypography.js')
 .replace(/\bexport const /g,'const ') +
 '\nreturn {classifyHoursRow,classifyHoursSection,collectHoursTextMarks};')();
const MODE={CHURCH:'church',RUSSIAN:'russian',BOTH:'both',TRADITIONAL:'traditional'};
const builder=new Function(
 'hoursTexts','thirdHourChurch','firstHourTraditional','READER_LANGUAGE_MODES',
 'buildReaderLanguageOptions','classifyHoursRow','classifyHoursSection',
 'collectHoursTextMarks','getEditedFirstHour','getFirstHourRussianSections',
 'pairFirstHourSections','getThirdHourRussianSections',
 docSource.replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*/gm,'')
 .replace(/\bexport const /g,'const ')+
 '\nreturn {buildHoursDocument,getOfflineHoursText};'
)(hoursTexts,church,{sections:[]},MODE,
 ()=>[{key:'church'},{key:'russian'},{key:'both'},{key:'traditional'}],
 typography.classifyHoursRow,typography.classifyHoursSection,
 typography.collectHoursTextMarks,()=>({applied:false}),()=>[],()=>null,
 helper.getThirdHourRussianSections);
const entry={id:'ordinary-3',groupId:'ordinary',title:'Третий час',sourceId:910002};
assert.equal(builder.getOfflineHoursText(entry.id),church,
 'Canonical Church Slavonic Third Hour stays the same object');
const originalChurch=JSON.stringify(church);
const originalRussian=JSON.stringify(russian);
const cs=builder.buildHoursDocument({entry,content:church,viewMode:MODE.CHURCH});
const ru=builder.buildHoursDocument({entry,content:church,viewMode:MODE.RUSSIAN});
const both=builder.buildHoursDocument({entry,content:church,viewMode:MODE.BOTH});
const trad=builder.buildHoursDocument({entry,content:church,viewMode:MODE.TRADITIONAL});
assert.equal(cs.sections.length,13,'Old CS version unchanged');
assert.equal(ru.sections.length,14,'Full RU edition visible');
assert.equal(both.sections.length,14,'CS+RU pairs all available rows');
assert.equal(ru.available.hasRussian,true);
assert.equal(both.available.hasRussian,true);
assert.equal(ru.description,'','Russian edition must not show missing-translation warnings');
assert.equal(both.description,'','All church rows have authentic paired Russian texts');
assert.equal(ru.sections[0].rows.length,17,'RU Amen / Glory is visually split');
assert.equal(cs.sections[0].rows.length,17,'Previously fixed CS Amen / Glory is preserved');
assert.equal(both.sections[0].rows.length,17,'CS+RU Amen / Glory is visually split');
assert.equal(ru.sections[0].rows[0].blocks[0].text,
 'Священник: Благословен Бог наш всегда, ныне и присно, и во веки веков.');
assert.equal(ru.sections[0].rows[1].blocks[0].text,'Чтец: Аминь.');
assert.equal(ru.sections[0].rows[2].blocks[0].text,'Слава Тебе, Боже наш, слава Тебе.');
assert.equal(ru.sections[0].rows[1].dividerAfter,true);
assert.equal(ru.sections[0].rows[2].dividerAfter,true);
assert.equal(ru.sections[0].rows[1].blocks[0].id,10022);
assert.equal(ru.sections[0].rows[2].blocks[0].id,10027);
assert.equal(cs.sections[0].rows[1].blocks[0].id,10021);
assert.equal(cs.sections[0].rows[2].blocks[0].id,10026);
assert.equal(both.sections[0].rows[1].layout,'parallel');
assert.equal(both.sections[0].rows[1].blocks.length,2);
assert.equal(both.sections[0].rows[2].blocks.length,2);
for(const [index,title] of [[3,'Молитва Святому Духу'],
 [4,'Трисвятое'],[6,'Молитва Святой Троице'],[9,'Молитва Господня']])
 assert.equal(ru.sections[0].rows[index].sharedTitle,title,
  'Russian inline rubric '+title);
assert.equal(ru.sections[1].rows[0].blocks[0].text,
 russian.sections[1].rows[0].russian);
assert.equal(ru.sections[2].rows[0].blocks[0].text,
 russian.sections[2].rows[0].russian);
assert.equal(ru.sections[3].rows[0].blocks[0].text,
 russian.sections[3].rows[0].russian);
assert.deepEqual(ru.sections.slice(1,4).map(s=>s.title),
 ['Псалом 16','Псалом 24','Псалом 50']);
assert.equal(ru.sections[10].rows[0].blocks[0].text,
 russian.sections[8].rows[0].russian,
 'Blessing after optional troparia in Russian reading order');
assert.equal(ru.sections[10].rows[0].blocks[0].id,90012,
 'The blessing retains its original stable bookmark id');
assert.equal(ru.sections[12].accordionId,'third-hour-ephrem');
assert.equal(ru.sections[12].collapsible,true);
assert.equal(ru.sections[12].rows[1].blocks[0].text,
 ephrem.rows[1].russian);
assert.equal(ru.sections[13].title,'Молитва святого Мардария');
assert.equal(ru.sections[13].rows[0].blocks[0].text,
 russian.sections[12].rows[0].russian);
assert(both.sections[1].rows[0].blocks.length===2,
 'Russian and Church Slavonic Psalms pair correctly');
assert(both.sections[1].rows[0].blocks[0].text.startsWith('Услыши, Господи'));
assert(both.sections[1].rows[0].blocks[1].text.startsWith('Услышь, Господи'));
assert.equal(both.sections[12].accordionId,'third-hour-ephrem');
assert.equal(both.sections[12].rows[1].blocks.length,1,
 'Ephrem remains one Russian prayer, not a fabricated CS text');
assert.equal(trad.sections[0].rows[0].blocks[0].text.includes('пока не добавлен'),true,
 'Unprovided traditional text must stay unavailable');
assert.equal(JSON.stringify(church),originalChurch,'Church Slavonic text mutation');
assert.equal(JSON.stringify(russian),originalRussian,'Russian source text mutation');
const introMark=ru.sections[0].rows[0].blocks[0].hoursMarks[0];
assert.equal(introMark.kind,'speaker','Russian priest cue remains liturgical red');
const psalmMark=ru.sections[1].rows[0].blocks[0].hoursMarks[0];
assert.equal(psalmMark.kind,'initial','Russian psalms get first-letter red');
assert(ru.sections[0].rows[7].blocks[0].hoursMarks.some(m=>
 m.kind==='devotional'),'Russian full Glory doxology red');
assert(ru.sections[0].rows[6].blocks[0].hoursMarks.some(m=>
 m.kind==='repeat'),'Russian short mercy repeat marker separated');
assert(ru.sections[11].rows[0].blocks[0].hoursMarks.some(m=>
 m.kind==='repeat'),'40 mercies use separate count');
console.log('PASS: 52 full Russian rows, complete Psalms 16/24/50 and four heading captions');
console.log('PASS: RU, CS and CS+RU tabs, paired Psalm columns and bilingual Amen/Glory separator');
console.log('PASS: user Russian order, stable bookmarks, liturgical red accents and rubrics');
console.log('PASS: Saint Ephrem dropdown reused exactly from First Hour');
console.log('PASS: CS text, source JSON, traditional missing notice and reader offsets unchanged');
