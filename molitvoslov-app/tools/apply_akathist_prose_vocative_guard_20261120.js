#!/usr/bin/env node
'use strict';
// Patch the Akathist WebView only. No original source text or saved
// highlights are edited. Every anchor is checked; dry-run writes nothing.
const fs=require('node:fs'),path=require('node:path');
const {parse}=require('@babel/parser');
const app=path.resolve(__dirname,'..');
const file=path.join(app,'src/components/reader/selectableDocumentReader/runtime.js');
const raw=fs.readFileSync(file,'utf8');
const bom=raw.startsWith('\uFEFF')?'\uFEFF':'';
let content=raw.slice(bom.length).replace(/\r\n/g,'\n');
const marker='MOLITVOSLOV_AKATHIST_PROSE_VOCATIVE_GUARD_V1';
if(content.includes(marker)){
 console.log('PASS: Akathist prose protection already installed. NO FILES MODIFIED.');
 process.exit(0);
}
if(!content.includes('MOLITVOSLOV_AKATHIST_IKOS_BOUNDARY_ACCENTS_V1'))
 throw Error('Missing first Akathist Ikos patch. NO FILES MODIFIED.');
const before="      const accepted = combined\n        .filter(range =>\n          isAkathistResponseBoundary(source, range.start) &&\n          !quotedSpeech.some(quote =>\n            range.start >= quote.start && range.start < quote.end))\n        .map(range => expandAkathistResponseHead(source, range))";
const after="      // MOLITVOSLOV_AKATHIST_PROSE_VOCATIVE_GUARD_V1\n      // A solitary \"Иисусе\" in the introductory narration is not a\n      // refrain when the Ikos has a repeated \"Слава Тебе\" litany.\n      // Derive the dominant response from this Ikos, not the Akathist name.\n      // No source text or UTF-16 offsets are changed.\n      const familyFor = range => {\n        const head = normalizedAkathistRefrainWithIndex(\n          source.slice(range.start, range.end)\n        ).normalized.toLowerCase().replace(/[ \\t]+/gu, ' ').trim();\n        if (/^слава теб[еѣ]$/u.test(head)) return 'glory';\n        if (/^рад(?:уйся|уйтеся|ꙋйсѧ)$/u.test(head)) return 'rejoice';\n        if (/^(?:иисусе|іисусе|исусе|и исусе)$/u.test(head)) return 'jesus';\n        if (/^(?:прииди|приди|прийди)$/u.test(head)) return 'come';\n        if (/^господи мой$/u.test(head)) return 'my-lord';\n        return head;\n      };\n      const candidateFamilies = new Map();\n      if (extraResponses) {\n        for (const range of candidates) {\n          const family = familyFor(range);\n          candidateFamilies.set(family,(candidateFamilies.get(family)||0)+1);\n        }\n      }\n      const dominant = [...candidateFamilies.entries()]\n        .sort((a,b)=>b[1]-a[1])[0] || null;\n      const trusted = candidates.filter(range => {\n        if (!extraResponses || !dominant || dominant[1] < 3) return true;\n        const family=familyFor(range);\n        return family===dominant[0] ||\n          (candidateFamilies.get(family)||0) >= 2;\n      });\n\n      const accepted = trusted\n        .map(range => expandAkathistResponseHead(source, range))";
if(content.split(before).length!==2)
 throw Error('Refrain collector differs. NO FILES MODIFIED.');
const quoteAnchor="      const quotedSpeech = collectAkathistQuotedSpeechRanges(source);\n";
const candidateInsert="      const candidates = combined\n        .filter(range =>\n          isAkathistResponseBoundary(source, range.start) &&\n          !quotedSpeech.some(quote =>\n            range.start >= quote.start && range.start < quote.end));\n";
if(content.split(quoteAnchor).length!==2)
 throw Error('Quotation collector differs. NO FILES MODIFIED.');
content=content.replace(before,after)
 .replace(quoteAnchor,quoteAnchor+candidateInsert);
parse(content,{sourceType:'module',plugins:['jsx']});
let updated=bom+content;
if(raw.includes('\r\n'))updated=updated.replace(/\n/g,'\r\n');
if(process.argv.includes('--dry-run')){
 console.log('DRY RUN PASS: preserve narrative vocatives when another refrain dominates.');
 console.log('NO FILES MODIFIED.');
 process.exit(0);
}
const backup=path.resolve(app,'..','build-backups','akathist-prose-vocatives-before-'+
 new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backup,{recursive:true});
fs.copyFileSync(file,path.join(backup,'runtime.js'));
fs.writeFileSync(file,updated,'utf8');
console.log('PASS: isolated non-refrain vocatives are not red or line-broken.');
console.log('BACKUP:',backup);
