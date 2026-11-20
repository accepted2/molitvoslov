#!/usr/bin/env node
'use strict';
// Confirm screenshot-specific Third Hour edits on the REAL hoursDocument
// renderer. Source text and all previous row IDs must remain untouched.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=rel=>fs.readFileSync(path.resolve(__dirname,'..',rel),'utf8');
const third=JSON.parse(read('src/data/hoursThirdHourEditorial.json').replace(/^\uFEFF/u,''));
const first=JSON.parse(read('src/data/hoursFirstHourEditorial.json'));
const source=JSON.parse(read('src/data/hoursTexts.json'));
const marker='MOLITVOSLOV_THIRD_HOUR_AMEN_GLORY_SPLIT_V1';
assert.equal(third.displayCorrectionsVersion,marker);
assert.equal(third.entryId,'ordinary-3');
assert.equal(third.sections.length,13);
assert.equal(third.sections[0].rows.length,16,
 'Do not insert a source row: all historical saved row anchors must remain stable');
assert.equal(third.sections[0].rows[1].church,
 'Чтец: Аминь. Слава Тебе, Боже наш, слава Тебе.',
 'Original prayer must remain letter-for-letter unchanged in the offline catalog');
assert.equal(third.sections[0].rows[1].displaySplitAfter,'Чтец: Аминь.');
assert.equal(third.sections[8].rows[0].dividerAfter,undefined,
 'Prevent doubling the border before Trisagion');
assert.equal(third.sections[9].rows[0].dividerAfter,undefined,
 'The Trisagion and Kondak labels should not have a rule between them');
assert.equal(third.sections[9].noBottomDivider,true,
 'The Kondak caption should connect directly to the optional disclosure');
assert.equal(third.sections[11].dividerBefore,undefined,
 'Dropdown closing border is enough before Господи, помилуй (40)');
assert.equal(third.sections[4].rows[2].dividerAfter,undefined,
 'No double rule after the Psalm responses');
assert.deepEqual(third.sections.filter(s=>s.collapsible).map(s=>s.accordionId),
 ['third-hour-lent-tropar','third-hour-fasting-kontakia']);
assert.deepEqual(third.sections.slice(1,4).map(s=>s.title),
 ['Псалом 16','Псалом 24','Псалом 50']);
assert.deepEqual(third.sections[5].rows,first.afterPsalms[1].rows,
 'The common First Hour troparia instructions must remain unchanged');
const cleanSource=JSON.stringify(third.sections.map(s=>s.rows.map(r=>r.church)));
const typography=new Function(
 read('src/services/hoursTypography.js').replace(/\bexport const /g,'const ') +
 '\nreturn {classifyHoursSection,classifyHoursRow,collectHoursTextMarks};'
)();
const docCode=read('src/services/hoursDocument.js');
assert(docCode.includes(marker),
 'Display split must be in the actual Hours document builder');
const build=new Function(
 'hoursTexts','thirdHourChurch','firstHourTraditional','READER_LANGUAGE_MODES',
 'buildReaderLanguageOptions','classifyHoursRow','classifyHoursSection',
 'collectHoursTextMarks','getEditedFirstHour','getFirstHourRussianSections',
 'pairFirstHourSections',
 docCode.replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*/gm,'')
 .replace(/\bexport const /g,'const ') +
 '\nreturn {buildHoursDocument,getOfflineHoursText};'
)(source,third,{sections:[]},
 {CHURCH:'church',RUSSIAN:'russian',BOTH:'both',TRADITIONAL:'traditional'},
 ()=>[{key:'church'},{key:'russian'},{key:'both'},{key:'traditional'}],
 typography.classifyHoursRow,typography.classifyHoursSection,
 typography.collectHoursTextMarks,()=>({applied:false}),()=>[],()=>null);
