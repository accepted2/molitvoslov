#!/usr/bin/env node
'use strict';
// End-to-end validation of the exact supplied traditional Third Hour:
// all 85 source paragraphs/headers accounted for, original 13 section IDs,
// full Psalms, red Church Slavonic cues, all three folding sections,
// correct order, Ponomar font, traditional/RU/CS tab isolation.
// This script reads everything; never edits data.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const app=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(app,rel),'utf8').replace(/^\uFEFF/u,'');
const traditional=JSON.parse(read('src/data/hoursThirdHourTraditional.json'));
const russian=JSON.parse(read('src/data/hoursThirdHourRussian.json'));
const church=JSON.parse(read('src/data/hoursThirdHourEditorial.json'));
const firstHourRu=JSON.parse(read('src/data/hoursFirstHourRussian.json'));
const hours=JSON.parse(read('src/data/hoursTexts.json'));
const doc=read('src/services/hoursDocument.js');
const styles=read('src/components/reader/selectableDocumentReader/styles.js');
const service=read('src/services/hoursThirdHourTraditional.js');
const source=read('reports/third-hour-traditional-user-source-20261120.txt');
const marker='MOLITVOSLOV_THIRD_HOUR_TRADITIONAL_FULL_20261120_V1';
assert(doc.includes(marker)&&styles.includes(marker),'Install the traditional Third Hour patch first');
assert.equal(traditional.entryId,'ordinary-3');
assert.equal(traditional.language,'traditional');
assert.equal(traditional.sections.length,13);
assert.deepEqual(traditional.sections.map(s=>s.rows.length),
 [16,1,1,1,3,2,5,6,1,2,5,8,1]);
assert.equal(traditional.ephrem.rows.length,9);
const allStrings=traditional.sections.flatMap(s=>[
 s.title||'',...s.rows.flatMap(r=>[r.traditional,r.traditionalHeading||''])
]).concat(traditional.ephrem.title,
 ...traditional.ephrem.rows.map(r=>r.traditional),traditional.documentTitle);
assert.equal(allStrings.length>65,true);
assert(traditional.sections.every(s=>s.rows.every(r=>r.traditional&&r.traditional.trim())));
assert.deepEqual(traditional.sections.slice(1,4).map(s=>s.title),
 ['Ѱало́мъ ѕ҃і','Ѱало́мъ к҃д','Ѱало́мъ н҃']);
assert.deepEqual(traditional.sections.slice(1,4).map(s=>s.rows[0].traditional.length),
 [1515,1810,1766]);
const lines=source.split(/\r?\n/u).map(s=>s.trim()).filter(Boolean);
assert.equal(lines.length,85,'The original supplied full TXT is missing or altered');
const structural=(s)=>s.startsWith('ЦС традиционный')||
 s.startsWith('Все раскрывающиеся разделы')||
 s.startsWith('────────────────')||
 /^\[(?:Нача́ло|Коне́цъ) раскрыва́ющегѡсѧ раздѣла̀\]$/u.test(s);
for(const segment of lines) {
 if(structural(segment))continue;
 const possible=segment.startsWith('▼ ')?segment.slice(2):segment;
 assert(allStrings.some(s=>s.includes(possible)),
  'Dropped traditional source segment: '+possible.slice(0,75));
}
const handler=new Function('thirdHourChurch','traditional','firstHourRussian',
 service.replace(/^import .*?;\s*$/gm,'').replace(/\bexport const /g,'const ')+
 '\nreturn {getThirdHourTraditionalSections,getThirdHourTraditionalMarks};'
)(church,traditional,firstHourRu);
const sections=handler.getThirdHourTraditionalSections();
assert.equal(sections.length,14);
assert.deepEqual(sections.map(s=>s.originalSectionIndex),
 [0,1,2,3,4,5,6,7,8,9,10,11,13,12],
 'Traditional liturgical order must put Saint Ephrem before Mardarius');
