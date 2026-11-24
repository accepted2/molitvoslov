#!/usr/bin/env node
'use strict';
// Narrow visual repair of Communion's Church Slavonic Traditional tab.
// Prerequisite: previous full-text and V4 visual patches already installed.
// Source prayer texts, IDs, saving, and the other language tabs are untouched.
const fs=require('node:fs');
const path=require('node:path');
const {parse}=require('@babel/parser');

const app=path.resolve(__dirname,'..');
const root=path.resolve(app,'..');
const paths=[
  'src/components/reader/PrayerRuleReader.js',
  'src/screens/PrayerRuleScreen.js',
];
const funcs=[patchReader,patchScreen];
const dry=process.argv.includes('--dry-run');
const marker='/* COMMUNION_TRAD_INLINE_V5_20261121 */';

function assert(cond,why){if(!cond)throw Error(why);}
function replaceOnce(s,from,to,desc){
  if(s.includes(to))return s;
  const count=s.split(from).length-1;
  assert(count===1,desc+': expected 1 anchor; found '+count);
  return s.replace(from,to);
}

const css=[
  '    '+marker,
  '    /* Rubric and first word share one flowing line, no heading row. */',
  '    body.communion-preparation.traditional-mode.communion-traditional-source .reader-inline.communion-trad-inline {',
  '      display: block; margin: 0; padding: 0;',
  '    }',
  '    body.communion-preparation.traditional-mode.communion-traditional-source .reader-inline.communion-trad-inline .reader-text {',
  '      display: inline !important;',
  '    }',
  '    body.communion-preparation.traditional-mode.communion-traditional-source .reader-inline.communion-trad-inline .reader-inline-label.communion-trad-rubric-name {',
  "      display: inline !important; font-family: 'Ponomar', Georgia, serif !important;",
  '      font-size: inherit !important; line-height: inherit !important;',
  '      font-weight: 400 !important; font-style: normal !important;',
  '      color: var(--liturgical, #9B3B32) !important;',
  '      margin: 0 0.32em 0 0 !important; padding: 0 !important;',
  '      white-space: nowrap;',
  '    }',
  '    /* Mild weight rather than bold, with a very small optical adjustment. */',
  '    body.communion-preparation.traditional-mode.communion-traditional-source .rule-title,',
  '    body.communion-preparation.traditional-mode.communion-traditional-source .section-title,',
  '    body.communion-preparation.traditional-mode.communion-traditional-source .section-header .prayer-title {',
  "      font-family: 'Ponomar', Georgia, serif !important;",
  '      font-weight: 500 !important;',
  '      -webkit-text-stroke: 0.12px currentColor;',
  '      color: var(--secondary, #5A3822) !important;',
  '    }',
  '    /* Previous V3 correctly removed dividers INSIDE the troparia; bring',
  '       back exactly the separator after the last item of each hymn group. */',
  '    body.communion-preparation.traditional-mode.communion-traditional-source .rule-item.communion-trad-joined.communion-trad-end {',
  '      border-bottom: 1px solid var(--border) !important;',
  '      padding-bottom: 8px !important;',
  '      margin-bottom: 9px !important;',
  '    }',
  '    /* Initial letters, including the second troparion inside one Text. */',
  '    body.communion-preparation.traditional-mode.communion-traditional-source .rule-item.communion-trad-joined .reader-text span.communion-initial,',
  '    body.communion-preparation.traditional-mode.communion-traditional-source .reader-inline.communion-trad-inline .reader-text span.communion-initial {',
  '      color: var(--liturgical, #9B3B32) !important;',
  '      font-size: 1.18em !important; font-weight: 500 !important;',
  '    }',
  '',
].join('\n');

const inlineLabelBlock=[
  '            // Source rubric is metadata; render it on the SAME line as',
  '            // its selectable hymn without changing prayer text or offsets.',
  '            const communionTraditionalInlineRubric =',
  '              DATA.rule?.communionTraditionalEdition',
  '                ? ({',
  "                    'Ирмос': 'И҆рмо́съ',",
  "                    'Припев': 'Припѣ́въ',",
  "                    'Богородичен': 'Богоро́диченъ',",
  "                    'Троичен': 'Тро́иченъ',",
  "                    'Кондак, глас 2': 'Конда́къ',",
  "                  }[String(item.communionTraditionalRubric || '')] || '')",
  "                : '';",
  '',
].join('\n');

