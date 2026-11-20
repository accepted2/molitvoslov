#!/usr/bin/env node
'use strict';
// Maintain three EXISTING Third Hour regression scripts after adding the
// user-provided full Russian version. No source text or rendering is changed.
// The old assertions required RU to be missing; now they check complete
// Russian and paired CS/RU Psalms. Re-running this patch is harmless.
const fs=require('node:fs'),path=require('node:path');
const app=path.resolve(__dirname,'..');
const marker='MOLITVOSLOV_THIRD_HOUR_RU_TESTS_20261120_V1';
const changes={"test_hours_third_hour.js":[["assert.equal(both.sections.length,13);\nassert.ok(both.sections.every(s=>s.rows.every(r=>r.blocks.length===1)),\n  'No fake Russian parallel translation');\nassert.match(both.description,/русск|перевод/i);","assert.equal(both.sections.length,14);\nassert.equal(both.sections[1].rows[0].blocks.length,2,\n  'Actual Third Hour Psalm text must appear in parallel CS/RU columns');\nassert.equal(both.description,'','Complete Russian text must not show a missing warning');"],["assert.match(ru.sections[0].rows[0].blocks[0].text,/пока не добавлен/);","assert.equal(ru.sections.length,14,'Full Russian Third Hour and Saint Ephrem dropdown');\nassert.equal(ru.sections[0].rows[0].blocks[0].text.startsWith('Священник:'),true);"]],"test_hours_third_dividers_amen_20261120.js":[["assert(both.sections.every(s=>s.rows.every(r=>r.blocks.length===1)),\n 'No fabricated Russian translation in combined mode');","assert.equal(both.sections[1].rows[0].blocks.length,2,\n 'Complete Russian Psalm must align with Church Slavonic in combined mode');"],["assert.equal(rus.sections[0].rows.length,1,\n 'RU mode still shows its honest missing translation notice');","assert.equal(rus.sections[0].rows.length,17,\n 'RU mode must show complete opening with separate Amen and Slava rows');"]],"test_hours_third_match_first_20261120.js":[["assert.match(ru.sections[0].rows[0].blocks[0].text,/пока не добавлен/u,\n 'Russian-only tab must NOT invent a translation');","assert.equal(ru.sections.length,14,'Complete Russian Third Hour and Ephrem reused');\nassert.equal(ru.sections[0].rows[0].blocks[0].text.startsWith('Священник:'),true);"],["assert(both.sections.every(s=>s.rows.every(r=>r.blocks.length===1)),\n 'Combined mode must not invent a second, fake translation column');","assert.equal(both.sections[1].rows[0].blocks.length,2,\n 'Combined mode must pair verified Church Slavonic and Russian Psalms');"]]};
const prepared=[];
for(const [name,replacements] of Object.entries(changes)){
 const file=path.join(app,'tools',name);
 const original=fs.readFileSync(file,'utf8');
 let edited=original.replace(/\r\n/g,'\n');
 if(edited.includes(marker)){
  prepared.push({name,file,original,output:original,installed:true});
  continue;
 }
 for(const [before,after] of replacements){
  const number=edited.split(before).length-1;
  if(number!==1)throw Error('Existing '+name+' assertion differs ('+
    number+' matches). NO FILES MODIFIED.');
  edited=edited.replace(before,after);
 }
 edited="// "+marker+"\n"+edited;
 // Syntax check; never execute the test until the caller requests it.
 new Function('require','__dirname','process','console',
  edited.replace(/^#![^\n]*\n/,''));
 let output=edited;
 if(original.includes('\r\n'))output=output.replace(/\n/g,'\r\n');
 prepared.push({name,file,original,output,installed:false});
}
if(prepared.every(x=>x.installed)){
 console.log('PASS: all Third Hour legacy RU tests already updated.');
 console.log('NO FILES MODIFIED.');
 process.exit(0);
}
if(prepared.some(x=>x.installed))
 throw Error('Only some Third Hour tests have been updated. NO FILES MODIFIED.');
if(process.argv.includes('--dry-run')){
 console.log('DRY RUN PASS: three old tests now expect the real Russian Third Hour.');
 console.log('NO FILES MODIFIED.');
 process.exit(0);
}
const backup=path.resolve(app,'..','build-backups','hours-third-russian-test-updates-before-'+
 new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backup,{recursive:true});
for(const x of prepared)fs.copyFileSync(x.file,path.join(backup,x.name));
for(const x of prepared)fs.writeFileSync(x.file,x.output,'utf8');
console.log('PASS: three previous Third Hour regressions now test RU and CS+RU.');
console.log('BACKUP:',backup);
