#!/usr/bin/env node
'use strict';
// Three focused Akathist changes: 1) prose prayers are continuous,
// 2) first Kontakion one-time hymn cues are red/line-broken,
// 3) the supplied Holy Trinity prayer is included as a local supplement.
// Original offlineContent.json and all saved user data are untouched.
const fs=require('node:fs'),path=require('node:path');
const {parse}=require('@babel/parser');
const app=path.resolve(__dirname,'..');
const screenFile=path.join(app,'src/screens/AkathistScreen.js');
const runtimeFile=path.join(app,'src/components/reader/selectableDocumentReader/runtime.js');
const stylesFile=path.join(app,'src/components/reader/selectableDocumentReader/styles.js');
const prayerFile=path.join(app,'src/data/akathistTrinityPrayer.js');
if(!fs.existsSync(prayerFile))
 throw Error('Missing src/data/akathistTrinityPrayer.js. Fetch the companion file first.');
const marker='MOLITVOSLOV_AKATHIST_PRAYER_PROSE_KONTAKION1_V1';
const rawFiles=[
 {name:'AkathistScreen.js',path:screenFile,raw:fs.readFileSync(screenFile,'utf8')},
 {name:'runtime.js',path:runtimeFile,raw:fs.readFileSync(runtimeFile,'utf8')},
 {name:'styles.js',path:stylesFile,raw:fs.readFileSync(stylesFile,'utf8')},
];
if(rawFiles.every(file=>file.raw.includes(marker))){
 console.log('PASS: Akathist prose, Kontakion 1 and Trinity prayer already installed.');
 console.log('NO FILES MODIFIED.');
 process.exit(0);
}
if(rawFiles.some(file=>file.raw.includes(marker)))
 throw Error('Partial patch markers found. Inspect local changes. NO FILES MODIFIED.');
for(const file of rawFiles){
 file.bom=file.raw.startsWith('\uFEFF')?'\uFEFF':'';
 file.src=file.raw.slice(file.bom.length).replace(/\r\n/g,'\n');
}
const screen=rawFiles[0],runtime=rawFiles[1],styles=rawFiles[2];
if(!runtime.src.includes('MOLITVOSLOV_AKATHIST_FIRST_WORD_RESPONSE_V1') ||
   !styles.src.includes('MOLITVOSLOV_AKATHIST_VISIBLE_NEWLINES_V1'))
 throw Error('Apply previous first-word and visible-newlines Akathist fixes first. NO FILES MODIFIED.');
const replaceOnce=(file,oldPart,newPart,description)=>{
 const count=file.src.split(oldPart).length-1;
 if(count!==1)
  throw Error(description+' has '+count+' matches in '+file.name+'. NO FILES MODIFIED.');
 file.src=file.src.replace(oldPart,newPart);
};
// Tag only prayers for continuous prose; Ikoses and hymn text keep pre-line.
replaceOnce(screen,
 "import SelectableDocumentReader from '../components/reader/SelectableDocumentReader';",
 "import SelectableDocumentReader from '../components/reader/SelectableDocumentReader';\n"+
 "import {TRINITY_AKATHIST_PRAYER} from '../data/akathistTrinityPrayer';",
 'curated Holy Trinity prayer import');
const startSpecial=screen.src.indexOf("    const addSpecial = (textObject, heading, specialKey) => {");
const endSpecial=screen.src.indexOf("    addSpecial(akathist.common_rule?.opening",startSpecial);
if(startSpecial<0 || endSpecial<=startSpecial)
 throw Error('Akathist special-section helper changed. NO FILES MODIFIED.');
const specialOriginal=screen.src.slice(startSpecial,endSpecial);
let special=specialOriginal;
const addSpecialVar="      const blocks = [];";
if(special.split(addSpecialVar).length!==2)
 throw Error('Akathist special blocks differ. NO FILES MODIFIED.');
special=special.replace(addSpecialVar,
 addSpecialVar+"\n      // "+marker+"\n"+
 "      const proseSuffix = ['opening', 'ending', 'trinity-prayer'].includes(specialKey)\n"+
 "        ? ' akathist-prose-prayer' : '';");
special=special.replace(/className: 'akathist-church'/g,
 "className: 'akathist-church' + proseSuffix");
special=special.replace(/className: 'akathist-russian'/g,
 "className: 'akathist-russian' + proseSuffix");
special=special.replace(/className: localizedLanguage === 'church' \? 'akathist-church' : 'akathist-russian'/g,
 "className: (localizedLanguage === 'church' ? 'akathist-church' : 'akathist-russian') + proseSuffix");
