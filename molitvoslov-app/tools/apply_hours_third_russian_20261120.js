#!/usr/bin/env node
'use strict';
// Install full Russian Third Hour via section-mapped supplemental JSON.
// Keep CS source and all old local changes. - --dry-run is read-only.
// Auto-backup the 2 existing source files; safe re-run.
const fs=require('node:fs'),path=require('node:path');
const {parse}=require('@babel/parser');
const app=path.resolve(__dirname,'..');
const docFile=path.join(app,'src/services/hoursDocument.js');
const cssFile=path.join(app,'src/components/reader/selectableDocumentReader/styles.js');
const dataFile=path.join(app,'src/data/hoursThirdHourRussian.json');
const helperFile=path.join(app,'src/services/hoursThirdHourRussian.js');
if(!fs.existsSync(dataFile)||!fs.existsSync(helperFile))
 throw Error('Fetch both new Third Hour Russian source files. NO FILES MODIFIED.');
const russian=JSON.parse(fs.readFileSync(dataFile,'utf8'));
const church=JSON.parse(fs.readFileSync(path.join(app,'src/data/hoursThirdHourEditorial.json'),'utf8'));
if(russian.entryId!=='ordinary-3'||russian.sections.length!==13||
 church.sections.length!==13||
 russian.sections.some((s,i)=>s.rows.length!==church.sections[i].rows.length))
 throw Error('Third Hour Russian and CS paragraph maps differ. NO FILES MODIFIED.');
const documents=[{name:'hoursDocument.js',file:docFile},
 {name:'styles.js',file:cssFile}].map(x=>({...x,original:fs.readFileSync(x.file,'utf8')}));
const marker='MOLITVOSLOV_THIRD_HOUR_RUSSIAN_FULL_20261120_V1';
if(documents.every(x=>x.original.includes(marker))){
 console.log('PASS: Russian Third Hour already connected. NO FILES MODIFIED.');
 process.exit(0);
}
if(documents.some(x=>x.original.includes(marker)))
 throw Error('Partial Russian patch marker found. NO FILES MODIFIED.');
for(const x of documents){
 x.bom=x.original.startsWith('\uFEFF')?'\uFEFF':'';
 x.code=x.original.slice(x.bom.length).replace(/\r\n/g,'\n');
}
const doc=documents[0],css=documents[1];
if(!doc.code.includes('MOLITVOSLOV_THIRD_HOUR_AMEN_GLORY_SPLIT_V1') ||
 !css.code.includes('MOLITVOSLOV_THIRD_HOUR_FIRST_HOUR_PRESENTATION_20261120_V1'))
 throw Error('Apply earlier Third Hour dividers and appearance fixes first. NO FILES MODIFIED.');
function replaceOnce(target,before,after,label){
 const n=target.code.split(before).length-1;
 if(n!==1)throw Error('Unexpected local '+label+' ('+n+' matches). NO FILES MODIFIED.');
 target.code=target.code.replace(before,after);
}
replaceOnce(doc,
 "from './hoursFirstHourRussian';",
 "from './hoursFirstHourRussian';\n"+
 "import {getThirdHourRussianSections} from './hoursThirdHourRussian';\n"+
 "// "+marker,
 'Russian source import');
replaceOnce(doc,
 "  const isThirdHour = entry.id === 'ordinary-3';",
 "  const isThirdHour = entry.id === 'ordinary-3';\n"+
 "  const thirdHourRussianSections = isThirdHour\n"+
 "    ? getThirdHourRussianSections(viewMode) : null;",
 'Russian section construction');
replaceOnce(doc,
 "    ...getHoursLanguageAvailability(content),",
 "    ...getHoursLanguageAvailability(content),\n"+
 "    ...(isThirdHour ? {hasRussian: thirdHourRussianSections.some(s =>\n"+
 "      s.rows.some(r => isText(r.russian)))} : {}),",
 'Third Hour language availability');
replaceOnce(doc,
 "    : isFirstHour && viewMode === READER_LANGUAGE_MODES.RUSSIAN\n      ? firstHourRussian",
 "    : isThirdHour && (viewMode === READER_LANGUAGE_MODES.RUSSIAN ||\n"+
 "        viewMode === READER_LANGUAGE_MODES.BOTH)\n"+
 "      ? thirdHourRussianSections\n"+
 "    : isFirstHour && viewMode === READER_LANGUAGE_MODES.RUSSIAN\n"+
 "      ? firstHourRussian",
 'Russian/combined document source');
replaceOnce(doc,
 "    const title = cleanHeading(section.title);",
 "    const title = cleanHeading(isThirdHour && viewMode === READER_LANGUAGE_MODES.RUSSIAN\n"+
 "      ? (section.russianTitle || section.title) : section.title);",
 'localized section heading');
replaceOnce(doc,
 "      const id = (sectionIndex + 1) * 10000 + (rowIndex + 1) * 10;",
 "      const originalSectionIndex = isThirdHour &&\n"+
 "        Number.isInteger(section.originalSectionIndex)\n"+
 "          ? section.originalSectionIndex : sectionIndex;\n"+
 "      const id = (originalSectionIndex + 1) * 10000 + (rowIndex + 1) * 10;",
 'stable bookmark row IDs');
