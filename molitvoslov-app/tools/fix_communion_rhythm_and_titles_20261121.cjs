#!/usr/bin/env node
'use strict';
// Fix only the Communion PREPARATION reading layout. Nothing is changed in
// morning/evening prayers, thanksgiving, canons or source prayer data.
const fs=require('node:fs');
const path=require('node:path');
const {parse}=require('@babel/parser');

const app=path.resolve(__dirname,'..');
const file=path.join(app,'src/components/reader/PrayerRuleReader.js');
const root=path.resolve(app,'..');
const dry=process.argv.includes('--dry-run');
const marker='    /* The first "Слава..." text and next "И ныне..." text form one';
const id='/* Communion preparation rhythm v2 - scoped, no source edits */';

const css=[
  '    '+id,
  '    /* Same brown heading ink in Church Slavonic, Russian and parallel. */',
  '    body.communion-preparation .rule-title,',
  '    body.communion-preparation .section-title,',
  '    body.communion-preparation .section-header .prayer-title,',
  '    body.communion-preparation.traditional-mode .rule-title,',
  '    body.communion-preparation.traditional-mode .section-title,',
  '    body.communion-preparation.traditional-mode .section-header .prayer-title {',
  '      color: var(--reader-section-heading, #5A3822) !important;',
  '    }',
  '    /* Remove the repeated 12px bottom margin + padding on each verse. */',
  '    body.communion-preparation .rule-item {',
  '      margin-bottom: 2px !important;',
  '      padding-bottom: 4px !important;',
  '    }',
  '    /* No border/extra gap between a title-only section and its text. */',
  '    body.communion-preparation .rule-item.communion-heading-only {',
  '      border-bottom: 0 !important;',
  '      margin-bottom: 0 !important;',
  '      padding-bottom: 0 !important;',
  '    }',
  '    /* Exactly +2px below the prior compact section heading (4 -> 6). */',
  '    body.communion-preparation .rule-item > .section-title {',
  '      margin-bottom: 6px !important;',
  '    }',
  '    /* Prayer headings in the action header: prior 8 -> 10. */',
  '    body.communion-preparation .rule-item > .section-header {',
  '      margin-bottom: 10px !important;',
  '    }',
  '    /* "Слава" and "И ныне" are within one continuous hymn, not two',
  '       widely separated paragraphs. */',
  '    body.communion-preparation .rule-item.communion-joined-troparion-first {',
  '      border-bottom: 0 !important;',
  '      margin-bottom: 0 !important;',
  '      padding-bottom: 0 !important;',
  '    }',
  '    /* The Russian text renderer already inserts a <br> at its doxology',
  '       boundary. White-space:pre-line would turn the original newline',
  '       into a SECOND visible break. Keep the DOM break, not both. */',
  '    body.communion-preparation .reader-text.communion-russian-linebreaks {',
  '      white-space: normal !important;',
  '    }',
  '    /* Parallel translation is not passed through renderTextItem; retain',
  '       its single source newline here without a generated <br>. */',
  '    body.communion-preparation .translation-text.communion-russian-linebreaks {',
  '      white-space: pre-line !important;',
  '    }',
  '',
].join('\n');

function patch(source){
  if(source.includes(id)){
    if(source.split(id).length!==2)throw Error('Duplicate Communion rhythm patch');
    return source;
  }
  const matches=source.split(marker).length-1;
  if(matches!==1)throw Error('Reader anchor mismatch: expected 1, found '+matches);
  return source.replace(marker,css+marker);
}
function verify(text){
  const checks={
    scopedColor:text.includes('body.communion-preparation.traditional-mode .section-title'),
    sameColor:text.includes('color: var(--reader-section-heading, #5A3822) !important;'),
    headingSpacing:text.includes('margin-bottom: 6px !important;'),
    compactItems:text.includes('margin-bottom: 2px !important;'),
    separateMainBreak:text.includes('body.communion-preparation .reader-text.communion-russian-linebreaks {\n      white-space: normal !important;'),
    separateParallelBreak:text.includes('body.communion-preparation .translation-text.communion-russian-linebreaks {\n      white-space: pre-line !important;'),
    preservesOtherRules:!css.includes('body.morning-rule')&&!css.includes('body.evening-rule')&&!css.includes('body.communion-thanksgiving'),
  };
  const failed=Object.entries(checks).filter(([,ok])=>!ok).map(([name])=>name);
  if(failed.length)throw Error('Required checks failed: '+failed.join(', '));
  return checks;
}

let before,after,output;
try{
  before=fs.readFileSync(file,'utf8');
  after=patch(before.replace(/\r\n/g,'\n'));
  parse(after,{sourceType:'module',plugins:['jsx']});
  if(patch(after)!==after)throw Error('Patch is not idempotent');
  verify(after);
  output=before.includes('\r\n')?after.replace(/\n/g,'\r\n'):after;
}catch(error){
  console.error('STOP:',error.message);
  console.error('NO SOURCE FILES MODIFIED.');
  process.exit(1);
}
console.log('PASS: Communion preparation only, both CS and RU titles.');
console.log('PASS: single doxology line break, compact verses, +2px after headings.');
if(dry){
  console.log(output===before?'DRY RUN: already applied':'DRY RUN: one reader file would change');
  console.log('NO SOURCE FILES MODIFIED.');
  process.exit(0);
}
if(output===before){
  console.log('ALREADY APPLIED. NO SOURCE FILES MODIFIED.');
  process.exit(0);
}
const backup=path.join(root,'build-backups','communion-rhythm-'+
  new Date().toISOString().replace(/[:.]/g,'-'));
const copy=path.join(backup,'src/components/reader/PrayerRuleReader.js');
try{
  fs.mkdirSync(path.dirname(copy),{recursive:true});
  fs.writeFileSync(copy,before,'utf8');
  fs.writeFileSync(file,output,'utf8');
  const saved=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');
  parse(saved,{sourceType:'module',plugins:['jsx']});
  verify(saved);
}catch(error){
  fs.writeFileSync(file,before,'utf8');
  console.error('ERROR: original restored.',error.message);
  console.error('BACKUP:',copy);
  process.exit(1);
}
console.log('UPDATED: src/components/reader/PrayerRuleReader.js');
console.log('SUCCESS. BACKUP:',copy);
