#!/usr/bin/env node
'use strict';
// Fix only the fully uploaded Communion CS Traditional tab (not RU, CS or parallel).
// Keep all 108 source texts, IDs, bookmark offsets, and text selections intact.
const fs=require('node:fs'),path=require('node:path'),{parse}=require('@babel/parser');
const app=path.resolve(__dirname,'..'),root=path.resolve(app,'..');
const file=path.join(app,'src/components/reader/PrayerRuleReader.js');
const helper=path.join(app,'src/services/communionTraditionalRule.js');
const sourceFile=path.join(app,'src/data/communionTraditionalSource.json');
const dry=process.argv.includes('--dry-run');
const marker='/* CS_TRAD_COMPACT_WIDTH_AND_INTERNAL_DIVIDER_V6_20261121 */';

function assert(value,message){if(!value)throw Error(message)}
function once(source,from,to,label){
  if(source.includes(to))return source;
  const n=source.split(from).length-1;
  assert(n===1,label+': expected one anchor, found '+n);
  return source.replace(from,to);
}

const css=[
  '    '+marker,
  '    /* Wider lines, natural word wrapping, and justified Church Slavonic. */',
  '    body.communion-preparation.traditional-mode.communion-traditional-source {',
  '      padding-left: 8px !important;',
  '      padding-right: 8px !important;',
  '    }',
  '    body.communion-preparation.traditional-mode.communion-traditional-source .reader-text,',
  '    body.communion-preparation.traditional-mode.communion-traditional-source .reader-inline.communion-trad-inline {',
  '      text-align: justify !important;',
  '      text-align-last: auto !important;',
  '      text-justify: inter-word !important;',
  '      word-break: normal !important;',
  '      overflow-wrap: break-word !important;',
  '      -webkit-hyphens: auto !important;',
  '      hyphens: auto !important;',
  '    }',
  '    /* Tone 8 is one connected sequence: no large blanks below',
  '       "Слава..." or "И ныне..." and no separators inside the sequence. */',
  '    body.communion-preparation.traditional-mode.communion-traditional-source .rule-item.communion-trad-tone8:not(.communion-trad-end) {',
  '      margin-top: 0 !important;',
  '      margin-bottom: 1px !important;',
  '      padding-top: 0 !important;',
  '      padding-bottom: 0 !important;',
  '      border-bottom: 0 !important;',
  '    }',
  '    body.communion-preparation.traditional-mode.communion-traditional-source .rule-item.communion-trad-tone8 .reader-text {',
  '      margin: 0 !important;',
  '      padding: 0 !important;',
  '      line-height: 1.52 !important;',
  '    }',
  '    body.communion-preparation.traditional-mode.communion-traditional-source .rule-item.communion-trad-tone8.communion-trad-glory .reader-text {',
  '      line-height: 1.3 !important;',
  '    }',
  '    /* All three "Прїиди́те" invocations have capital red initials. */',
  '    body.communion-preparation.traditional-mode.communion-traditional-source .rule-item.communion-trad-three-worship .reader-text span.communion-initial {',
  '      text-transform: uppercase !important;',
  '      color: var(--liturgical, #9B3B32) !important;',
  '      font-size: 1.16em !important;',
  '      font-weight: 500 !important;',
  '    }',
  '    /* "Усладил..." and "Во светлостех..." are separate prayers inside',
  '       one source Text. Hide ONLY their literal newline in presentation:',
  '       insert a visible divider without changing a single source offset. */',
  '    body.communion-preparation.traditional-mode.communion-traditional-source .rule-item.communion-trad-internal-prayers .reader-text {',
  '      white-space: normal !important;',
  '    }',
  '    body.communion-preparation.traditional-mode.communion-traditional-source .rule-item.communion-trad-internal-prayers .reader-text .communion-short-prayer-divider {',
  '      margin: 6px 0 7px !important;',
  '      border-top: 1px solid var(--border) !important;',
  '    }',
  ''
].join('\n');

const extraClasses=[
  "            if (item.communionTraditionalToneEight) wrapper.classList.add('communion-trad-tone8');",
  "            if (item.communionTraditionalInternalPrayerBoundary) wrapper.classList.add('communion-trad-internal-prayers');",
  "            if (item.communionTraditionalRubric === 'Придите поклонимся') wrapper.classList.add('communion-trad-three-worship');",
].join('\n');

const splitTypography=[
  '        // Insert a divider after "Усладил мя еси..." and before',
  '        // "Во светлостех...". Both prayers share one stable Text id.',
  '        if (traditionalReadingRule?.communionTraditionalEdition &&',
  '            item.communionTraditionalInternalPrayerBoundary) {',
  '          const full=String(value||"");',
  "          const position=full.indexOf('\\nВо све́тлостех');",
  "          if (position<0 || !/Твоя́\\.\\s*$/u.test(full.slice(0,position))) {",
  "            throw Error('Traditional Communion final pair mismatch');",
  '          }',
  '          const metadata=communionTypographyByItem[String(item.id)];',
  '          assertTraditionalBoundary(metadata, position+1);',
  '        }',
  ''
].join('\n');

const boundaryHelper=[
  '  const assertTraditionalBoundary = (metadata, offset) => {',
  "    if (!metadata || !Array.isArray(metadata.separatorBefore) || !Number.isInteger(offset)) {",
  "      throw Error('Missing Communion divider metadata');",
  '    }',
  '    if (!metadata.separatorBefore.includes(offset)) metadata.separatorBefore.push(offset);',
  '    metadata.separatorBefore.sort((a,b)=>a-b);',
  '  };',
  ''
].join('\n');