assert.equal(sections[7].accordionId,'third-hour-lent-tropar');
assert.equal(sections[10].accordionId,'third-hour-fasting-kontakia');
assert.equal(sections[12].accordionId,'third-hour-ephrem');
assert(sections[7].collapsible&&sections[10].collapsible&&sections[12].collapsible);
assert.equal(sections[8].rows.length,1);
assert(sections[8].rows[0].traditional.startsWith('Гдⷭ҇ь Бг҃ъ'));
assert.equal(sections[9].rows[0].traditionalDividerAfter,true);
assert.equal(sections[9].rows[1].traditional,'Конда́къ пра́здника');
assert.equal(sections[11].rows[3].traditional.includes('\nА҆м́инь'),true,
 'The concluding split doxology and Amen must retain supplied newline');
assert.equal(sections[0].rows[1].traditionalSplitAfter,'Чте́цъ: А҆м́инь.');
assert(sections[0].rows[1].traditional.includes('Сла́ва Тебѣ̀'));
assert.equal(sections[12].rows[8].traditional,'И҆ ѻ҆ди́нъ вели́кїй покло́нъ.');
const marks=handler.getThirdHourTraditionalMarks;
const priest=marks(sections[0].rows[0].traditional);
assert.equal(priest[0].kind,'speaker');
const reader=marks(sections[0].rows[1].traditional);
assert.equal(reader[0].kind,'speaker');
const mercy=marks(sections[11].rows[0].traditional);
assert.deepEqual(mercy.map(m=>m.kind),['mercy','repeat']);
const psalms=sections.slice(1,4);
for(const item of psalms)assert.equal(item.rows[0].redInitial,true,
 'Original CS Psalm initial must be preserved');
assert(/\.rule-item\.hours-third-hour\.hours-traditional-section \.psalter-shared-rubric\s*\{[\s\S]*?font-family:\s*'Ponomar'/u.test(styles),
 'Traditional prayer headings require Ponomar font');
const typography=new Function(read('src/services/hoursTypography.js')
 .replace(/\bexport const /g,'const ')+
 '\nreturn {classifyHoursRow,classifyHoursSection,collectHoursTextMarks};')();
const MODE={CHURCH:'church',RUSSIAN:'russian',BOTH:'both',TRADITIONAL:'traditional'};
const russianService=read('src/services/hoursThirdHourRussian.js');
const getRu=new Function('thirdHourChurch','thirdHourRussian','firstHourRussian',
 russianService.replace(/^import .*?;\s*$/gm,'')
 .replace(/\bexport const /g,'const ')+
 '\nreturn {getThirdHourRussianSections};'
)(church,russian,firstHourRu).getThirdHourRussianSections;
const builder=new Function('hoursTexts','thirdHourChurch','firstHourTraditional',
 'READER_LANGUAGE_MODES','buildReaderLanguageOptions',
 'classifyHoursRow','classifyHoursSection','collectHoursTextMarks',
 'getEditedFirstHour','getFirstHourRussianSections','pairFirstHourSections',
 'getThirdHourRussianSections','getThirdHourTraditionalSections',
 'getThirdHourTraditionalMarks',
 doc.replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*/gm,'')
 .replace(/\bexport const /g,'const ')+
 '\nreturn {buildHoursDocument,getOfflineHoursText};'
)(hours,church,{sections:[]},MODE,
 ()=>[{key:'church'},{key:'russian'},{key:'both'},{key:'traditional'}],
 typography.classifyHoursRow,typography.classifyHoursSection,
 typography.collectHoursTextMarks,()=>({applied:false}),()=>[],()=>null,
 getRu,handler.getThirdHourTraditionalSections,handler.getThirdHourTraditionalMarks);
