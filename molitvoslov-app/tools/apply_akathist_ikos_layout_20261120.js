#!/usr/bin/env node
'use strict';
// Safe, reversible WebView-only Ikos/Kontakion 1 typography update.
// Preserve canonical text, UTF-16 offsets, selection and bookmark anchors.
// A response must begin at a clause boundary; generic narrative words
// must not acquire red ink or line breaks.
const fs=require('node:fs');
const path=require('node:path');
const {parse}=require('@babel/parser');
const root=path.resolve(__dirname,'..');
const file=path.join(root,'src/components/reader/selectableDocumentReader/runtime.js');
const original=fs.readFileSync(file,'utf8'),bom=original.startsWith('\uFEFF')?'\uFEFF':'';
const startMark='    const collectAkathistRefrainRanges = (value, extraResponses = false) => {';
const endMark='    const collectAkathistInitialRanges = (value, includeInvocations = true, extraResponses = false) => {';
const marker='MOLITVOSLOV_AKATHIST_IKOS_BOUNDARY_ACCENTS_V1';
let src=original.slice(bom.length).replace(/\r\n/g,'\n');
if(src.includes(marker)){
 console.log('PASS: cautious Ikos response layout is already installed. NO FILES MODIFIED.');
 process.exit(0);
}
const a=src.indexOf(startMark),b=src.indexOf(endMark,a);
if(a<0||b<0||src.indexOf(startMark,a+1)>=0)
 throw Error('Runtime response collector structure differs. NO FILES MODIFIED.');
const current=src.slice(a,b);
if(!current.includes('const collectAkathistJoyBreaks')||
   !current.includes('collectAkathistQuotedSpeechRanges'))
 throw Error('Runtime markers are incomplete; no files modified.');
const replacement=String.raw