const inlineDom=[
  '            if (communionTraditionalInlineRubric) {',
  "              const inline = el('div', 'reader-inline communion-trad-inline');",
  "              inline.appendChild(el('span', 'reader-inline-label communion-trad-rubric-name',",
  "                communionTraditionalInlineRubric + ':'));",
  '              inline.appendChild(textElement);',
  '              wrapper.appendChild(inline);',
  '            } else ',
].join('\n');

const troparClasses=[
  '          if (DATA.rule?.communionTraditionalEdition &&',
  '              item.communionTraditionalTroparionBoundary) {',
  "            wrapper.classList.add('communion-trad-end');",
  '          }',
  '',
].join('\n');

const interiorInitials=[
  '        if (traditionalReadingRule?.communionTraditionalEdition &&',
  '            item.communionTraditionalMultiVerseInitials) {',
  '          // Each line after the first is another troparion; mark its',
  '          // first letter without inserting line breaks or altering the text.',
  '          for (const hit of String(value).matchAll(/\\n[ \\t]*(\\p{L})/gu)) {',
  '            const at=hit.index+hit[0].lastIndexOf(hit[1]);',
  '            let end=at+hit[1].length;',
  '            while (end<value.length && /\\p{M}/u.test(value[end])) end++;',
  "            communionTypographyByItem[String(item.id)].ranges.push({start:at,end,kind:'initial'});",
  '          }',
  '        }',
  '',
].join('\n');

function patchReader(original){
  let s=original;
  assert(s.includes('const traditionalReadingRule = completeCommunionTraditionalRule(rule, viewMode);'),
    'Traditional Communion full-text patch has not been installed');
  assert(s.includes('/* COMMUNION_TRAD_ODE_LABELS_V4 */'),
    'Traditional Communion inline-label prerequisite V4 is missing');
  assert(s.includes("wrapper.classList.add('communion-trad-joined')"),
    'Traditional Communion joined troparion patch is missing');
  assert(s.includes('getCommunionTraditionalCountRanges(value)'),
    'Traditional Communion text-range patch is missing');

  if(!s.includes('const communionTraditionalInlineRubric =')){
    const first='            if (DATA.rule?.communionTraditionalEdition) {\n'+
      '              const sourceRubric = String(item.communionTraditionalRubric || "");';
    const start=s.indexOf(first);
    const end=start<0?-1:s.indexOf('            const textElement =',start);
    assert(start>=0 && end>start, 'Old multiline rubric labels not found');
    const old=s.slice(start,end);
    assert(old.includes("wrapper.appendChild(el('div', 'communion-trad-rubric-name', labels[sourceRubric]));"),
      'Unexpected local rubric markup; refusing a blind replacement');
    s=s.slice(0,start)+inlineLabelBlock+s.slice(end);
  }

  if(!s.includes('if (communionTraditionalInlineRubric) {')){
    s=replaceOnce(s,
      '            if (\n              inlineLabel &&',
      inlineDom+'if (\n              inlineLabel &&',
      'Same-line Church Slavonic rubric container');
  }

  if(!s.includes("wrapper.classList.add('communion-trad-end')")){
    s=replaceOnce(s,
      '          if (paschalOpeningItemIds.has(Number(item.id))) {',
      troparClasses+'          if (paschalOpeningItemIds.has(Number(item.id))) {',
      'Divider after the LAST troparion');
  }

  if(!s.includes('item.communionTraditionalMultiVerseInitials) {')){
    const anchor='          communionTypographyByItem[String(item.id)].ranges.push(...getCommunionTraditionalCountRanges(value));\n'+
      '        }';
    s=replaceOnce(s,anchor,anchor+'\n'+interiorInitials.trimEnd(),
      'Second-stanza red initial inside one text item');
  }

  if(!s.includes(marker)){
    s=replaceOnce(s,
      '    /* The first "Слава..." text and next "И ныне..." text form one',
      css+'    /* The first "Слава..." text and next "И ныне..." text form one',
      'Traditional inline label and gentle title weight CSS');
  }
  return s;
}

function patchScreen(original){
  let s=original;
  // Restore only the native, collapsible header to the app interface language.
  // The Church Slavonic name INSIDE the reader remains unaffected.
  const special=
    "title={viewMode === MODE_TRADITIONAL && hasCommunionTraditionalEdition(rule)\n"+
    "          ? COMMUNION_TRADITIONAL_NAME\n"+
    "          : getLocalizedField(rule, 'name', language) || t('reading.prayerRule')}";
  const ordinary=
    "title={getLocalizedField(rule, 'name', language) || t('reading.prayerRule')}";
  if(s.includes(special))s=s.replace(special,ordinary);
  else assert(s.includes(ordinary),'Native header language label not found');
  const unwanted=
    "import {COMMUNION_TRADITIONAL_NAME, hasCommunionTraditionalEdition} from '../services/communionTraditionalRule';";
  const correct=
    "import {hasCommunionTraditionalEdition} from '../services/communionTraditionalRule';";
  if(s.includes(unwanted))s=s.replace(unwanted,correct);
  assert(!s.includes('COMMUNION_TRADITIONAL_NAME'),
    'Traditional naming still overrides the interface header');
  return s;
}