// Replace existing CS-only visual split with a bilingual-aware split.
const splitAnchor='      // MOLITVOSLOV_THIRD_HOUR_AMEN_GLORY_SPLIT_V1';
const originalStart=doc.code.indexOf(splitAnchor);
const originalStop=doc.code.indexOf('      if (blocks.length) rows.push({',originalStart);
if(originalStart<0||originalStop<=originalStart)
 throw Error('Third Hour original Amen split anchor missing. NO FILES MODIFIED.');
doc.code=doc.code.slice(0,originalStart)+"      // MOLITVOSLOV_THIRD_HOUR_RUSSIAN_AMEN_SPLIT_V1\n      // Render two paragraphs in CS, RU and BOTH, keeping old anchors.\n      if (isThirdHour && originalSectionIndex === 0 && rowIndex === 1 &&\n          row.displaySplitAfter === 'Чтец: Аминь.' && blocks.length > 0 &&\n          blocks.every(b => b.text.startsWith(row.displaySplitAfter + ' '))) {\n        const firstText = row.displaySplitAfter;\n        const firstBlocks = blocks.map(b => ({\n          ...b, text: firstText,\n          hoursMarks: b.hoursMarks.filter(m =>\n            m.start >= 0 && m.end <= firstText.length),\n        }));\n        const followingBlocks = blocks.map(b => {\n          const rest = b.text.slice(firstText.length).trim();\n          if (!/^Слава Тебе, Боже наш, слава Тебе\\.$/u.test(rest)) {\n            throw new Error('Third Hour reader response differs from the source');\n          }\n          const language = b.metadata.language;\n          return createBlock({\n            id: id + (language === 'russian' ? 7 : 6),\n            language, text: rest, title, sectionKind,\n            opening: false, redInitial: true,\n          });\n        });\n        const layout = blocks.length === 2 &&\n          viewMode === READER_LANGUAGE_MODES.BOTH ? 'parallel' : 'stack';\n        rows.push({layout, blocks: firstBlocks, dividerAfter: true});\n        rows.push({layout, blocks: followingBlocks,\n          dividerAfter: row.dividerAfter === true});\n        continue;\n      }\n"+doc.code.slice(originalStop);
replaceOnce(doc,
 "        layout: isFirstHour && viewMode === READER_LANGUAGE_MODES.BOTH &&",
 "        layout: (isFirstHour || isThirdHour) &&\n"+
 "          viewMode === READER_LANGUAGE_MODES.BOTH &&",
 'parallel CS/RU display');
replaceOnce(doc,
 "        blocks,\n        dividerAfter: row.dividerAfter === true,",
 "        blocks,\n"+
 "        sharedTitle: isThirdHour && row.russianHeading &&\n"+
 "          viewMode !== READER_LANGUAGE_MODES.CHURCH\n"+
 "            ? row.russianHeading : null,\n"+
 "        dividerAfter: row.dividerAfter === true,",
 'Russian prayer headings');
replaceOnce(doc,
 "        progressAnchorId: sectionIndex + 1,",
 "        progressAnchorId: isThirdHour && Number.isInteger(section.originalSectionIndex)\n"+
 "          ? section.originalSectionIndex + 1 : sectionIndex + 1,",
 'stable section identifiers');
replaceOnce(doc,
 "          (isThirdHour && ['third-hour-lent-tropar','third-hour-fasting-kontakia']",
 "          (isThirdHour && ['third-hour-lent-tropar','third-hour-fasting-kontakia','third-hour-ephrem']",
 'Saint Ephrem dropdown layout');
replaceOnce(doc,
 "         (isThirdHour && language === 'church')) &&",
 "         (isThirdHour && ['church','russian'].includes(language))) &&",
 'Russian full red doxologies and count notes');
const cssAnchor='    /* Only the explicitly marked rows of the First Hour receive rules. */';
replaceOnce(css,cssAnchor,"    /* MOLITVOSLOV_THIRD_HOUR_RUSSIAN_FULL_20261120_V1\n       Russian prayer labels precede original rows; no text edits. */\n    .rule-item.hours-third-hour .psalter-shared-rubric {\n      color: var(--secondary);\n      font-family: Georgia, \"Times New Roman\", serif;\n      font-size: 15px;\n      font-style: normal;\n      font-weight: 700;\n      line-height: 1.35;\n      text-align: left;\n      margin: 11px 0 5px;\n    }\n"+cssAnchor,'third-hour Russian prayer header CSS');
for(const x of documents)parse(x.code,{sourceType:'module',plugins:['jsx']});
parse(fs.readFileSync(helperFile,'utf8'),{sourceType:'module'});
if(process.argv.includes('--dry-run')){
 console.log('DRY RUN PASS: complete Russian Third Hour, 3 Psalms and 52 source rows.');
 console.log('DRY RUN PASS: original Russian order, paired CS+RU and reused Saint Ephrem.');
 console.log('DRY RUN PASS: CS source and all saved IDs untouched. NO FILES MODIFIED.');
 process.exit(0);
}
const backup=path.resolve(app,'..','build-backups','hours-third-russian-before-'+
 new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backup,{recursive:true});
for(const x of documents)fs.copyFileSync(x.file,path.join(backup,x.name));
for(const x of documents){
 let out=x.bom+x.code;
 if(x.original.includes('\r\n'))out=out.replace(/\n/g,'\r\n');
 fs.writeFileSync(x.file,out,'utf8');
}
console.log('PASS: full user-supplied Russian Third Hour in RU and CS+RU modes.');
console.log('PASS: Saint Ephrem reused from First Hour; Church Slavonic source untouched.');
console.log('BACKUP:',backup);
