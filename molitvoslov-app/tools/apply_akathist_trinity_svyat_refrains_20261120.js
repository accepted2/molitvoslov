#!/usr/bin/env node
'use strict';
// Keep all original text and selection offsets. Count "Свят, Свят, Свят"
// and "Свят еси" as ONE recurring liturgical response family.
// Does not highlight isolated quotations or ordinary prose.
const fs=require('node:fs'),path=require('node:path');
const {parse}=require('@babel/parser');
const app=path.resolve(__dirname,'..');
const file=path.join(app,'src/components/reader/selectableDocumentReader/runtime.js');
const raw=fs.readFileSync(file,'utf8'),bom=raw.startsWith('\uFEFF')?'\uFEFF':'';
let source=raw.slice(bom.length).replace(/\r\n/g,'\n');
const marker='MOLITVOSLOV_AKATHIST_SHARED_SVYAT_REFRAIN_V1';
if(source.includes(marker)){
 console.log('PASS: both forms of "Свят" already supported. NO FILES MODIFIED.');
 process.exit(0);
}
if(!source.includes('MOLITVOSLOV_AKATHIST_FIRST_WORD_RESPONSE_V1') ||
   !source.includes('MOLITVOSLOV_AKATHIST_PRAYER_PROSE_KONTAKION1_V1'))
 throw Error('Previous Akathist patches missing. NO FILES MODIFIED.');
const old="        /Свят[ \\t]*,[ \\t]*Свят[ \\t]*,[ \\t]*Свят/giu,";
const next="        // MOLITVOSLOV_AKATHIST_SHARED_SVYAT_REFRAIN_V1\n        // Count the triple \"Свят\" and \"Свят еси\" as one recurring family.\n        // Only the first word of every hymn response becomes red.\n        /(?:Свят[ \\t]*,[ \\t]*Свят[ \\t]*,[ \\t]*Свят|Свят[ \\t]+еси)/giu,";
if(source.split(old).length!==2)
 throw Error('Current repeated-opening pattern differs. NO FILES MODIFIED.');
source=source.replace(old,next);
parse(source,{sourceType:'module',plugins:['jsx']});
if(process.argv.includes('--dry-run')){
 console.log('DRY RUN PASS: combined first-word-only "Свят" response family.');
 console.log('NO FILES MODIFIED.');
 process.exit(0);
}
const backup=path.resolve(app,'..','build-backups','akathist-svyat-before-'+
 new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backup,{recursive:true});
fs.copyFileSync(file,path.join(backup,'runtime.js'));
let nextSource=bom+source;
if(raw.includes('\r\n'))nextSource=nextSource.replace(/\n/g,'\r\n');
fs.writeFileSync(file,nextSource,'utf8');
console.log('PASS: "Свят" now receives first-word red styling in every repeated Ikos response.');
console.log('BACKUP:',backup);