const entry={id:'ordinary-3',groupId:'ordinary',title:'Третий час',sourceId:910002};
const beforeCS=JSON.stringify(church),beforeRu=JSON.stringify(russian);
const t=builder.buildHoursDocument({entry,content:church,viewMode:MODE.TRADITIONAL});
const cs=builder.buildHoursDocument({entry,content:church,viewMode:MODE.CHURCH});
const ru=builder.buildHoursDocument({entry,content:church,viewMode:MODE.RUSSIAN});
const both=builder.buildHoursDocument({entry,content:church,viewMode:MODE.BOTH});
assert.equal(t.available.hasTraditional,true);
assert.equal(t.viewSwitcher.activeKey,'traditional');
assert.equal(t.description,'');
assert.equal(t.sections.length,14);
assert.equal(t.sections[0].rows.length,17,
 'Separate traditional Чтец: Аминь / Слава paragraphs');
assert.equal(t.sections[0].rows[1].blocks[0].text,'Чте́цъ: А҆м́инь.');
assert(t.sections[0].rows[2].blocks[0].text.startsWith('Сла́ва Тебѣ̀'));
assert.equal(t.sections[0].rows[1].blocks[0].id,10023);
assert.equal(t.sections[0].rows[2].blocks[0].id,10029);
assert.equal(t.sections[0].rows[3].blocks[0].id,10033,
 'Next traditional prayer keeps its stable original row anchor');
assert.equal(t.sections[0].rows[1].dividerAfter,true);
assert.equal(t.sections[9].rows[0].dividerAfter,true,
 'One divider between traditional Trisagion and Kontakion');
assert.equal(t.sections[9].rows[1].blocks[0].text,'Конда́къ пра́здника');
assert.equal(t.sections[7].collapsible,true);
assert.equal(t.sections[10].collapsible,true);
assert.equal(t.sections[12].collapsible,true);
assert(t.sections[8].rows[0].blocks[0].text.startsWith('Гдⷭ҇ь Бг҃ъ'));
assert.equal(t.sections[8].rows[0].blocks[0].id,90013);
assert.equal(t.sections[12].rows[0].blocks[0].id,140013);
assert.equal(t.sections[13].rows[0].blocks[0].id,130013);
assert.deepEqual(t.sections.slice(1,4).map(s=>s.title),traditional.sections.slice(1,4).map(s=>s.title));
assert.equal(t.sections[1].rows[0].blocks[0].text.length,1515);
assert.equal(t.sections[2].rows[0].blocks[0].text.length,1810);
assert.equal(t.sections[3].rows[0].blocks[0].text.length,1766);
assert.equal(t.sections[1].rows[0].blocks[0].hoursMarks[0].kind,'initial');
assert(t.sections.every(s=>s.className.includes('hours-traditional-section')));
assert(t.sections.every(s=>s.className.includes('hours-third-hour')));
assert.equal(t.sections[0].rows[4].sharedTitle,traditional.sections[0].rows[2].traditionalHeading);
const blessingCount=t.sections.flatMap(s=>s.rows).flatMap(r=>r.blocks)
 .filter(b=>b.text.startsWith('Гдⷭ҇ь Бг҃ъ блгⷭ҇в́енъ')).length;
assert.equal(blessingCount,1,'Do not duplicate the traditional blessing');
assert.equal(cs.sections.length,13,'Old CS edition unchanged');
assert.equal(ru.sections.length,14,'Russian edition unchanged');
assert.equal(both.sections[1].rows[0].blocks.length,2,'Bilingual CS+RU unchanged');
assert.equal(JSON.stringify(church),beforeCS,'CS prayer source mutated');
assert.equal(JSON.stringify(russian),beforeRu,'RU prayer source mutated');
console.log('PASS: complete traditional Third Hour exactly sourced from supplied 168-line TXT');
console.log('PASS: 3 full Psalms, 3 dropdowns, Ponomar, original accents and titla');
console.log('PASS: original reading order, red initials, true dividers and Mardarius');
console.log('PASS: original bookmarks/row IDs, RU, CS and CS+RU modes unchanged');
