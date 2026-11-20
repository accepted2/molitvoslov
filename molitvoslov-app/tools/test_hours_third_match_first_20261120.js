#!/usr/bin/env node
'use strict';
// Regress Third Hour against the real First Hour's hoursDocument renderer:
// unchanged Psalms 16/24/50, two optional sequences, red accents, speaker
// cues, left-aligned counts, line/section dividers and compact Bogorodichen.
// No source prayer text or user data is modified.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const read=rel=>fs.readFileSync(path.resolve(__dirname,'..',rel),'utf8');
const third=JSON.parse(read('src/data/hoursThirdHourEditorial.json').replace(/^\uFEFF/u,''));
const first=JSON.parse(read('src/data/hoursFirstHourEditorial.json').replace(/^\uFEFF/u,''));
const hours=JSON.parse(read('src/data/hoursTexts.json'));
const css=read('src/components/reader/selectableDocumentReader/styles.js');
const doc=read('src/services/hoursDocument.js');
const marker='MOLITVOSLOV_THIRD_HOUR_FIRST_HOUR_PRESENTATION_20261120_V1';
assert.equal(third.entryId,'ordinary-3');
assert.equal(third.presentationVersion,marker);
assert(css.includes(marker));
assert.equal(third.sections.length,13);
assert.deepEqual(third.sections.slice(1,4).map(s=>s.title),
 ['Псалом 16','Псалом 24','Псалом 50']);
assert.deepEqual(third.sections.filter(s=>s.collapsible===true).map(s=>s.accordionId),
 ['third-hour-lent-tropar','third-hour-fasting-kontakia']);
assert.deepEqual(third.sections[5].rows,first.afterPsalms[1].rows,
 'The two troparion instructions must still be identical to First Hour');
assert.deepEqual(third.sections.map(s=>s.rows.length),
 [16,1,1,1,3,2,5,6,1,2,5,8,1]);
for(const idx of [1,2,3]){
 assert(third.sections[idx].rows[0].church.length>900,
  'Complete Psalm must be retained: '+idx);
 assert(third.sections[idx].rows[0].redInitial===true,
  'First letter of Psalm must stay liturgical red');
}
for(const i of [13,14]){
 assert(third.sections[0].rows[i].church.startsWith('Приидите, поклонимся'),
  'Opening prostration verses changed unexpectedly');
 assert(third.sections[0].rows[i].compactAfter===true,
  'Opening prostration verses should be grouped as in First Hour');
}
assert.equal(third.sections[4].rows[2].dividerAfter,undefined,
 'No final double-rule after post-Psalm mercy');
assert.equal(third.sections[6].rows[3].church,'Богородичен:');
assert.equal(third.sections[6].rows[3].compactAfter,true,
 'Bogorodichen hymn title must touch its prayer');
assert.equal(third.sections[7].rows[4].church,'Богородичен:');
assert.equal(third.sections[7].rows[4].compactAfter,true,
 'Bogorodichen Lenten title must touch its prayer');
assert.equal(third.sections[9].noBottomDivider,true,
 'Trisagion rubric must meet following disclosure without a double line');
assert.equal(third.sections[11].dividerBefore,true,
 'Final hours prayers begin after one editorial divider');
assert.equal(third.sections[11].rows[7].dividerAfter,undefined,
 'Mardarius heading must not follow two separators');
assert(third.sections[12].rows[0].church.startsWith('Владыко Боже, Отче Вседержителю'),
 'Mardarius prayer text missing');
assert.equal(hours.entries?.['ordinary-3'],undefined,
 'Do not overwrite imported hours text or create conflicting Third Hour');
assert(/\.rule-item\.hours-third-hour\.hours-section-opening\s*\.reader-text\.hours-prose\s*\{[\s\S]*?text-align:\s*justify\s*!important/u.test(css),
 'Third Hour main prayers must be justified like the First Hour');
assert(/\.rule-item\.hours-third-hour\.hours-section-opening\s*\.reader-text\.hours-dialogue,/u.test(css),
 'Priest and reader cues should keep their left alignment');
assert(/\.rule-item\.hours-third-hour \.reader-row\.hours-row-compact-after/u.test(css),
 'Third Hour compact Bogorodichen rows must render');
assert(/\.rule-item\.hours-section \.reader-text\.hours-text/u.test(css),
 'Shared First/Third Hour typography is still available');
assert(/hours-divider-after-dropdown/u.test(css),
 'Disclosure sections must retain the First Hour separators');
assert(doc.includes("isThirdHour ? 'hours-third-hour' : ''"),
 'Third Hour-specific styles must actually be wired into the document');
const typography=new Function(read('src/services/hoursTypography.js')
 .replace(/\bexport const /g,'const ') +
 '\nreturn {classifyHoursRow,classifyHoursSection,collectHoursTextMarks};')();
const MODE={CHURCH:'church',RUSSIAN:'russian',BOTH:'both',TRADITIONAL:'traditional'};
const options=()=>[{key:'church'},{key:'russian'},{key:'both'},{key:'traditional'}];
const docCode=doc.replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*/gm,'')
 .replace(/\bexport const /g,'const ');
