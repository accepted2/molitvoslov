#!/usr/bin/env node
'use strict';
// Fix a legacy TEST assumption only; do not change any reader or source text.
// A local hoursTexts.json may legitimately contain an older ordinary-3.
// The curated standalone Third Hour must still win and never mutate imports.
const fs=require('node:fs'),path=require('node:path');
const app=path.resolve(__dirname,'..');
const file=path.join(app,'tools/test_hours_third_hour.js');
const original=fs.readFileSync(file,'utf8');
const bom=original.startsWith('\uFEFF')?'\uFEFF':'';
let code=original.slice(bom.length).replace(/\r\n/g,'\n');
const marker='MOLITVOSLOV_THIRD_HOUR_OPTIONAL_IMPORTED_ENTRY_TEST_V1';
if(code.includes(marker)){
 console.log('PASS: Third Hour optional imported-entry test already fixed. NO FILES MODIFIED.');
 process.exit(0);
}
const old="assert.equal(source.entries['ordinary-3'],undefined,\n  'Third Hour is a standalone file: do not overwrite local imported hoursTexts');";
const next="// MOLITVOSLOV_THIRD_HOUR_OPTIONAL_IMPORTED_ENTRY_TEST_V1\n// Imported ordinary-3 may exist; it must not be modified by this reader.\nconst originalImportedThirdHour = JSON.stringify(\n  source.entries?.['ordinary-3'] ?? null\n);";
const anchor='assert.equal(content,third);';
const replacement="assert.equal(content,third,\n  'Curated Third Hour must take precedence over an imported ordinary-3');\nassert.equal(JSON.stringify(source.entries?.['ordinary-3'] ?? null),\n  originalImportedThirdHour,\n  'Selecting the curated Third Hour cannot rewrite an imported entry');";
const finalAnchor="console.log('PASS: Third Hour CS offline, Psalms 16/24/50, two dropdowns, rubrics, colors and honest missing translations');";
const finalReplacement="assert.equal(JSON.stringify(source.entries?.['ordinary-3'] ?? null),\n  originalImportedThirdHour,\n  'Building all reader modes must not rewrite imported hoursTexts');\nconsole.log('PASS: Third Hour CS offline, Psalms 16/24/50, two dropdowns, rubrics, colors and honest missing translations');";
function replaceOnce(before,after,description){
 const count=code.split(before).length-1;
 if(count!==1)throw Error('Unexpected '+description+' ('+count+' matches). NO FILES MODIFIED.');
 code=code.replace(before,after);
}
replaceOnce(old,next,'legacy optional ordinary-3 assertion');
replaceOnce(anchor,replacement,'curated Third Hour precedence test');
replaceOnce(finalAnchor,finalReplacement,'final source immutability check');
new Function('require','__dirname','process','console',
 code.replace(/^#![^\n]*\n/,''));
let edited=bom+code;
if(original.includes('\r\n'))edited=edited.replace(/\n/g,'\r\n');
if(process.argv.includes('--dry-run')){
 console.log('DRY RUN PASS: allow preexisting imported ordinary-3 records.');
 console.log('DRY RUN PASS: curated Third Hour still wins without source mutation.');
 console.log('NO FILES MODIFIED.');
 process.exit(0);
}
const backup=path.resolve(app,'..','build-backups','hours-third-legacy-test-before-'+
 new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backup,{recursive:true});
fs.copyFileSync(file,path.join(backup,'test_hours_third_hour.js'));
fs.writeFileSync(file,edited,'utf8');
console.log('PASS: legacy Third Hour regression now handles optional imported source.');
console.log('BACKUP:',backup);
