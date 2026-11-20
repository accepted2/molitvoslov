#!/usr/bin/env node
'use strict';
// Safe reversible WebView-only Ikos/Kontakion 1 typography update.
// Original source data, UTF-16 offsets and bookmark IDs are untouched.
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
 console.log('PASS: cautious Ikos response layout already installed. NO FILES MODIFIED.');
 process.exit(0);
}
const a=src.indexOf(startMark),b=src.indexOf(endMark,a);
if(a<0||b<0||src.indexOf(startMark,a+1)>=0)
 throw Error('Runtime response collector differs. NO FILES MODIFIED.');
const current=src.slice(a,b);
if(!current.includes('const collectAkathistJoyBreaks')||
   !current.includes('collectAkathistQuotedSpeechRanges'))
 throw Error('Runtime markers incomplete. NO FILES MODIFIED.');
const replacement = "    // MOLITVOSLOV_AKATHIST_IKOS_BOUNDARY_ACCENTS_V1\n    // An invocation is a liturgical line/clause, not an arbitrary word\n    // \"Радуйся\" inside prose. Preserve original UTF-16 offsets.\n    const isAkathistResponseBoundary = (source, start) => {\n      const before = String(source || '').slice(0, start);\n      return !before.trim() ||\n        /(?:[.!?…;:][ \\t]*|[\\r\\n][ \\t]*)$/u.test(before);\n    };\n    const expandAkathistResponseHead = (source, range) => {\n      const value = String(source || '');\n      const end = range.end;\n      const suffix = value.slice(end);\n      // \"Радуйся, ...\" : only the invocation and the comma are red.\n      const immediate = suffix.match(/^[ \\t]*,/u);\n      if (immediate) return {start: range.start, end: end + immediate[0].length};\n      // \"Святителю Николае, ...\" or another short address before comma.\n      // Maximum three extra words, 45 characters, no new sentences.\n      const head = suffix.match(/^([ \\t]+(?:[\\p{L}\\u0300-\\u036f\\u0483-\\u0489-]+[ \\t]+){0,2}[\\p{L}\\u0300-\\u036f\\u0483-\\u0489-]+[ \\t]*),/u);\n      if (!head || head[0].length > 45 ||\n          /[;:!?.…\\r\\n]/u.test(head[1])) return range;\n      return {start: range.start, end: end + head[0].length};\n    };\n    const collectAkathistRefrainRanges = (value, extraResponses = false) => {\n      const source = String(value || '');\n      const standard = collectAkathistInvocationRanges(source);\n      const combined = extraResponses\n        ? [...standard, ...collectAkathistAdditionalResponseRanges(source)] : standard;\n      const quotedSpeech = collectAkathistQuotedSpeechRanges(source);\n      const accepted = combined\n        .filter(range =>\n          isAkathistResponseBoundary(source, range.start) &&\n          !quotedSpeech.some(quote =>\n            range.start >= quote.start && range.start < quote.end))\n        .map(range => expandAkathistResponseHead(source, range))\n        .sort((left, right) => left.start - right.start || right.end - left.end);\n      // Keep the longest address if \"Господи\" and \"Господи мой\" overlap.\n      return accepted.filter((range, index) =>\n        !accepted.slice(0,index).some(other => other.end > range.start)\n      );\n    };\n    const collectAkathistAlleluiaRanges = value =>\n      collectAkathistWordRanges(value, /(?:Аллилуиа|Аллилуия|Алилуиа|Алілуя|Аллілуя)/giu, true);\n    const collectAkathistJoyBreaks = (value, extraResponses = false) =>\n      new Set(collectAkathistRefrainRanges(value, extraResponses)\n        .map(range => range.start)\n        .filter(at => at > 0 && !/[\\r\\n][ \\t]*$/u.test(String(value || '').slice(0, at))));\n";
src=src.slice(0,a)+replacement+src.slice(b);
parse(src,{sourceType:'module',plugins:['jsx']});
let updated=bom+src;
if(original.includes('\r\n'))updated=updated.replace(/\n/g,'\r\n');
if(process.argv.includes('--dry-run')){
 console.log('DRY RUN PASS: boundary-aware Ikos invocations only. NO FILES MODIFIED.');
 process.exit(0);
}
const backup=path.resolve(root,'..','build-backups','akathist-ikos-before-'+
 new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backup,{recursive:true});
fs.copyFileSync(file,path.join(backup,'runtime.js'));
fs.writeFileSync(file,updated,'utf8');
console.log('PASS: Akathist litany vocatives formatted conservatively; original text preserved.');
console.log('BACKUP:',backup);
