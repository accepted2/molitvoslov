#!/usr/bin/env node
'use strict';
// Display-only fixes, scoped to Communion PREPARATION.
const fs=require('node:fs'),path=require('node:path');
const {parse}=require('@babel/parser');
const app=path.resolve(__dirname,'..');
const sourceFile=path.join(app,'src/components/reader/PrayerRuleReader.js');
const dry=process.argv.includes('--dry-run');
const marker='/* communion-final-indicators-and-titles-20261121 */';
function assert(condition,message){if(!condition)throw Error(message)}
function one(s,from,to,name){
  if(s.includes(to))return s;
  const count=s.split(from).length-1;
  assert(count===1,name+' anchor count '+count);
  return s.replace(from,to);
}
const css=[
  '    '+marker,
  '    /* Remove only dividers below the final small directions, such as',
  '       "Потом тропари", "Также молитву" and "И ещё". */',
  '    body.communion-preparation .rule-item.communion-final-indicator {',
  '      border-bottom: 0 !important;',
  '      margin-bottom: 2px !important;',
  '      padding-bottom: 0 !important;',
  '    }',
  '    /* Give selected long headings two deliberate centered lines. */',
  '    body.communion-preparation .communion-split-title {',
  '      text-align: center !important;',
  '      word-break: normal !important;',
  '      overflow-wrap: normal !important;',
  '    }',
  '    body.communion-preparation .communion-split-title .communion-title-line,',
  '    body.communion-preparation .communion-split-title .communion-title-author {',
  '      display: block;',
  '      text-align: center;',
  '    }',
  '    body.communion-preparation .communion-split-title .communion-title-author {',
  '      font-size: clamp(15px, 4.2vw, 18px);',
  '      line-height: 1.35;',
  '    }',
  '    body.communion-preparation .communion-split-title .communion-title-year {',
  '      display: inline-block;',
  '      white-space: nowrap;',
  '    }',
  '    body.communion-preparation .section-header.has-prayer-share .communion-split-title {',
  '      padding-left: 43px;',
  '      padding-right: 8px;',
  '    }',
  ''
].join('\n');
const formatter=[
  '    const formatCommunionLongTitle = node => {',
  "      if(DATA.communionKind !== 'preparation' || !node)return;",
  "      const title=String(node.textContent||'').trim();",
  '      const norm=normalizeLiturgicalValue(title);',
  "      const basil=/^молитва (?:1|5) я(?: |$)/u.test(norm) && /василия великого/u.test(norm);",
  "      const zlat=/^молитва свт иоанна златоустого/u.test(norm);",
  '      if(!basil && !zlat)return;',
  "      const at=basil?title.indexOf(',')+1:title.indexOf(' ');",
  '      if(at<=0)return;',
  '      const first=title.slice(0,at).trim();',
  '      const rest=title.slice(basil?at:at+1).trim();',
  '      if(!first || !rest)return;',
  "      const top=el('span','communion-title-line',first);",
  "      const bottom=el('span','communion-title-author');",
  '      const date=/^(.*?)(\\s*\\([^)]*\\))\\s*$/u.exec(rest);',
  '      if(date){',
  "        bottom.appendChild(document.createTextNode(date[1].trimEnd()+' '));",
  "        bottom.appendChild(el('span','communion-title-year',date[2].trim()));",
  '      }else{bottom.textContent=rest;}',
  '      node.replaceChildren(top,bottom);',
  "      node.classList.add('communion-split-title');",
  "      node.setAttribute('aria-label',title);",
  '    };',
  ''
].join('\n');
const scan=[
  '      const communionFinalIndicators=new Set();',
  "      if(DATA.communionKind === 'preparation'){",
  '        let afterFinalHeading=false;',
  '        for(const entry of allItems){',
  "          const raw=String(entry?.title||entry?.content||'');",
  '          const heading=normalizeLiturgicalValue(raw);',
  "          if(/^приходя же причаст/u.test(heading) && /симеон/u.test(heading)){",
  '            afterFinalHeading=true;',
  '            continue;',
  '          }',
  "          if(!afterFinalHeading || entry?.item_type!=='instruction')continue;",
  "          if(/^(?:затем|и стихи|потом тропари|также молитву|и еще)$/u.test(heading)){",
  '            communionFinalIndicators.add(Number(entry.id));',
  '          }',
  '        }',
  '      }',
  ''
].join('\n');
const applyClass=[
  '          if(communionFinalIndicators.has(Number(item.id))){',
  "            wrapper.classList.add('communion-final-indicator');",
  '          }',
  ''
].join('\n');
const applyTitle=[
  "          if(DATA.communionKind === 'preparation'){",
  '            formatCommunionLongTitle(',
  "              wrapper.querySelector('h2.section-title, .section-header h2.prayer-title')",
  '            );',
  '          }',
  ''
].join('\n');
function patch(s){
  if(!s.includes(marker)){
    s=one(s,'    /* The first "Слава..." text and next "И ныне..." text form one',
      css+'    /* The first "Слава..." text and next "И ныне..." text form one',
      'Communion scoped styles');
  }
  if(!s.includes('const formatCommunionLongTitle =')){
    s=one(s,'    const renderRule = () => {',
      formatter+'    const renderRule = () => {','Title formatter');
  }
  if(!s.includes('const communionFinalIndicators=new Set();')){
    const anchor='      const communionJoinedTroparionIds = new Set(DATA.communionJoinedTroparionIds || []);';
    s=one(s,anchor,anchor+'\n'+scan,'Final rubric detection');
  }
  if(!s.includes("wrapper.classList.add('communion-final-indicator')")){
    s=one(s,'          if (paschalOpeningItemIds.has(Number(item.id))) {',
      applyClass+'          if (paschalOpeningItemIds.has(Number(item.id))) {',
      'Final rubric class');
  }
  if(!s.includes("wrapper.querySelector('h2.section-title, .section-header h2.prayer-title')")){
    const anchor='          reader.appendChild(\n            wrapper\n          );';
    s=one(s,anchor,applyTitle+anchor,'Format prayer headings');
  }
  return s;
}
function verify(s){
  for(const fragment of [marker,"const communionFinalIndicators=new Set();",
    "wrapper.classList.add('communion-final-indicator')",
    "const formatCommunionLongTitle =",
    "wrapper.querySelector('h2.section-title, .section-header h2.prayer-title')"]){
    assert(s.includes(fragment),'Missing '+fragment);
  }
  assert(s.split(marker).length===2,'Duplicated style marker');
}
let before,after,output;
try{
  before=fs.readFileSync(sourceFile,'utf8');
  after=patch(before.replace(/\r\n/g,'\n'));
  parse(after,{sourceType:'module',plugins:['jsx']});
  assert(patch(after)===after,'Not idempotent');
  verify(after);
  output=before.includes('\r\n')?after.replace(/\n/g,'\r\n'):after;
}catch(e){
  console.error('STOP:',e.message);
  console.error('NO SOURCE FILES MODIFIED.');process.exit(1);
}
console.log('PASS: scoped final Communion instructions and selected long headings.');
console.log('TO UPDATE:',output===before?'none':'PrayerRuleReader.js');
if(dry){console.log('DRY RUN. NO SOURCE FILES MODIFIED.');process.exit(0)}
if(output===before){console.log('ALREADY APPLIED.');process.exit(0)}
const backup=path.join(app,'..','build-backups','communion-final-layout-'+
  new Date().toISOString().replace(/[:.]/g,'-'),
  'src/components/reader/PrayerRuleReader.js');
try{
  fs.mkdirSync(path.dirname(backup),{recursive:true});
  fs.writeFileSync(backup,before,'utf8');
  fs.writeFileSync(sourceFile,output,'utf8');
  const saved=fs.readFileSync(sourceFile,'utf8').replace(/\r\n/g,'\n');
  parse(saved,{sourceType:'module',plugins:['jsx']});
  verify(saved);
}catch(e){
  fs.writeFileSync(sourceFile,before,'utf8');
  console.error('FAILED, ORIGINAL RESTORED:',e.message);
  console.error('BACKUP:',backup);process.exit(1);
}
console.log('UPDATED: src/components/reader/PrayerRuleReader.js');
console.log('SUCCESS. BACKUP:',backup);