replaceOnce(screen,specialOriginal,special,'special prayer classes');

const sectionBegin=screen.src.indexOf("    prepareAkathistSections(akathist.sections).forEach");
const sectionEnd=screen.src.indexOf("    addSpecial(akathist.common_rule?.ending",sectionBegin);
if(sectionBegin<0||sectionEnd<=sectionBegin)
 throw Error('Akathist section renderer changed. NO FILES MODIFIED.');
const sectionOriginal=screen.src.slice(sectionBegin,sectionEnd);
let sectionText=sectionOriginal;
const fullSave="      const fullSaveType = section.section_type === 'prayer' ? 'prayer' : 'section';";
if(sectionText.split(fullSave).length!==2)
 throw Error('Section type rule changed. NO FILES MODIFIED.');
sectionText=sectionText.replace(fullSave,fullSave+"\n"+
 "      const prayerSuffix = section.section_type === 'prayer'\n"+
 "        ? ' akathist-prose-prayer' : '';");
sectionText=sectionText.replace(/className: 'akathist-church'/g,
 "className: 'akathist-church' + prayerSuffix");
sectionText=sectionText.replace(/className: 'akathist-russian'/g,
 "className: 'akathist-russian' + prayerSuffix");
sectionText=sectionText.replace(/className: localizedLanguage === 'church' \? 'akathist-church' : 'akathist-russian'/g,
 "className: (localizedLanguage === 'church' ? 'akathist-church' : 'akathist-russian') + prayerSuffix");
replaceOnce(screen,sectionOriginal,sectionText,'prayer section classes');

const ending="    addSpecial(akathist.common_rule?.ending, 'Окончание чтения акафиста', 'ending');";
replaceOnce(screen,ending,"    // Do not duplicate an already exported version of this specific prayer.\n    const hasTrinityPrayer = [\n      ...(akathist.sections || []).map(section => section.text?.content),\n      akathist.common_rule?.ending?.content,\n    ].some(value => {\n      const plain = String(value || '').replace(/[\\u00ad\\u200b]/gu, '')\n        .normalize('NFD').replace(/[\\u0300-\\u036f\\u0483-\\u0489]/gu, '');\n      return /Пресвятая[ \\t]+Троице,[ \\t]+Единосущная[ \\t]+Державо/iu.test(plain);\n    });\n    if ((akathist.slug || slug) === 'akafist-presvjatoj-i-zhivotvorjashhej-troice' &&\n        !hasTrinityPrayer) {\n      addSpecial(TRINITY_AKATHIST_PRAYER,\n        'Моли́тва ко Пресвяте́й Тро́ице', 'trinity-prayer');\n    }\n"+ending,'Holy Trinity closing prayer');

const cssAnchor=[
 "    .reader-text.akathist-church,",
 "    .reader-text.akathist-russian {",
 "      white-space: pre-line !important;",
 "    }"
].join('\n');
const cssAddition="\n    /* MOLITVOSLOV_AKATHIST_PRAYER_PROSE_KONTAKION1_V1\n       Prayers flow continuously; only actual hymn responses use pre-line. */\n    .reader-text.akathist-prose-prayer {\n      white-space: normal !important;\n      text-align: justify;\n      text-align-last: auto;\n    }";
replaceOnce(styles,cssAnchor,cssAnchor+cssAddition,'specific prose prayer CSS');

// Only first Kontakion gets the extra ONE-TIME response after a colon.
const helper="    // MOLITVOSLOV_AKATHIST_KONTAKION1_CHANT_V1\n    // Kontakion 1 can have a one-time hymn cue after a colon.\n    // Three-time repetition is appropriate for Ikoses, not here.\n    const collectAkathistFirstKontakionCueRanges = value => {\n      const source = String(value || '');\n      const {normalized, originalIndex} = normalizedAkathistRefrainWithIndex(source);\n      const formula = /(?:Слава[ \\t]+в[ \\t]+вышних|Свят[ \\t]*,[ \\t]*Свят[ \\t]*,[ \\t]*Свят)/giu;\n      const ranges = [];\n      for (const match of normalized.matchAll(formula)) {\n        const before = normalized[match.index - 1] || '';\n        const after = normalized[match.index + match[0].length] || '';\n        if (/\\p{L}/u.test(before) || /\\p{L}/u.test(after)) continue;\n        const start = originalIndex[match.index];\n        const last = originalIndex[match.index + match[0].length - 1];\n        if (!Number.isFinite(start) || !Number.isFinite(last)) continue;\n        if (!/:[ \\t\\r\\n]*$/u.test(source.slice(0, start))) continue;\n        ranges.push({start, end: last + 1});\n      }\n      return ranges;\n    };\n";
replaceOnce(runtime,
 "    const collectAkathistRefrainRanges = (value, extraResponses = false) => {",
 helper+"    const collectAkathistRefrainRanges = (value, extraResponses = false, firstKontakion = false) => {",
 'Kontakion 1 helper definition');
