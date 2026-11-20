#!/usr/bin/env node
'use strict';
// Apply only the screenshot-requested Third Hour RU order and divider.
// Surgical, idempotent and --dry-run. No source prayer text is changed.
// All three affected files are backed up before modification.
const fs=require('node:fs'),path=require('node:path');
const app=path.resolve(__dirname,'..');
const specs=[{"path":"src/services/hoursThirdHourRussian.js","replacements":[["      ...(russianRow.presentation ? {russianPresentation: russianRow.presentation} : {}),\n      ...(russianRow.preserveLineBreaks ? {russianPreserveLineBreaks: true} : {}),","      ...(russianRow.presentation ? {russianPresentation: russianRow.presentation} : {}),\n      // Per-language divider overrides never alter the original CS rows.\n      ...(russianRow.dividerAfter === true ? {dividerAfter: true} : {}),\n      ...(russianRow.preserveLineBreaks ? {russianPreserveLineBreaks: true} : {}),"],["// In the user's Russian order the blessing follows the optional kondak/tropar\n// responses. Combined mode keeps the CS sequence to avoid misaligning paired\n// columns; originalSourceIndex preserves every old section/row anchor.\nexport const getThirdHourRussianSections = (viewMode = 'russian') => {\n  const sections = originals();\n  const ephrem = ephremSection();\n  if (viewMode === 'both') {\n    return [...sections.slice(0,12), ephrem, sections[12]];\n  }\n  return [\n    ...sections.slice(0,8),\n    sections[9], sections[10], sections[8], sections[11],\n    ephrem, sections[12],\n  ];\n};","// Both RU and CS+RU follow the same liturgical order:\n// Lenten Third-Hour tropar -> blessing -> Trisagion / Lord's Prayer ->\n// Kontakion -> conditional fasting troparia. \"Господь Бог благословен\"\n// appears exactly once. originalSectionIndex preserves every old row anchor.\nexport const getThirdHourRussianSections = (_viewMode = 'russian') => {\n  const sections = originals();\n  const ephrem = ephremSection();\n  return [...sections.slice(0, 12), ephrem, sections[12]];\n};\n\n"]]},{"path":"src/data/hoursThirdHourRussian.json","replacements":[["        {\n          \"russian\": \"Трисвятое. И по Отче наш:\"\n        }","        {\n          \"russian\": \"Трисвятое. И по Отче наш:\",\n          \"dividerAfter\": true\n        }"]]},{"path":"tools/test_hours_third_russian_20261120.js","replacements":[["assert.deepEqual(originals.map(s=>s.originalSectionIndex),\n [0,1,2,3,4,5,6,7,9,10,8,11,13,12],\n 'User-provided order: Господь Бог благословен follows the fasting tropares');","assert.deepEqual(originals.map(s=>s.originalSectionIndex),\n [0,1,2,3,4,5,6,7,8,9,10,11,13,12],\n 'Russian liturgical order: the blessing follows the Great Lent dropdown');\n"],["assert.equal(ru.sections[10].rows[0].blocks[0].text,\n russian.sections[8].rows[0].russian,\n 'Blessing after optional troparia in Russian reading order');\nassert.equal(ru.sections[10].rows[0].blocks[0].id,90012,\n 'The blessing retains its original stable bookmark id');","assert.equal(ru.sections[7].accordionId,'third-hour-lent-tropar',\n 'Great Lent dropdown precedes the blessing');\nassert.equal(ru.sections[8].rows[0].blocks[0].text,\n russian.sections[8].rows[0].russian,\n 'The blessing immediately follows the Great Lent dropdown');\nassert.equal(ru.sections[8].rows[0].blocks[0].id,90012,\n 'Moving the blessing does not change its saved bookmark id');\nassert.equal(ru.sections[9].rows[0].blocks[0].text,'Трисвятое. И по Отче наш:');\nassert.equal(ru.sections[9].rows[0].dividerAfter,true,\n 'An actual separator must stand between Trisagion and the feast Kontakion');\nassert.equal(ru.sections[9].rows[1].blocks[0].text,'Кондак праздника');\nassert.equal(ru.sections[10].accordionId,'third-hour-fasting-kontakia',\n 'The fasting tropar dropdown comes after the feast Kontakion');\nassert.equal(both.sections[9].rows[0].dividerAfter,true,\n 'Bilingual view also separates the two rubrics');\nassert.equal(cs.sections[9].rows[0].dividerAfter,false,\n 'Unchanged CS presentation must not acquire a duplicate separator');\nconst russianBlessings = document => document.sections\n .flatMap(section => section.rows).flatMap(row => row.blocks)\n .filter(block => block.metadata?.language === 'russian' &&\n  block.text.startsWith('Господь Бог благословен'));\nassert.equal(russianBlessings(ru).length,1,\n 'The blessing must appear exactly once in RU, not at its former position');\nassert.equal(russianBlessings(both).length,1,\n 'The blessing must appear exactly once in CS+RU');\n"]]}];
const prepared=[];
for(const spec of specs) {
 const filename=path.join(app,spec.path);
 const original=fs.readFileSync(filename,'utf8');
 const bom=original.startsWith('\uFEFF')?'\uFEFF':'';
 let source=original.slice(bom.length).replace(/\r\n/g,'\n');
 const states=spec.replacements.map(([before,after])=>{
  const oldCount=source.split(before).length-1;
  const newCount=source.split(after).length-1;
  if(oldCount===1&&newCount===0)return 'old';
  if(oldCount===0&&newCount===1)return 'new';
  throw Error('Unexpected local content in '+spec.path+
    ' (old='+oldCount+', new='+newCount+'). NO FILES MODIFIED.');
 });
 if(states.includes('old')&&states.includes('new'))
  throw Error('Partial update in '+spec.path+'. NO FILES MODIFIED.');
 if(states.every(x=>x==='old')){
  for(const [before,after] of spec.replacements)
   source=source.replace(before,after);
 }
 if(spec.path.endsWith('.json')){
  const originalData=JSON.parse(original.replace(/^\uFEFF/u,''));
  const newData=JSON.parse(source);
  const texts=d=>JSON.stringify(d.sections.map(s=>s.rows.map(r=>r.russian)));
  if(texts(originalData)!==texts(newData))
   throw Error('Russian prayer text changed. NO FILES MODIFIED.');
 } else {
  new Function('require','__dirname','process','console',
   source.replace(/^#![^\n]*\n/,'').replace(/^import .*?;\s*$/gm,'')
     .replace(/\bexport const /g,'const '));
 }
 let edited=bom+source;
 if(original.includes('\r\n'))edited=edited.replace(/\n/g,'\r\n');
 prepared.push({filename,original,edited,already:states.every(x=>x==='new')});
}
if(prepared.every(x=>x.already)){
 console.log('PASS: Third Hour blessing order and RU divider already fixed.');
 console.log('NO FILES MODIFIED.');
 process.exit(0);
}
if(prepared.some(x=>x.already))
 throw Error('Partial order update among the 3 files. NO FILES MODIFIED.');
if(process.argv.includes('--dry-run')){
 console.log('DRY RUN PASS: Russian Third Hour ordering Lenten -> blessing -> Trisagion -> Kontakion -> fasting tropar.');
 console.log('DRY RUN PASS: no duplicate blessing, true divider before Kontakion; all text unchanged.');
 console.log('NO FILES MODIFIED.');
 process.exit(0);
}
const backup=path.resolve(app,'..','build-backups','hours-third-russian-blessing-order-'+
 new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backup,{recursive:true});
for(const entry of prepared)
 fs.copyFileSync(entry.filename,path.join(backup,path.basename(entry.filename)));
for(const entry of prepared)
 fs.writeFileSync(entry.filename,entry.edited,'utf8');
console.log('PASS: blessing moved after the Great Lent dropdown, before Trisagion.');
console.log('PASS: a divider appears between Trisagion and the feast Kontakion.');
console.log('PASS: blessing occurs once; original prayer texts and saved IDs unaffected.');
console.log('BACKUP:',backup);