const fn=new Function(
 'hoursTexts','thirdHourChurch','firstHourTraditional','READER_LANGUAGE_MODES',
 'buildReaderLanguageOptions','classifyHoursRow','classifyHoursSection',
 'collectHoursTextMarks','getEditedFirstHour','getFirstHourRussianSections',
 'pairFirstHourSections',docCode+'\nreturn {buildHoursDocument,getOfflineHoursText};'
)(hours,third,{sections:[]},MODE,options,
 typography.classifyHoursRow,typography.classifyHoursSection,
 typography.collectHoursTextMarks,
 ()=>({applied:false}),()=>[],()=>null);
const entry={id:'ordinary-3',groupId:'ordinary',title:'Третий час',sourceId:910002};
const before=JSON.stringify(third);
const rendered=fn.buildHoursDocument({entry,
 content:fn.getOfflineHoursText(entry.id),viewMode:MODE.CHURCH});
assert.equal(rendered.sections.length,13);
assert(rendered.sections.every(s=>s.className.includes('hours-third-hour')));
const block=(s,r)=>rendered.sections[s].rows[r].blocks[0];
const marks=(s,r)=>block(s,r).hoursMarks.map(m=>
 [m.kind,block(s,r).text.slice(m.start,m.end)]);
assert(marks(0,0).some(x=>x[0]==='speaker'&&x[1]==='Иерей:'),
 'Opening: only priest cue gets rubric red');
assert(marks(0,1).some(x=>x[0]==='speaker'&&x[1]==='Чтец:'),
 'Opening: reader cue gets rubric red');
for(const index of [1,2,3])
 assert(marks(index,0).some(x=>x[0]==='initial'),
  'Each Psalm must retain the red first glyph');
for(const [s,r] of [[0,6],[0,11],[4,2],[11,0],[11,2]])
 assert(block(s,r).className.includes('hours-mercy-left'),
  'Mercy must start from the left: '+s+'/'+r);
for(const [s,r] of [[4,0],[4,1],[4,2],[7,3],[11,3]])
 assert(marks(s,r).some(x=>x[0]==='devotional'),
  'Full shared First Hour doxology must be highlighted: '+s+'/'+r);
for(const index of [6,7,10])
 assert(rendered.sections[index].className.includes('hours-section-'),
  'Preserve normal section heading and body style: '+index);
assert.equal(rendered.sections[6].rows[3].compactAfter,true);
assert.equal(rendered.sections[7].rows[4].compactAfter,true);
assert.equal(rendered.sections[11].className.includes('hours-divider-before'),true);
assert.equal(rendered.sections[9].className.includes('hours-no-bottom-divider'),true);
assert.equal(rendered.sections[7].collapsible,true);
assert.equal(rendered.sections[10].collapsible,true);
const ru=fn.buildHoursDocument({entry,content:third,viewMode:MODE.RUSSIAN});
assert.match(ru.sections[0].rows[0].blocks[0].text,/пока не добавлен/u,
 'Russian-only tab must NOT invent a translation');
const both=fn.buildHoursDocument({entry,content:third,viewMode:MODE.BOTH});
assert(both.sections.every(s=>s.rows.every(r=>r.blocks.length===1)),
 'Combined mode must not invent a second, fake translation column');
assert.equal(JSON.stringify(third),before,'Building the reader must not mutate the source');
console.log('PASS: Third Hour adopts First Hour spacing, dividers and compact Bogorodichen');
console.log('PASS: prayer prose justified, dialogue left, responsive typography inherited');
console.log('PASS: Psalms 16/24/50, red initials, full doxologies and 3/12/40 counts');
console.log('PASS: both fasting disclosures, Mardarius prayer and all source text untouched');
console.log('PASS: no invented translations, no changed bookmarks/text offsets');
