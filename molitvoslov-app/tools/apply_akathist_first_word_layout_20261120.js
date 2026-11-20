#!/usr/bin/env node
'use strict';
// Safe WebView-only Akathist typography correction.
// Apply after the existing Ikos/prose guards; original prayer texts,
// bookmarks, search indexes and reader offsets are NEVER rewritten.
// --dry-run checks all anchors and syntax without writing.
const fs=require('node:fs'),path=require('node:path');
const {parse}=require('@babel/parser');
const app=path.resolve(__dirname,'..');
const file=path.join(app,'src/components/reader/selectableDocumentReader/runtime.js');
const raw=fs.readFileSync(file,'utf8'),bom=raw.startsWith('\uFEFF')?'\uFEFF':'';
let source=raw.slice(bom.length).replace(/\r\n/g,'\n');
const marker='MOLITVOSLOV_AKATHIST_FIRST_WORD_RESPONSE_V1';
if(source.includes(marker)){
 console.log('PASS: first-word Akathist typography already installed. NO FILES MODIFIED.');
 process.exit(0);
}
if(!source.includes('MOLITVOSLOV_AKATHIST_IKOS_BOUNDARY_ACCENTS_V1') ||
   !source.includes('MOLITVOSLOV_AKATHIST_PROSE_VOCATIVE_GUARD_V1'))
 throw Error('Apply both previous Akathist typography patches first. NO FILES MODIFIED.');
const replaceOnce=(before,after,description)=>{
 const count=source.split(before).length-1;
 if(count!==1)throw Error(description+' does not match current runtime ('+
   count+' matches). NO FILES MODIFIED.');
 source=source.replace(before,after);
};
const insertion="    // MOLITVOSLOV_AKATHIST_FIRST_WORD_RESPONSE_V1\n    // The source text and its UTF-16 offsets are immutable. Only the first\n    // complete (accent-aware) word in a recognized hymn response gets red ink.\n    const firstAkathistResponseWord = (source, range) => {\n      const tail = String(source || '').slice(range.start);\n      const word = tail.match(/^[\\p{L}\\p{M}]+(?:[-\\u2011][\\p{L}\\p{M}]+)*/u);\n      return word\n        ? {start: range.start, end: range.start + word[0].length}\n        : range;\n    };\n    // Some Akathists do NOT use \"Радуйся\" or \"Иисусе\" at all. Discover\n    // other recurring opening formulas, but only if they are repeated at\n    // least three times at real clause boundaries within this same hymn.\n    // This avoids treating isolated quotations after colons as responses.\n    const collectAkathistRepeatedOpeningRanges = value => {\n      const source = String(value || '');\n      const {normalized, originalIndex} = normalizedAkathistRefrainWithIndex(source);\n      const forms = [\n        /Христос[ \\t]+воскресе/giu,\n        /Гряди/giu,\n        /Благословен[ \\t]+еси/giu,\n        /Свят[ \\t]*,[ \\t]*Свят[ \\t]*,[ \\t]*Свят/giu,\n      ];\n      const output = [];\n      for (const pattern of forms) {\n        const candidates = [];\n        for (const match of normalized.matchAll(pattern)) {\n          const before = normalized[match.index - 1] || '';\n          const after = normalized[match.index + match[0].length] || '';\n          if (/\\p{L}/u.test(before) || /\\p{L}/u.test(after)) continue;\n          const start = originalIndex[match.index];\n          const last = originalIndex[match.index + match[0].length - 1];\n          if (!Number.isFinite(start) || !Number.isFinite(last) ||\n              !isAkathistResponseBoundary(source, start)) continue;\n          candidates.push({start, end: last + 1});\n        }\n        // The repeated response must be truly recurrent in the document.\n        if (candidates.length >= 3) output.push(...candidates);\n      }\n      return output;\n    };\n";
const anchor='    const collectAkathistRefrainRanges = (value, extraResponses = false) => {';
replaceOnce(anchor,insertion+anchor,'Akathist typography helper position');
replaceOnce("      const standard = collectAkathistInvocationRanges(source);\n      const combined = extraResponses\n        ? [...standard, ...collectAkathistAdditionalResponseRanges(source)] : standard;","      const standard = collectAkathistInvocationRanges(source);\n      const repeated = collectAkathistRepeatedOpeningRanges(source);\n      const combined = extraResponses\n        ? [...standard, ...collectAkathistAdditionalResponseRanges(source), ...repeated]\n        : [...standard, ...repeated];",'response candidate collector');
replaceOnce("      const accepted = trusted\n        .map(range => expandAkathistResponseHead(source, range))","      const accepted = trusted\n        .map(range => firstAkathistResponseWord(source, range))",'response red-span mapping');
replaceOnce("      if (opening) {\n        const start = opening.index + opening[0].indexOf(opening[1]);","      // Introductory narrative in Ikoses/Kontakion 1 stays ordinary ink.\n      // Other Akathist sections keep their established decorative initial.\n      if (opening && !includeInvocations) {\n        const start = opening.index + opening[0].indexOf(opening[1]);",'ordinary prose opening color');
replaceOnce("        if (!extraResponses || !dominant || dominant[1] < 3) return true;","        if (!extraResponses) return true;\n        // A solitary \"Иисусе\" after \"сказал:\" is ambiguous narrative,\n        // not a repeated chant. Only accept single Ikos invocations when\n        // their immediately preceding clause explicitly cues the refrain.\n        if (!dominant || dominant[1] < 2) {\n          const preface = normalizedAkathistRefrainWithIndex(\n            source.slice(Math.max(0, range.start - 100), range.start)\n          ).normalized.toLowerCase();\n          return /(?:вопи[^\\s:]*|взыв[^\\s:]*|зов[^\\s:]*|поем|поют|пойте|воспева[^\\s:]*|возглаша[^\\s:]*|восклица[^\\s:]*)[^.!?;:\\n]{0,44}:\\s*$/iu.test(preface);\n        }\n        if (dominant[1] < 3) return true;",'isolated prose vocatives after colon');
parse(source,{sourceType:'module',plugins:['jsx']});
let updated=bom+source;
if(raw.includes('\r\n'))updated=updated.replace(/\n/g,'\r\n');
if(process.argv.includes('--dry-run')){
 console.log('DRY RUN PASS: every recognized response begins a line; only its first word turns red.');
 console.log('DRY RUN PASS: repeated special formulas recognized; ordinary prose protected.');
 console.log('NO FILES MODIFIED.');
 process.exit(0);
}
const backup=path.resolve(app,'..','build-backups','akathist-first-word-before-'+
 new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backup,{recursive:true});
fs.copyFileSync(file,path.join(backup,'runtime.js'));
fs.writeFileSync(file,updated,'utf8');
console.log('PASS: Akathist first-word red typography installed. Original source text preserved.');
console.log('BACKUP:',backup);
