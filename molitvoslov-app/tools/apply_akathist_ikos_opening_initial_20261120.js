#!/usr/bin/env node
'use strict';
// Restore only the decorative red initial at the beginning of each Ikos.
// Refrain red words and paragraph breaks keep their current independent rules.
// Kontakion 1 and Akathist prayer prose are deliberately not changed.
// The original prayer text and all UTF-16 selection offsets stay untouched.
const fs=require('node:fs');
const path=require('node:path');
const {parse}=require('@babel/parser');
const app=path.resolve(__dirname,'..');
const file=path.join(app,'src/components/reader/selectableDocumentReader/runtime.js');
const original=fs.readFileSync(file,'utf8');
const bom=original.startsWith('\uFEFF')?'\uFEFF':'';
let source=original.slice(bom.length).replace(/\r\n/g,'\n');
const marker='MOLITVOSLOV_AKATHIST_IKOS_OPENING_INITIAL_V1';
if(source.includes(marker)){
 console.log('PASS: Akathist Ikos opening initials already restored. NO FILES MODIFIED.');
 process.exit(0);
}
if(!source.includes('MOLITVOSLOV_AKATHIST_FIRST_WORD_RESPONSE_V1'))
 throw Error('First-word Akathist patch missing. NO FILES MODIFIED.');
const before=[
 '      // Introductory narrative in Ikoses/Kontakion 1 stays ordinary ink.',
 '      // Other Akathist sections keep their established decorative initial.',
 '      if (opening && !includeInvocations) {',
].join('\n');
const after=[
 '      // '+marker,
 '      // Paint only the FIRST glyph of an Ikos introduction red, even when',
 '      // the section contains hymn responses further down. A response',
 '      // beginning at the first glyph already paints its full first word.',
 '      // Keep Kontakion 1 and other Akathist sections unchanged.',
 '      if (opening && (!includeInvocations || extraResponses)) {',
].join('\n');
if(source.split(before).length!==2)
 throw Error('Akathist introductory-initial rule differs from expected code. NO FILES MODIFIED.');
source=source.replace(before,after);
parse(source,{sourceType:'module',plugins:['jsx']});
if(process.argv.includes('--dry-run')){
 console.log('DRY RUN PASS: Ikos opening letter restored without coloring following prose.');
 console.log('DRY RUN PASS: actual hymn invocations and Kontakion 1 remain unchanged.');
 console.log('NO FILES MODIFIED.');
 process.exit(0);
}
const backup=path.resolve(app,'..','build-backups','akathist-ikos-initial-before-'+
 new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backup,{recursive:true});
fs.copyFileSync(file,path.join(backup,'runtime.js'));
let next=bom+source;
if(original.includes('\r\n'))next=next.replace(/\n/g,'\r\n');
fs.writeFileSync(file,next,'utf8');
console.log('PASS: first opening letter of every Akathist Ikos is red again.');
console.log('BACKUP:',backup);
