#!/usr/bin/env node
'use strict';
// Complete CS Traditional Communion PREPARATION only; preserve other modes.
const fs=require('node:fs'), path=require('node:path'), {parse}=require('@babel/parser');
const app=path.resolve(__dirname,'..'), readerPath=path.join(app,'src/components/reader/PrayerRuleReader.js');
const dry=process.argv.includes('--dry-run');
const marker='/* CS_TRAD_COMMUNION_SOURCE_20261121 */';
function assert(v,m){if(!v)throw Error(m)}
function exactly(s,oldText,newText,what){
  if(s.includes(newText))return s;
  const count=s.split(oldText).length-1;
  assert(count===1,what+': expected 1 anchor, found '+count);
  return s.replace(oldText,newText);
}
const css=[
 '    '+marker,
 '    /* Exact uploaded traditional text; the same font and rubric palette. */',
 '    body.communion-preparation.traditional-mode.communion-traditional-source .section-title {',
 "      font-family: 'Ponomar', Georgia, 'Times New Roman', serif;",
 '      color: var(--reader-section-heading, #5A3822) !important;',
 '      font-size: 20px;',
 '      line-height: 1.35;',
 '      text-align: center;',
 '      margin-bottom: 6px !important;',
 '    }',
 '    body.communion-preparation.traditional-mode.communion-traditional-source .rule-item.communion-traditional-heading {',
 '      border-bottom: 0 !important;',
 '      margin-bottom: 0 !important;',
 '      padding-bottom: 0 !important;',
 '    }',
 '    body.communion-preparation.traditional-mode.communion-traditional-source .reader-text {',
 '      white-space: pre-line;',
 '    }',
 ''
].join('\n');
function patch(source){
 let s=source;
 const imp="import {completeCommunionTraditionalRule} from '../../services/communionTraditionalRule';";
 if(!s.includes(imp))s=exactly(s,"import {getCommunionRuleKind,",
   imp+"\nimport {getCommunionRuleKind,",'Traditional rule import');
 if(!s.includes(marker))s=exactly(s,
   '    /* The first "Слава..." text and next "И ныне..." text form one',
   css+'    /* The first "Слава..." text and next "И ныне..." text form one',
   'Scoped traditional styles');
 const cls="document.body.classList.add('communion-traditional-source');";
 if(!s.includes(cls))s=exactly(s,
   "      if (isCommunionReadingRule) {",
   "      if (DATA.rule?.communionTraditionalEdition) {\n"+
   "        "+cls+"\n      }\n      if (isCommunionReadingRule) {",
   'Traditional WebView scope');
 const tag="wrapper.classList.add('communion-traditional-heading');";
 if(!s.includes(tag))s=exactly(s,
   '          if (paschalOpeningItemIds.has(Number(item.id))) {',
   "          if (DATA.rule?.communionTraditionalEdition && item.communionTraditionalHeading) {\n"+
   "            "+tag+"\n          }\n          if (paschalOpeningItemIds.has(Number(item.id))) {",
   'Traditional heading class');
 const start=s.indexOf('const buildHtml = ({'),end=s.indexOf('\nconst PrayerRuleReader = forwardRef',start);
 assert(start>=0&&end>start,'Cannot isolate buildHtml()');
 let build=s.slice(start,end);
 build=exactly(build,
   '  const communionKind = getCommunionRuleKind(rule);',
   '  const communionKind = getCommunionRuleKind(rule);\n'+
   '  const traditionalReadingRule = completeCommunionTraditionalRule(rule, viewMode);',
   'Traditional rule before HTML payload');
 build=exactly(build,'    const items = rule?.items || [];',
   '    const items = traditionalReadingRule?.items || [];',
   'Traditional joined hymns');
 build=exactly(build,'    for (const item of rule?.items || []) {',
   '    for (const item of traditionalReadingRule?.items || []) {',
   'Traditional typography metadata');
 build=exactly(build,
   '  const displayRule = communionKind && rule',
   '  const displayRule = communionKind && traditionalReadingRule',
   'Traditional display guard');
 build=exactly(build,
   '        ...rule,\n        items: (rule.items || []).map(item => {',
   '        ...traditionalReadingRule,\n        items: (traditionalReadingRule.items || []).map(item => {',
   'Traditional display items');
 build=exactly(build,
   '    : rule;\n  const payload = {',
   '    : traditionalReadingRule;\n  const payload = {',
   'Traditional non-communion fallback');
 s=s.slice(0,start)+build+s.slice(end);
 return s;
}
function verify(s){
 for(const fragment of [marker,
   'const traditionalReadingRule = completeCommunionTraditionalRule(rule, viewMode);',
   'items: (traditionalReadingRule.items || []).map(item => {',
   "wrapper.classList.add('communion-traditional-heading');",
   "document.body.classList.add('communion-traditional-source');"]){
   assert(s.includes(fragment),'Missing patch fragment: '+fragment);
 }
 assert(s.split(marker).length===2,'Duplicate scoped styles');
}
function validateSource(){
 const sourceFile=path.join(app,'src/data/communionTraditionalSource.json');
 const helperFile=path.join(app,'src/services/communionTraditionalRule.js');
 assert(fs.existsSync(sourceFile)&&fs.existsSync(helperFile),
   'Restore the uploaded traditional JSON and rule helper from GitHub first');
 const source=JSON.parse(fs.readFileSync(sourceFile,'utf8'));
 assert(source.document==='posledovanie-ko-svyatomu-prichashcheniyu',
   'Unexpected traditional rule document');
 const total=source.groups?.reduce((count,g)=>count+(g.blocks?.length||0),0);
 assert(source.groups?.length===27&&total===108,
   'Incomplete traditional Communion source: '+source.groups?.length+' sections / '+total+' blocks');
 assert(source.groups.at(-1)?.blocks?.at(-1)?.text?.startsWith('Ве́чери Твоея́'),
   'Missing final Communion prayer');
 const helper=fs.readFileSync(helperFile,'utf8');
 parse(helper,{sourceType:'module',plugins:['jsx']});
 assert(helper.includes('export const completeCommunionTraditionalRule'),
   'Traditional rule builder missing');
 console.log('VERIFIED: 27 sections, 108 traditional text blocks, final prayer included.');
}
let before,after,output;
try{
 validateSource();
 before=fs.readFileSync(readerPath,'utf8');
 after=patch(before.replace(/\r\n/g,'\n'));
 parse(after,{sourceType:'module',plugins:['jsx']});
 assert(patch(after)===after,'Patch is not idempotent');
 verify(after);
 output=before.includes('\r\n')?after.replace(/\n/g,'\r\n'):after;
}catch(e){
 console.error('STOP:',e.message);
 console.error('NO SOURCE FILES MODIFIED.');process.exit(1);
}
console.log('PASS: only CS Traditional Communion reader tab; RU/CS/parallel unchanged.');
console.log('TO UPDATE:',output===before?'none':'PrayerRuleReader.js');
if(dry){console.log('DRY RUN. NO SOURCE FILES MODIFIED.');process.exit(0)}
if(output===before){console.log('ALREADY APPLIED.');process.exit(0)}
const backup=path.join(app,'..','build-backups','communion-traditional-'+
 new Date().toISOString().replace(/[:.]/g,'-'),'src/components/reader/PrayerRuleReader.js');
try{
 fs.mkdirSync(path.dirname(backup),{recursive:true});
 fs.writeFileSync(backup,before,'utf8');
 fs.writeFileSync(readerPath,output,'utf8');
 const read=fs.readFileSync(readerPath,'utf8').replace(/\r\n/g,'\n');
 parse(read,{sourceType:'module',plugins:['jsx']});verify(read);
}catch(e){
 fs.writeFileSync(readerPath,before,'utf8');
 console.error('ERROR, ORIGINAL RESTORED:',e.message);
 console.error('BACKUP:',backup);process.exit(1);
}
console.log('UPDATED: src/components/reader/PrayerRuleReader.js');
console.log('SUCCESS. BACKUP:',backup);
