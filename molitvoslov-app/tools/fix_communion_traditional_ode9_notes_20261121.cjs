#!/usr/bin/env node
'use strict';
// Only the user's "ЦС трад" Communion rule: compact the post-9th-Ode
// penitential troparia, and render the editorial instructions in Ponomar.
// Preserve all source content, selection offsets, bookmarks and other tabs.
const fs=require('node:fs');
const path=require('node:path');
const {parse}=require('@babel/parser');
const app=path.resolve(__dirname,'..');
const sourcePath=path.join(app,'src/components/reader/PrayerRuleReader.js');
const helperPath=path.join(app,'src/services/communionTraditionalRule.js');
const dataPath=path.join(app,'src/data/communionTraditionalSource.json');
const dry=process.argv.includes('--dry-run');
const marker='/* COMMUNION_TRAD_ODE9_NOTES_V7_20261121 */';

function ensure(test,description){if(!test)throw Error(description);}
function one(s,from,to,label){
  if(s.includes(to))return s;
  const count=s.split(from).length-1;
  ensure(count===1,label+': expected one anchor, found '+count);
  return s.replace(from,to);
}
const css=[
  '    '+marker,
  '    /* 9th Ode penitential troparia have the SAME compact rhythm as',
  '       tone-eight troparia. No lines or paragraph gaps between Glory,',
  '       its troparion, And now, and the following Theotokion. */',
  '    body.communion-preparation.traditional-mode.communion-traditional-source .rule-item.communion-trad-penitential:not(.communion-trad-end) {',
  '      border-bottom: 0 !important;',
  '      margin-top: 0 !important;',
  '      margin-bottom: 1px !important;',
  '      padding-top: 0 !important;',
  '      padding-bottom: 0 !important;',
  '    }',
  '    body.communion-preparation.traditional-mode.communion-traditional-source .rule-item.communion-trad-penitential .reader-text {',
  '      margin-top: 0 !important;',
  '      margin-bottom: 0 !important;',
  '      padding-top: 0 !important;',
  '      padding-bottom: 0 !important;',
  '      line-height: 1.48 !important;',
  '    }',
  '    body.communion-preparation.traditional-mode.communion-traditional-source .rule-item.communion-trad-penitential.communion-trad-glory .reader-text {',
  '      line-height: 1.3 !important;',
  '    }',
  '    body.communion-preparation.traditional-mode.communion-traditional-source .rule-item.communion-trad-penitential .reader-inline {',
  '      margin-top: 0 !important;',
  '      margin-bottom: 0 !important;',
  '      padding-top: 0 !important;',
  '      padding-bottom: 0 !important;',
  '    }',
  '    /* The three short notes are Church Slavonic editorial directions.',
  '       Georgia from the older V4 style caused Cyrillic glyph fallback;',
  '       use the same Ponomar font as the traditional prayer text. */',
  '    body.communion-preparation.traditional-mode.communion-traditional-source .rule-item.communion-trad-note .instruction {',
  "      font-family: 'Ponomar', Georgia, 'Times New Roman', serif !important;",
  '      color: var(--secondary, #5A3822) !important;',
  '      font-size: 15px !important;',
  '      font-weight: 400 !important;',
  '      font-style: normal !important;',
  '      line-height: 1.45 !important;',
  '      text-align: left !important;',
  '      text-align-last: left !important;',
  '      margin: 0 !important;',
  '      padding: 0 !important;',
  '      letter-spacing: normal !important;',
  '    }',
  ''
].join('\n');
function patch(original){
  let s=original;
  ensure(s.includes('const traditionalReadingRule = completeCommunionTraditionalRule(rule, viewMode);'),
    'The full traditional Communion reader is not connected');
  ensure(s.includes("wrapper.classList.add('communion-trad-joined')"),
    'The previous traditional troparion layout was not installed');
  ensure(s.includes("wrapper.classList.add('communion-trad-note')"),
    'The previous traditional instruction styling was not installed');
  if(!s.includes("wrapper.classList.add('communion-trad-penitential')")){
    const anchor=
      "            if (item.communionTraditionalTroparionSet) wrapper.classList.add('communion-trad-joined');";
    s=one(s,anchor,anchor+'\n'+
      "            if (item.communionTraditionalPenitentialTroparion) wrapper.classList.add('communion-trad-penitential');",
      'Mark the five penitential troparia');
  }
  if(!s.includes(marker)){
    const anchor='    /* The first "Слава..." text and next "И ныне..." text form one';
    s=one(s,anchor,css+anchor,'Scoped Church Slavonic styling');
  }
  return s;
}
function verify(updated){
  for(const fragment of [
    marker,
    "wrapper.classList.add('communion-trad-penitential')",
    '.rule-item.communion-trad-penitential:not(.communion-trad-end)',
    '.rule-item.communion-trad-penitential.communion-trad-glory .reader-text',
    ".rule-item.communion-trad-note .instruction {",
    "font-family: 'Ponomar', Georgia, 'Times New Roman', serif !important;",
    'font-style: normal !important;',
    'text-align: left !important;'
  ])ensure(updated.includes(fragment),'Patch incomplete: '+fragment);
  ensure(updated.split(marker).length===2,'Duplicate traditional V7 styles');
}
function checkSource(){
  ensure(fs.existsSync(helperPath)&&fs.existsSync(dataPath),
    'Restore the updated communionTraditionalRule.js from GitHub first');
  const helper=fs.readFileSync(helperPath,'utf8');
  parse(helper,{sourceType:'module',plugins:['jsx']});
  ensure(helper.includes('communionTraditionalPenitentialTroparion:penitentialTroparion'),
    'Old traditional rule helper: 9th Ode troparion metadata missing');
  for(const phrase of [
    'И҆ стїхѝ сїѧ̑:',
    'И҆́ныѧ стїхѝ:',
    'А҆́ще же пра́здника нѣ́сть, тропарѝ покаѧ́нныѧ:'
  ])ensure(helper.includes(phrase),'Old traditional editorial note: '+phrase);
  const source=JSON.parse(fs.readFileSync(dataPath,'utf8'));
  ensure(source.groups?.length===27 &&
    source.groups.reduce((n,g)=>n+(g.blocks?.length||0),0)===108,
    'Traditional source must contain 27 sections and 108 original blocks');
  const ode9=source.groups[14];
  ensure(ode9?.title==='Песнь 9' &&
    ode9.blocks.slice(9,14).map(x=>x.rubric).join('|')===
      'Тропарь праздника|Слава|Тропарь|И ныне|Богородичен',
    'Unexpected Ninth Ode penitential troparion order');
  console.log('VERIFIED: 108 blocks, five penitential troparia, three Church Slavonic notes.');
}
let original,updated,output;
try{
  checkSource();
  original=fs.readFileSync(sourcePath,'utf8');
  updated=patch(original.replace(/\r\n/g,'\n'));
  parse(updated,{sourceType:'module',plugins:['jsx']});
  verify(updated);
  ensure(patch(updated)===updated,'Patch is not repeatable');
  output=original.includes('\r\n')?updated.replace(/\n/g,'\r\n'):updated;
}catch(error){
  console.error('STOP:',error.message);
  console.error('NO SOURCE FILES MODIFIED.');
  process.exit(1);
}
console.log('PASS: compact 9th-Ode troparia; Church Slavonic Ponomar editorial notes.');
console.log('TO UPDATE:',output===original?'none':'src/components/reader/PrayerRuleReader.js');
if(dry){console.log('DRY RUN. NO SOURCE FILES MODIFIED.');process.exit(0)}
if(output===original){console.log('ALREADY APPLIED.');process.exit(0)}
const backup=path.join(app,'..','build-backups',
  'communion-trad-ode9-'+new Date().toISOString().replace(/[:.]/g,'-'),
  'src/components/reader/PrayerRuleReader.js');
try{
  fs.mkdirSync(path.dirname(backup),{recursive:true});
  fs.writeFileSync(backup,original,'utf8');
  fs.writeFileSync(sourcePath,output,'utf8');
  const checked=fs.readFileSync(sourcePath,'utf8').replace(/\r\n/g,'\n');
  parse(checked,{sourceType:'module',plugins:['jsx']});
  verify(checked);
}catch(error){
  fs.writeFileSync(sourcePath,original,'utf8');
  console.error('ERROR. ORIGINAL RESTORED:',error.message);
  console.error('BACKUP:',backup);
  process.exit(1);
}
console.log('UPDATED: src/components/reader/PrayerRuleReader.js');
console.log('SUCCESS. BACKUP:',backup);
