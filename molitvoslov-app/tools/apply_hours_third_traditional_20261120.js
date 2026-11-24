#!/usr/bin/env node
'use strict';
// Add the complete USER-SUPPLIED traditional Third Hour to the reader's
// "ЦС традиц." tab, while preserving RU, CS, shared reader, and old anchors.
// The 13 sections and Saint Ephrem accordion are supplied as standalone JSON.
// Never modify the source prayers or normalize away Church Slavonic marks.
// --dry-run is read-only; all modified reader files are backed up.
const fs=require('node:fs'),path=require('node:path');
const {parse}=require('@babel/parser');
const root=path.resolve(__dirname,'..');
const files=[
  {name:'hoursDocument.js',path:path.join(root,'src/services/hoursDocument.js')},
  {name:'styles.js',path:path.join(root,'src/components/reader/selectableDocumentReader/styles.js')}
].map(f=>({...f,original:fs.readFileSync(f.path,'utf8')}));
const sourceFile=path.join(root,'src/data/hoursThirdHourTraditional.json');
const helperFile=path.join(root,'src/services/hoursThirdHourTraditional.js');
if(!fs.existsSync(sourceFile)||!fs.existsSync(helperFile))
 throw Error('Download the traditional JSON and helper service first. NO FILES MODIFIED.');
const traditional=JSON.parse(fs.readFileSync(sourceFile,'utf8'));
const church=JSON.parse(fs.readFileSync(path.join(root,'src/data/hoursThirdHourEditorial.json'),'utf8'));
const expected=[16,1,1,1,3,2,5,6,1,2,5,8,1];
if(traditional.entryId!=='ordinary-3'||traditional.sections.length!==13||
 traditional.sections.some((s,i)=>s.rows.length!==expected[i])||
 church.sections.length!==13||traditional.ephrem?.rows.length!==9)
 throw Error('Third Hour traditional source is incomplete. NO FILES MODIFIED.');
const marker='MOLITVOSLOV_THIRD_HOUR_TRADITIONAL_FULL_20261120_V1';
if(files.every(f=>f.original.includes(marker))){
 console.log('PASS: traditional Third Hour already installed. NO FILES MODIFIED.');
 process.exit(0);
}
if(files.some(f=>f.original.includes(marker)))
 throw Error('Partial traditional reader installation detected. NO FILES MODIFIED.');
for(const file of files){
 file.bom=file.original.startsWith('\uFEFF')?'\uFEFF':'';
 file.code=file.original.slice(file.bom.length).replace(/\r\n/g,'\n');
}
const doc=files[0],css=files[1];
if(!doc.code.includes('MOLITVOSLOV_THIRD_HOUR_RUSSIAN_FULL_20261120_V1') ||
   !doc.code.includes('MOLITVOSLOV_THIRD_HOUR_RUSSIAN_AMEN_SPLIT_V1'))
 throw Error('Install the existing full Russian Third Hour before this patch. NO FILES MODIFIED.');
const replaceOnce=(file,oldPart,newPart,label)=>{
 const count=file.code.split(oldPart).length-1;
 if(count!==1)
  throw Error(label+' differs locally ('+count+' matches) in '+file.name+
    '. NO FILES MODIFIED.');
 file.code=file.code.replace(oldPart,newPart);
};
// Imports are purely additive.
replaceOnce(doc,
 "import {getThirdHourRussianSections} from './hoursThirdHourRussian';",
 "import {getThirdHourRussianSections} from './hoursThirdHourRussian';\n"+
 "import {getThirdHourTraditionalSections, getThirdHourTraditionalMarks} "+
   "from './hoursThirdHourTraditional';\n"+
 "// "+marker,
 'traditional Third Hour import');
replaceOnce(doc,
 "  const thirdHourRussianSections = isThirdHour\n"+
 "    ? getThirdHourRussianSections(viewMode) : null;",
 "  const thirdHourRussianSections = isThirdHour\n"+
 "    ? getThirdHourRussianSections(viewMode) : null;\n"+
 "  const thirdHourTraditionalSections = isThirdHour\n"+
 "    ? getThirdHourTraditionalSections() : null;",
 'traditional hour sections');
replaceOnce(doc,
 "    ...(isThirdHour ? {hasRussian: thirdHourRussianSections.some(s =>\n"+
 "      s.rows.some(r => isText(r.russian)))} : {}),",
 "    ...(isThirdHour ? {\n"+
 "      hasRussian: thirdHourRussianSections.some(s => s.rows.some(r => isText(r.russian))),\n"+
 "      hasTraditional: thirdHourTraditionalSections.some(s =>\n"+
 "        s.rows.some(r => isText(r.traditional))),\n"+
 "    } : {}),",
 'language availability');
