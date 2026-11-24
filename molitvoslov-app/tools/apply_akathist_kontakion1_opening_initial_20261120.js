#!/usr/bin/env node
'use strict';
// Bring back one decorative red first glyph for Kontakion 1.
// All real hymn calls remain separately colored on their own lines.
// No prayer source changes or selection-offset modifications.
const fs=require('node:fs'),path=require('node:path');
const {parse}=require('@babel/parser');
const app=path.resolve(__dirname,'..');
const file=path.join(app,'src/components/reader/selectableDocumentReader/runtime.js');
const raw=fs.readFileSync(file,'utf8');
const bom=raw.startsWith('\uFEFF')?'\uFEFF':'';
let source=raw.slice(bom.length).replace(/\r\n/g,'\n');
const marker='MOLITVOSLOV_AKATHIST_KONTAKION1_OPENING_INITIAL_V1';
if(source.includes(marker)){
 console.log('PASS: first Kontakion initial already restored. NO FILES MODIFIED.');
 process.exit(0);
}
if(!source.includes('MOLITVOSLOV_AKATHIST_IKOS_OPENING_INITIAL_V1') ||
   !source.includes('MOLITVOSLOV_AKATHIST_PRAYER_PROSE_KONTAKION1_V1'))
 throw Error('Previous Ikos opening and Kontakion 1 helpers missing. NO FILES MODIFIED.');
const old="      if (opening && (!includeInvocations || extraResponses)) {";
const replacement=[
 '      // '+marker,
 '      // Ikoses AND first Kontakion: red initial at the start of narration.',
 '      // The condition below still prevents a duplicate first-letter',
 '      // range when the first word itself is a recognized response.',
 '      if (opening && (!includeInvocations || extraResponses || firstKontakion)) {'
].join('\n');
if(source.split(old).length!==2)
 throw Error('Unexpected red-initial condition: '+(source.split(old).length-1)+
   ' matches. NO FILES MODIFIED.');
source=source.replace(old,replacement);
parse(source,{sourceType:'module',plugins:['jsx']});
if(process.argv.includes('--dry-run')){
 console.log('DRY RUN PASS: Kontakion 1 opening letter will be red; invocations remain separate.');
 console.log('NO FILES MODIFIED.');
 process.exit(0);
}
const backup=path.resolve(app,'..','build-backups','akathist-kontakion1-initial-before-'+
 new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backup,{recursive:true});
fs.copyFileSync(file,path.join(backup,'runtime.js'));
let out=bom+source;
if(raw.includes('\r\n'))out=out.replace(/\n/g,'\r\n');
fs.writeFileSync(file,out,'utf8');
console.log('PASS: Kontakion 1 opening initial is red, independently of later responses.');
console.log('BACKUP:',backup);
