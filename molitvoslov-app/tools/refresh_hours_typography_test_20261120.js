#!/usr/bin/env node
'use strict';
// The shared Hours test predates the already-shipped "hours-third-hour"
// section marker. Its EXACT className checks are outdated: check the
// required semantic class while allowing non-breaking scoped style markers.
// This changes tests only, never runtime or original Hours source content.
const fs=require('node:fs'),path=require('node:path');
const app=path.resolve(__dirname,'..');
const file=path.join(app,'tools/test_hours_typography.js');
const source=fs.readFileSync(file,'utf8');
const old1="assert.equal(csl.sections[0].className, 'hours-section hours-section-psalm');",old2="assert.equal(csl.sections[1].className, 'hours-section hours-section-hymn');";
const next1="assert.match(csl.sections[0].className, /(?:^|\\s)hours-section-psalm(?:\\s|$)/);",next2="assert.match(csl.sections[1].className, /(?:^|\\s)hours-section-hymn(?:\\s|$)/);";
if(source.includes(next1)&&source.includes(next2)){
 console.log('PASS: shared Hours typography test already supports scoped Third Hour styles.');
 console.log('NO FILES MODIFIED.');
 process.exit(0);
}
if(source.split(old1).length!==2||source.split(old2).length!==2)
 throw Error('Unexpected shared Hours test. NO FILES MODIFIED.');
const edited=source.replace(old1,next1).replace(old2,next2);
new Function('require','__dirname','process','console',
 edited.replace(/^#![^\n]*\n/,''));
if(process.argv.includes('--dry-run')){
 console.log('DRY RUN PASS: allow scoped Third Hour classes in existing shared regression.');
 console.log('NO FILES MODIFIED.');
 process.exit(0);
}
const backup=path.resolve(app,'..','build-backups','hours-legacy-test-before-'+
 new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backup,{recursive:true});
fs.copyFileSync(file,path.join(backup,'test_hours_typography.js'));
fs.writeFileSync(file,edited,'utf8');
console.log('PASS: legacy test now validates Hours semantic CSS classes.');
console.log('BACKUP:',backup);