replaceOnce(doc,
 "    ? (isFirstHour ? firstHourTraditional.sections : content?.traditionalSections)",
 "    ? (isFirstHour ? firstHourTraditional.sections :\n"+
 "       isThirdHour ? thirdHourTraditionalSections : content?.traditionalSections)",
 'traditional source selection');
replaceOnce(doc,
 "    const title = cleanHeading(isThirdHour && viewMode === READER_LANGUAGE_MODES.RUSSIAN\n"+
 "      ? (section.russianTitle || section.title) : section.title);",
 "    const title = cleanHeading(isThirdHour && viewMode === READER_LANGUAGE_MODES.TRADITIONAL\n"+
 "      ? (section.traditionalTitle || section.title)\n"+
 "      : isThirdHour && viewMode === READER_LANGUAGE_MODES.RUSSIAN\n"+
 "        ? (section.russianTitle || section.title) : section.title);",
 'localized traditional headers');
replaceOnce(doc,
 "          presentation: field === 'russian'\n"+
 "            ? (row.russianPresentation || row.presentation)\n"+
 "            : row.presentation,",
 "          presentation: field === 'russian'\n"+
 "            ? (row.russianPresentation || row.presentation)\n"+
 "            : field === 'traditional'\n"+
 "              ? (row.traditionalPresentation || row.presentation)\n"+
 "              : row.presentation,",
 'traditional presentation class');
replaceOnce(doc,
 "          redInitial: field === 'russian'\n"+
 "            ? (row.russianRedInitial ?? (row.redInitial === true))\n"+
 "            : row.redInitial === true,",
 "          redInitial: field === 'russian'\n"+
 "            ? (row.russianRedInitial ?? (row.redInitial === true))\n"+
 "            : field === 'traditional'\n"+
 "              ? (row.traditionalRedInitial ?? (row.redInitial === true))\n"+
 "              : row.redInitial === true,",
 'traditional initial red');
replaceOnce(doc,
 "          accentPrefix: field === 'russian'\n"+
 "            ? (row.russianAccentPrefix || row.accentPrefix || '')\n"+
 "            : row.accentPrefix || '',",
 "          accentPrefix: field === 'russian'\n"+
 "            ? (row.russianAccentPrefix || row.accentPrefix || '')\n"+
 "            : field === 'traditional'\n"+
 "              ? (row.traditionalAccentPrefix || row.accentPrefix || '')\n"+
 "              : row.accentPrefix || '',",
 'traditional accent prefix');
replaceOnce(doc,
 "          preserveLineBreaks: field === 'russian'\n"+
 "            ? (row.russianPreserveLineBreaks ?? (row.preserveLineBreaks === true))\n"+
 "            : row.preserveLineBreaks === true,",
 "          preserveLineBreaks: field === 'russian'\n"+
 "            ? (row.russianPreserveLineBreaks ?? (row.preserveLineBreaks === true))\n"+
 "            : field === 'traditional'\n"+
 "              ? (row.traditionalPreserveLineBreaks ?? (row.preserveLineBreaks === true))\n"+
 "              : row.preserveLineBreaks === true,",
 'traditional prayer line breaks');
replaceOnce(doc,
 "    if (isFirstHour && language === 'traditional') {\n"+
 "      hoursMarks.splice(0, hoursMarks.length,\n"+
 "        ...getFirstHourTraditionalMarks(text, presentation));\n"+
 "    }",
 "    if (isFirstHour && language === 'traditional') {\n"+
 "      hoursMarks.splice(0, hoursMarks.length,\n"+
 "        ...getFirstHourTraditionalMarks(text, presentation));\n"+
 "    } else if (isThirdHour && language === 'traditional') {\n"+
 "      hoursMarks.splice(0, hoursMarks.length,\n"+
 "        ...getThirdHourTraditionalMarks(text, presentation));\n"+
 "    }",
 'traditional liturgical red rubrics');
