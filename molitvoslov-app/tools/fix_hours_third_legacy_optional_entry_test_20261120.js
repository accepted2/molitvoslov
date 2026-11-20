#!/usr/bin/env node
'use strict';
// TEST-ONLY compatibility repair for locally imported ordinary-3 records.
// Both Third-Hour regressions formerly assumed hoursTexts.json never
// contains ordinary-3; that is false for some existing local databases.
// Keep the strict check that the curated standalone text is used, and add
// immutability checks so neither reader can rewrite a stored import.
// Safe for Windows PowerShell 5.1, --dry-run and repeated invocation.
const fs=require('node:fs'),path=require('node:path');
const app=path.resolve(__dirname,'..');
const marker1='MOLITVOSLOV_THIRD_HOUR_OPTIONAL_IMPORTED_ENTRY_TEST_V1';
const marker2='MOLITVOSLOV_THIRD_HOUR_PRESENTATION_IMPORTED_ENTRY_TEST_V1';
const configs=[
 {name:'test_hours_third_hour.js',marker:marker1,
  changes:[
   [
    "assert.equal(source.entries['ordinary-3'],undefined,\n  'Third Hour is a standalone file: do not overwrite local imported hoursTexts');",
    "// "+marker1+"\n"+
    "// A previous local import is permitted, but must stay unchanged.\n"+
    "const importedThirdBefore = JSON.stringify(source.entries?.['ordinary-3'] ?? null);",
   ],[
    "assert.equal(content,third);",
    "assert.equal(content,third,\n"+
    "  'Curated standalone Third Hour must take precedence over imported ordinary-3');\n"+
    "assert.equal(JSON.stringify(source.entries?.['ordinary-3'] ?? null),\n"+
    "  importedThirdBefore,\n"+
    "  'Resolving curated Third Hour must not change older imported content');",
   ],[
    "console.log('PASS: Third Hour CS offline, Psalms 16/24/50, two dropdowns, rubrics, colors and honest missing translations');",
    "assert.equal(JSON.stringify(source.entries?.['ordinary-3'] ?? null),\n"+
    "  importedThirdBefore,\n"+
    "  'Building reader language modes must not mutate older imported content');\n"+
    "console.log('PASS: Third Hour CS offline, Psalms 16/24/50, two dropdowns, rubrics, colors and honest missing translations');",
   ]
  ]},
 {name:'test_hours_third_match_first_20261120.js',marker:marker2,
  changes:[
   [
    "assert.equal(hours.entries?.['ordinary-3'],undefined,\n 'Do not overwrite imported hours text or create conflicting Third Hour');",
    "// "+marker2+"\n"+
    "// An existing local import is permitted. Check it is never modified.\n"+
    "const importedThirdBefore = JSON.stringify(hours.entries?.['ordinary-3'] ?? null);",
   ],[
    "console.log('PASS: Third Hour adopts First Hour spacing, dividers and compact Bogorodichen');",
    "assert.equal(JSON.stringify(hours.entries?.['ordinary-3'] ?? null),\n"+
    "  importedThirdBefore,\n"+
    "  'Third Hour layout and reader must not overwrite stored imported content');\n"+
    "console.log('PASS: Third Hour adopts First Hour spacing, dividers and compact Bogorodichen');",
   ]
  ]}
];
const prepared=configs.map(cfg=>{
 const file=path.join(app,'tools',cfg.name);
 const original=fs.readFileSync(file,'utf8');
 const bom=original.startsWith('\uFEFF')?'\uFEFF':'';
 let edited=original.slice(bom.length).replace(/\r\n/g,'\n');
 const installed=edited.includes(cfg.marker);
 if(!installed){
  for(const [before,after] of cfg.changes){
   const count=edited.split(before).length-1;
   if(count!==1)throw Error('Unexpected '+cfg.name+' assertion ('+count+
    ' matches). NO FILES MODIFIED.');
   edited=edited.replace(before,after);
  }
  new Function('require','__dirname','process','console',
   edited.replace(/^#![^\n]*\n/,''));
 }
 let output=bom+edited;
 if(original.includes('\r\n'))output=output.replace(/\n/g,'\r\n');
 return {name:cfg.name,file,original,output,installed};
});
if(prepared.every(x=>x.installed)){
 console.log('PASS: both Third Hour tests already accept optional imported ordinary-3.');
 console.log('NO FILES MODIFIED.');
 process.exit(0);
}
if(prepared.some(x=>x.installed))
 throw Error('A partial legacy-test update was found. NO FILES MODIFIED.');
if(process.argv.includes('--dry-run')){
 console.log('DRY RUN PASS: both Third Hour tests accept an existing local ordinary-3.');
 console.log('DRY RUN PASS: both still assert imported source is not modified.');
 console.log('NO FILES MODIFIED.');
 process.exit(0);
}
const backup=path.resolve(app,'..','build-backups','hours-third-optional-entry-tests-before-'+
 new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backup,{recursive:true});
for(const item of prepared)
 fs.copyFileSync(item.file,path.join(backup,item.name));
for(const item of prepared)
 fs.writeFileSync(item.file,item.output,'utf8');
console.log('PASS: corrected TWO obsolete Third Hour test assertions only.');
console.log('PASS: actual Hours reader, all Psalms, prayer content and saved data untouched.');
console.log('BACKUP:',backup);