function patch(source){
  let s=source;
  assert(s.includes('/* COMMUNION_TRAD_INLINE_V5_20261121 */'),
    'Previous traditional inline-rubric update V5 is missing');
  assert(s.includes('const traditionalReadingRule = completeCommunionTraditionalRule(rule, viewMode);'),
    'Traditional Communion tab not connected');
  assert(s.includes('item.communionTraditionalMultiVerseInitials) {'),
    'Previous multi-verse initial handling is missing');
  if(!s.includes(marker)){
    s=once(s,
      '    /* The first "Слава..." text and next "И ныне..." text form one',
      css+'    /* The first "Слава..." text and next "И ныне..." text form one',
      'Scoped traditional reader layout');
  }
  if(!s.includes("wrapper.classList.add('communion-trad-tone8')")){
    const key="            if (item.communionTraditionalTroparionSet) wrapper.classList.add('communion-trad-joined');";
    s=once(s,key,key+'\n'+extraClasses,'Identify tone 8 and the final two prayers');
  }
  if(!s.includes('const assertTraditionalBoundary = (metadata, offset) => {')){
    const begin=s.indexOf('const buildHtml = ({');
    const end=s.indexOf('\nconst PrayerRuleReader = forwardRef',begin);
    assert(begin>=0 && end>begin,'Cannot isolate buildHtml');
    let sub=s.slice(begin,end);
    sub=once(sub,'  const communionTypographyByItem = {};',
      boundaryHelper+'  const communionTypographyByItem = {};',
      'Bounded separator helper');
    s=s.slice(0,begin)+sub+s.slice(end);
  }
  if(!s.includes('item.communionTraditionalInternalPrayerBoundary) {\n          const full=String(value||"");')){
    const preceding='        if (traditionalReadingRule?.communionTraditionalEdition &&\n'+
      '            item.communionTraditionalMultiVerseInitials) {';
    s=once(s,preceding,splitTypography+preceding,
      'Divider inside last traditional Communion prayer pair');
  }
  return s;
}

function verify(reader){
  const terms=[
    marker,
    'const assertTraditionalBoundary = (metadata, offset) => {',
    "wrapper.classList.add('communion-trad-tone8')",
    "wrapper.classList.add('communion-trad-three-worship')",
    "wrapper.classList.add('communion-trad-internal-prayers')",
    "const position=full.indexOf('\\nВо све́тлостех');",
    'assertTraditionalBoundary(metadata, position+1);',
    'margin-bottom: 1px !important;',
    'padding-left: 8px !important;',
    'white-space: normal !important;',
  ];
  for(const term of terms) assert(reader.includes(term),'Missing update: '+term);
  assert(reader.split(marker).length===2,'Duplicate layout style');
}

function verifySource(){
  assert(fs.existsSync(helper) && fs.existsSync(sourceFile),
    'Restore the updated traditional Communion helper and source first');
  const js=fs.readFileSync(helper,'utf8');
  parse(js,{sourceType:'module',plugins:['jsx']});
  for(const term of ['communionTraditionalToneEight','communionTraditionalInternalPrayerBoundary',
                     'communionTraditionalMultiVerseInitials:lastTroparia||worshipInvocations']){
    assert(js.includes(term),'Missing traditional Communion source flag: '+term);
  }
  const data=JSON.parse(fs.readFileSync(sourceFile,'utf8'));
  assert(data.groups.length===27 &&
    data.groups.reduce((n,g)=>n+(g.blocks?.length||0),0)===108,
    'Traditional source must contain 27 sections and 108 text blocks');
  const worship=data.groups[0]?.blocks[10]?.text?.split('\n') || [];
  assert(worship.length===3 && worship.every(line=>line.startsWith('Прїиди́те')),
    'Three capital Church Slavonic worship invocations not found');
  const final=data.groups.at(-1)?.blocks[4]?.text || '';
  assert(final.includes('Твоя́.\nВо све́тлостех'),
    'Final two prayers are not adjacent at the expected boundary');
  console.log('VERIFIED: 108 source blocks, 3 worship initials, 2 final prayers.');
}

let original,updated,output;
try{
  verifySource();
  original=fs.readFileSync(file,'utf8');
  updated=patch(original.replace(/\r\n/g,'\n'));
  parse(updated,{sourceType:'module',plugins:['jsx']});
  assert(patch(updated)===updated,'Patch is not idempotent');
  verify(updated);
  output=original.includes('\r\n')?updated.replace(/\n/g,'\r\n'):updated;
}catch(error){
  console.error('STOP:',error.message);
  console.error('NO SOURCE FILES MODIFIED.');
  process.exit(1);
}
console.log('PASS: narrow, compact, capital worship initials, divider within last hymn pair.');
console.log('TO UPDATE:',output===original?'none':'src/components/reader/PrayerRuleReader.js');
if(dry){console.log('DRY RUN. NO SOURCE FILES MODIFIED.');process.exit(0);}
if(output===original){console.log('ALREADY APPLIED.');process.exit(0);}
const backup=path.join(root,'build-backups',
  'communion-trad-compact-'+new Date().toISOString().replace(/[:.]/g,'-'),
  'src/components/reader/PrayerRuleReader.js');
try{
  fs.mkdirSync(path.dirname(backup),{recursive:true});
  fs.writeFileSync(backup,original,'utf8');
  fs.writeFileSync(file,output,'utf8');
  const saved=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');
  parse(saved,{sourceType:'module',plugins:['jsx']});
  verify(saved);
}catch(error){
  fs.writeFileSync(file,original,'utf8');
  console.error('FAILED, ORIGINAL RESTORED:',error.message);
  console.error('BACKUP:',backup);
  process.exit(1);
}
console.log('UPDATED: src/components/reader/PrayerRuleReader.js');
console.log('SUCCESS. BACKUP:',backup);