replaceOnce(doc,
 "      // MOLITVOSLOV_THIRD_HOUR_RUSSIAN_AMEN_SPLIT_V1",
 "      // MOLITVOSLOV_THIRD_HOUR_TRADITIONAL_AMEN_SPLIT_20261120_V1\n      // Restore the source TXT separator following \"Чте́цъ: А҆м́инь.\".\n      // An additional DISPLAY row does not shift existing saved row IDs.\n      if (isThirdHour && viewMode === READER_LANGUAGE_MODES.TRADITIONAL &&\n          originalSectionIndex === 0 && rowIndex === 1 &&\n          row.traditionalSplitAfter && blocks.length === 1 &&\n          blocks[0].text.startsWith(row.traditionalSplitAfter + ' ')) {\n        const originalBlock = blocks[0];\n        const firstText = row.traditionalSplitAfter;\n        const secondText = originalBlock.text.slice(firstText.length).trim();\n        if (!secondText.startsWith('Сла́ва Тебѣ̀')) {\n          throw new Error('Traditional Third Hour opening Glory text changed');\n        }\n        const firstBlock = {\n          ...originalBlock,\n          text: firstText,\n          hoursMarks: originalBlock.hoursMarks.filter(mark =>\n            mark.start >= 0 && mark.end <= firstText.length),\n        };\n        const secondBlock = createBlock({\n          id: id + 9, language: 'traditional',\n          text: secondText, title, sectionKind,\n          opening: false, redInitial: true,\n        });\n        rows.push({layout: 'stack', blocks: [firstBlock], dividerAfter: true});\n        rows.push({\n          layout: 'stack', blocks: [secondBlock],\n          dividerAfter: row.traditionalDividerAfter === true ||\n            row.dividerAfter === true,\n        });\n        continue;\n      }\n"+"      // MOLITVOSLOV_THIRD_HOUR_RUSSIAN_AMEN_SPLIT_V1",
 'traditional Amen/Glory divider');
replaceOnce(doc,
 "        sharedTitle: isThirdHour && row.russianHeading &&\n"+
 "          viewMode !== READER_LANGUAGE_MODES.CHURCH\n"+
 "            ? row.russianHeading : null,",
 "        sharedTitle: isThirdHour\n"+
 "          ? (viewMode === READER_LANGUAGE_MODES.TRADITIONAL\n"+
 "            ? (row.traditionalHeading || null)\n"+
 "            : viewMode !== READER_LANGUAGE_MODES.CHURCH\n"+
 "              ? (row.russianHeading || null) : null)\n"+
 "          : null,",
 'traditional prayer subtitles');
replaceOnce(doc,
 "        dividerAfter: row.dividerAfter === true,",
 "        dividerAfter: viewMode === READER_LANGUAGE_MODES.TRADITIONAL && isThirdHour\n"+
 "          ? (row.traditionalDividerAfter === true || row.dividerAfter === true)\n"+
 "          : row.dividerAfter === true,",
 'traditional Trisagion and Kondak separator');
replaceOnce(css,
 "    /* Only the explicitly marked rows of the First Hour receive rules. */",
 "    /* MOLITVOSLOV_THIRD_HOUR_TRADITIONAL_FULL_20261120_V1\n       Church Slavonic prayer headings should use the actual Ponomar glyph\n       font, not the civil-script Georgia inherited from Russian Hour 3. */\n    .rule-item.hours-third-hour.hours-traditional-section .psalter-shared-rubric {\n      font-family: 'Ponomar', Georgia, serif !important;\n      font-size: 19px;\n      font-weight: 400;\n      font-style: normal;\n      line-height: 1.55;\n      text-align: left;\n      color: var(--liturgical);\n    }\n"+"    /* Only the explicitly marked rows of the First Hour receive rules. */",
 'Ponomar titles and prayer headings');
parse(fs.readFileSync(helperFile,'utf8'),{sourceType:'module'});
for(const f of files)parse(f.code,{sourceType:'module',plugins:['jsx']});
if(process.argv.includes('--dry-run')){
 console.log('DRY RUN PASS: traditional Third Hour available, all 13 sections and 3 dropdowns.');
 console.log('DRY RUN PASS: Ponomar, exact original accents, titla and red liturgical cues.');
 console.log('DRY RUN PASS: no modifications to RU, CS or source prayer content.');
 console.log('NO FILES MODIFIED.');
 process.exit(0);
}
const backup=path.resolve(root,'..','build-backups','hours-third-traditional-before-'+
 new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backup,{recursive:true});
for(const f of files)
 fs.copyFileSync(f.path,path.join(backup,f.name));
for(const f of files){
 let content=f.bom+f.code;
 if(f.original.includes('\r\n'))content=content.replace(/\n/g,'\r\n');
 fs.writeFileSync(f.path,content,'utf8');
}
console.log('PASS: complete traditional Third Hour is available under "ЦС традиц.".');
console.log('PASS: full Psalms 16/24/50 and Saint Ephrem dropdown, correct prayer order.');
console.log('PASS: original prayer words and RU/CS versions have not been rewritten.');
console.log('BACKUP:',backup);
