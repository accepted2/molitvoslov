#!/usr/bin/env node
'use strict';
// Apply an exact, idempotent one-site change on the current Akathist
// WebView. No edits to JSON, source text, saved highlights or other screens.
const fs=require('node:fs'),path=require('node:path');
const {parse}=require('@babel/parser');
const app=path.resolve(__dirname,'..');
const file=path.join(app,'src/components/reader/selectableDocumentReader/runtime.js');
const raw=fs.readFileSync(file,'utf8'),bom=raw.startsWith('\uFEFF')?'\uFEFF':'';
let src=raw.slice(bom.length).replace(/\r\n/g,'\n');
const marker='MOLITVOSLOV_AKATHIST_DOXOLOGY_FULL_VOCATIVE_V1';
if(src.includes(marker)){
 console.log('PASS: full Akathist doxology invocation already installed. NO FILES MODIFIED.');
 process.exit(0);
}
if(!src.includes('MOLITVOSLOV_AKATHIST_IKOS_BOUNDARY_ACCENTS_V1'))
 throw Error('Apply the previous Akathist boundary patch first. NO FILES MODIFIED.');
const old='      const immediate = suffix.match(/^[ \\t]*,/u);';
const count=src.split(old).length-1;
if(count!==1)
 throw Error('Expected one response-head punctuation rule, found '+count+'. NO FILES MODIFIED.');
const patch="      // MOLITVOSLOV_AKATHIST_DOXOLOGY_FULL_VOCATIVE_V1\n      // \"Слава Тебе, Господи,\" is ONE opening formula. Do not stop red\n      // ink at the first comma before the vocative \"Господи\".\n      // Work through the existing accent-aware original-index map so that\n      // selection, highlights and saved ranges remain byte-for-byte stable.\n      const preface = normalizedAkathistRefrainWithIndex(\n        value.slice(range.start, range.end)).normalized.trim();\n      if (/^Слава[ \\t]+Теб[еѣ]$/iu.test(preface)) {\n        const tail = normalizedAkathistRefrainWithIndex(suffix);\n        const invocation = tail.normalized.match(\n          /^[ \\t]*,[ \\t]*Господи[ \\t]*,/iu);\n        if (invocation) {\n          const lastIndex = tail.originalIndex[invocation[0].length - 1];\n          if (Number.isFinite(lastIndex)) {\n            let extended = end + lastIndex + 1;\n            while (extended < value.length &&\n                   /[\\u0300-\\u036f\\u0483-\\u0489]/u.test(value[extended]))\n              extended += 1;\n            return {start: range.start, end: extended};\n          }\n        }\n      }\n";
src=src.replace(old,patch+old);
parse(src,{sourceType:'module',plugins:['jsx']});
let next=bom+src;
if(raw.includes('\r\n'))next=next.replace(/\n/g,'\r\n');
if(process.argv.includes('--dry-run')){
 console.log('DRY RUN PASS: extend "Slava Tebe, Gospodi," to its second comma. NO FILES MODIFIED.');
 process.exit(0);
}
const backup=path.resolve(app,'..','build-backups','akathist-doxology-before-'+
 new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backup,{recursive:true});
fs.copyFileSync(file,path.join(backup,'runtime.js'));
fs.writeFileSync(file,next,'utf8');
console.log('PASS: full doxology invocation is red through Gospodi, including punctuation.');
console.log('BACKUP:',backup);