const entry={id:'ordinary-3',groupId:'ordinary',title:'Третий час',sourceId:910002};
const church=build.buildHoursDocument({
 entry,content:build.getOfflineHoursText(entry.id),viewMode:'church'
});
const rows=church.sections[0].rows;
assert.equal(rows.length,17,
 'Only the reader has one additional visual row; offline text stays 16 rows');
assert.deepEqual(rows.slice(0,4).map(r=>r.blocks[0].text),[
 'Иерей: Благословен Бог наш, всегда, ныне и присно, и во веки веков.',
 'Чтец: Аминь.',
 'Слава Тебе, Боже наш, слава Тебе.',
 'Царю Небесный, Утешителю, Душе истины, Иже везде сый и вся исполняяй, Сокровище благих и жизни Подателю: прииди и вселися в ны, и очисти ны от всякия скверны, и спаси, Блаже, души наша.',
]);
assert.equal(rows[1].dividerAfter,true,
 'The reader Amen gets its own separator below it');
assert.equal(rows[2].dividerAfter,true,
 'The subsequent Slava response keeps the original separator after it');
assert.equal(rows[1].blocks[0].id,10021,
 'The original Chtec reader row keeps its bookmark ID');
assert.equal(rows[2].blocks[0].id,10026,
 'The new Slava response has a fresh distinct bookmark ID');
assert.equal(rows[3].blocks[0].id,10031,
 'The following Tsaryu Nebesnyi prayer keeps its original bookmark ID');
assert.equal(rows[16].blocks[0].id,10161,
 'The final opening prostration verse keeps its original bookmark ID');
const marks=(rowIndex)=>rows[rowIndex].blocks[0].hoursMarks.map(mark=>({
 kind:mark.kind,
 text:rows[rowIndex].blocks[0].text.slice(mark.start,mark.end)
}));
assert.deepEqual(marks(1),[{kind:'speaker',text:'Чтец:'}],
 'Only the speaker cue in Chtec Amen should be red');
assert(marks(2).some(m=>m.kind==='initial'&&m.text==='С'),
 'Slava Tebe begins its own prayer with a red initial');
assert(rows[3].blocks[0].hoursMarks.some(m=>m.kind==='initial'),
 'Next opening prayer still has its red first letter');
assert.equal(church.sections[8].rows[0].dividerAfter,false,
 'No duplicate border on the last prayer row');
assert.equal(church.sections[9].rows[0].dividerAfter,false,
 'No line between Trisagion and Kondak caption');
assert(!church.sections[11].className.includes('hours-divider-before'),
 'No second line under the optional fasting dropdown');
assert(church.sections[10].className.includes('hours-divider-after-dropdown'),
 'One original line at the end of the optional dropdown is retained');
assert.equal(JSON.stringify(third.sections.map(s=>s.rows.map(r=>r.church))),cleanSource,
 'Rendering must not mutate any prayer source');
const both=build.buildHoursDocument({entry,content:third,viewMode:'both'});
assert.equal(both.sections[0].rows.length,17);
assert(both.sections.every(s=>s.rows.every(r=>r.blocks.length===1)),
 'No fabricated Russian translation in combined mode');
const rus=build.buildHoursDocument({entry,content:third,viewMode:'russian'});
assert.equal(rus.sections[0].rows.length,1,
 'RU mode still shows its honest missing translation notice');
const firstHour={id:'ordinary-1',groupId:'ordinary',title:'Первый час',sourceId:910001};
assert(!docCode.includes("isFirstHour && sectionIndex === 0 && rowIndex === 1"),
 'Split must be scoped ONLY to Third Hour');
console.log('PASS: separate Chtec Amin and Slava Tebe paragraphs with a real separator');
console.log('PASS: no duplicate borders around Trisagion, Kondak or Господи помилуй (40)');
console.log('PASS: stable existing row IDs, bookmarks, opening initials and speaker rubrics');
console.log('PASS: full original Hour 3 corpus, First Hour and missing translations unchanged');