replaceOnce(runtime,
 "      const repeated = collectAkathistRepeatedOpeningRanges(source);",
 "      const repeated = collectAkathistRepeatedOpeningRanges(source);\n"+
 "      const firstKontakionCues = firstKontakion\n"+
 "        ? collectAkathistFirstKontakionCueRanges(source) : [];",
 'Kontakion 1 responses insertion');
replaceOnce(runtime,
 "        ? [...standard, ...collectAkathistAdditionalResponseRanges(source), ...repeated]\n"+
 "        : [...standard, ...repeated];",
 "        ? [...standard, ...collectAkathistAdditionalResponseRanges(source), ...repeated, ...firstKontakionCues]\n"+
 "        : [...standard, ...repeated, ...firstKontakionCues];",
 'Kontakion 1 candidate collector');
replaceOnce(runtime,
 "    const collectAkathistJoyBreaks = (value, extraResponses = false) =>",
 "    const collectAkathistJoyBreaks = (value, extraResponses = false, firstKontakion = false) =>",
 'Kontakion 1 visual break args');
replaceOnce(runtime,
 "      new Set(collectAkathistRefrainRanges(value, extraResponses)",
 "      new Set(collectAkathistRefrainRanges(value, extraResponses, firstKontakion)",
 'Kontakion 1 break collector');
replaceOnce(runtime,
 "    const collectAkathistInitialRanges = (value, includeInvocations = true, extraResponses = false) => {",
 "    const collectAkathistInitialRanges = (value, includeInvocations = true, extraResponses = false, firstKontakion = false) => {",
 'Kontakion 1 red span args');
replaceOnce(runtime,
 "const invocationRanges = includeInvocations ? collectAkathistRefrainRanges(source, extraResponses) : [];",
 "const invocationRanges = includeInvocations ? collectAkathistRefrainRanges(source, extraResponses, firstKontakion) : [];",
 'Kontakion 1 red collector');
replaceOnce(runtime,
 "          ? collectAkathistJoyBreaks(text, isAkathistIkos) : new Set();",
 "          ? collectAkathistJoyBreaks(text, isAkathistIkos, isAkathistFirstKontakion) : new Set();",
 'Kontakion 1 active visual breaks');
replaceOnce(runtime,
 "          ? collectAkathistInitialRanges(text, hasAkathistInvocations, isAkathistIkos) : [];",
 "          ? collectAkathistInitialRanges(text, hasAkathistInvocations, isAkathistIkos, isAkathistFirstKontakion) : [];",
 'Kontakion 1 active red words');
replaceOnce(runtime,
 "    // MOLITVOSLOV_AKATHIST_KONTAKION1_CHANT_V1",
 "    // MOLITVOSLOV_AKATHIST_KONTAKION1_CHANT_V1\n    // "+marker,
 'Kontakion 1 runtime marker');

for(const file of rawFiles)
 parse(file.src,{sourceType:'module',plugins:['jsx']});
parse(fs.readFileSync(prayerFile,'utf8'),{sourceType:'module'});
if(process.argv.includes('--dry-run')){
 console.log('DRY RUN PASS: prayers flow as prose, Kontakion 1 hymns get single-line cues.');
 console.log('DRY RUN PASS: Trinity prayer supplemental text included without duplication.');
 console.log('NO FILES MODIFIED.');
 process.exit(0);
}
const backup=path.resolve(app,'..','build-backups','akathist-prayer-and-kontakion1-before-'+
 new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backup,{recursive:true});
for(const file of rawFiles){
 fs.copyFileSync(file.path,path.join(backup,file.name));
 let out=file.bom+file.src;
 if(file.raw.includes('\r\n'))out=out.replace(/\n/g,'\r\n');
 fs.writeFileSync(file.path,out,'utf8');
}
console.log('PASS: continuous justified Akathist prayers; original hymn line breaks retained.');
console.log('PASS: one-time Kontakion 1 "Slava v vyshnih" and "Svyat" phrases recognized.');
console.log('PASS: supplied prayer to Most Holy Trinity included once if absent.');
console.log('BACKUP:',backup);
