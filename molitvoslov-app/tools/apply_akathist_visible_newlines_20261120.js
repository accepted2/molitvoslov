#!/usr/bin/env node
'use strict';
// Fix a WebView CSS mismatch: Akathist layout code deliberately avoids
// adding <br> where the prayer source already includes "\n", but the
// global .reader-text white-space: normal used to collapse those newlines.
// This patch preserves source line breaks in CS, RU and traditional modes,
// and leaves the WebView helper, texts, user data and bookmarks untouched.
// --dry-run parses the result but writes nothing; rerunning is safe.
const fs=require('node:fs');
const path=require('node:path');
const {parse}=require('@babel/parser');
const app=path.resolve(__dirname,'..');
const filename=path.join(app,'src/components/reader/selectableDocumentReader/styles.js');
const raw=fs.readFileSync(filename,'utf8');
const bom=raw.startsWith('\uFEFF')?'\uFEFF':'';
let source=raw.slice(bom.length).replace(/\r\n/g,'\n');
const marker='MOLITVOSLOV_AKATHIST_VISIBLE_NEWLINES_V1';
if(source.includes(marker)){
 console.log('PASS: Akathist source-newline CSS already installed. NO FILES MODIFIED.');
 process.exit(0);
}
const anchor=[
 '    .reader-text.akathist-russian {',
 '      color: var(--secondary);',
 '      font-size: 16px;',
 '      line-height: 23px;',
 '    }'
].join('\n');
if(source.split(anchor).length!==2)
 throw Error('Akathist CSS anchor differs. NO FILES MODIFIED.');
if(!source.includes('    .reader-text.akathist-church {') ||
   !source.includes('      white-space: normal;'))
 throw Error('Base WebView text styles have changed. NO FILES MODIFIED.');
const addition=[
 '',
 '    /* MOLITVOSLOV_AKATHIST_VISIBLE_NEWLINES_V1',
 '       Keep source \\n in every Akathist reader. The WebView creates a',
 '       separate BR only for responses not already starting after \\n.',
 '       Important also for the inherited body.book-mode .reader-text rule.',
 '       No literal prayer text or saved selection offset is changed. */',
 '    .reader-text.akathist-church,',
 '    .reader-text.akathist-russian {',
 '      white-space: pre-line !important;',
 '    }'
].join('\n');
source=source.replace(anchor,anchor+addition);
parse(source,{sourceType:'module',plugins:['jsx']});
let next=bom+source;
if(raw.includes('\r\n'))next=next.replace(/\n/g,'\r\n');
if(process.argv.includes('--dry-run')){
 console.log('DRY RUN PASS: WebView will preserve explicit Akathist line breaks in CS/RU/traditional.');
 console.log('NO FILES MODIFIED.');
 process.exit(0);
}
const backup=path.resolve(app,'..','build-backups','akathist-visible-newlines-before-'+
 new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backup,{recursive:true});
fs.copyFileSync(filename,path.join(backup,'styles.js'));
fs.writeFileSync(filename,next,'utf8');
console.log('PASS: Akathist CSS now preserves the source newlines that the reader already recognizes.');
console.log('BACKUP:',backup);