function verify(reader,screen){
  for(const fragment of [marker,
    'const communionTraditionalInlineRubric =',
    "inline.appendChild(el('span', 'reader-inline-label communion-trad-rubric-name',",
    "wrapper.classList.add('communion-trad-end')",
    'item.communionTraditionalMultiVerseInitials) {',
    'communion-trad-joined.communion-trad-end',
    'font-weight: 500 !important;']){
    assert(reader.includes(fragment),'Missing reader correction: '+fragment);
  }
  assert(reader.split(marker).length===2,'Duplicate V5 scoped styles');
  assert(!reader.includes("wrapper.appendChild(el('div', 'communion-trad-rubric-name', labels[sourceRubric]));"),
    'Multiline label markup remains');
  assert(!screen.includes('COMMUNION_TRADITIONAL_NAME'),
    'Native interface header incorrectly uses Church Slavonic');
  assert(screen.includes("title={getLocalizedField(rule, 'name', language) || t('reading.prayerRule')}"),
    'Native interface header was not restored');
}

function verifySource(){
  const helper=fs.readFileSync(path.join(app,'src/services/communionTraditionalRule.js'),'utf8');
  const json=JSON.parse(fs.readFileSync(path.join(app,'src/data/communionTraditionalSource.json'),'utf8'));
  parse(helper,{sourceType:'module',plugins:['jsx']});
  for(const word of ['communionTraditionalTroparionBoundary','communionTraditionalMultiVerseInitials'])
    assert(helper.includes(word),'Update communionTraditionalRule.js before this script: '+word);
  assert(json.groups?.length===27&&
    json.groups.reduce((n,x)=>n+(x.blocks?.length||0),0)===108,
    'Traditional Communion source must contain all 27 sections and 108 blocks');
}

let jobs=[];
try{
  verifySource();
  const transform=[patchReader,patchScreen];
  for(let i=0;i<paths.length;i++){
    const name=paths[i],file=path.join(app,name);
    const original=fs.readFileSync(file,'utf8');
    const changed=transform[i](original.replace(/\r\n/g,'\n'));
    parse(changed,{sourceType:'module',plugins:['jsx']});
    assert(transform[i](changed)===changed,'Non-idempotent update of '+name);
    const output=original.includes('\r\n')?changed.replace(/\n/g,'\r\n'):changed;
    jobs.push({name,file,original,output});
  }
  verify(jobs[0].output,jobs[1].output);
}catch(error){
  console.error('STOP:',error.message);
  console.error('NO SOURCE FILES MODIFIED.');
  process.exit(1);
}
console.log('PASS: inline rubrics with colons, mild titles, end dividers, second initials, interface header.');
console.log('TO UPDATE:',jobs.filter(j=>j.original!==j.output).map(j=>j.name).join(', ')||'none');
if(dry){console.log('DRY RUN. NO SOURCE FILES MODIFIED.');process.exit(0);}
jobs=jobs.filter(j=>j.original!==j.output);
if(!jobs.length){console.log('ALREADY APPLIED.');process.exit(0);}
const backup=path.join(app,'..','build-backups',
  'communion-trad-inline-'+new Date().toISOString().replace(/[:.]/g,'-'));
try{
  for(const job of jobs){
    const copy=path.join(backup,job.name);
    fs.mkdirSync(path.dirname(copy),{recursive:true});
    fs.writeFileSync(copy,job.original,'utf8');
  }
  for(const job of jobs)fs.writeFileSync(job.file,job.output,'utf8');
  for(const job of jobs)parse(fs.readFileSync(job.file,'utf8'),{sourceType:'module',plugins:['jsx']});
}catch(error){
  for(const job of jobs)fs.writeFileSync(job.file,job.original,'utf8');
  console.error('FAILED. ORIGINALS RESTORED:',error.message);
  process.exit(1);
}
jobs.forEach(j=>console.log('UPDATED:',j.name));
console.log('SUCCESS. BACKUP:',backup);
