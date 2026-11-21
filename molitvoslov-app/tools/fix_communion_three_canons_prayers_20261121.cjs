#!/usr/bin/env node
'use strict';
// Changes only "Последование ко Святому Причащению" and Three Combined Canons prayers.
const fs=require('node:fs'),path=require('node:path'),{parse}=require('@babel/parser');
const app=path.resolve(__dirname,'..'),root=path.resolve(app,'..');
const files=['src/components/reader/PrayerRuleReader.js','src/screens/CanonScreen.js',
  'src/components/reader/selectableDocumentReader/styles.js'];
const dry=process.argv.includes('--dry-run');
function sub(s,from,to,why){
  if(s.includes(to))return s;
  const n=s.split(from).length-1;
  if(n!==1)throw Error(why+': expected one match, got '+n);
  return s.replace(from,to);
}
const multi=(...lines)=>lines.join('\n')+'\n';
function communion(s){
  s=sub(s,'    const isCommunionReadingRule = !!DATA.communionKind;',
    "    const isCommunionReadingRule = !!DATA.communionKind;\n"+
    "    const isCommunionPreparation = DATA.communionKind === 'preparation';",'Rule scope');
  const css=multi(
    '    /* Communion preparation only: title-only sections join their text. */',
    '    body.communion-preparation .rule-item.communion-heading-only {',
    '      border-bottom: 0; padding-bottom: 0; margin-bottom: 0;',
    '    }',
    '    body.communion-preparation .rule-item.communion-heading-only .section-title {',
    '      margin-bottom: 6px;',
    '    }',
    '    /* RU parallel font follows the live reader font-size slider. */',
    '    body.communion-preparation .translation-text {',
    '      font-size: var(--reading-font-size, 17px) !important;',
    '      line-height: 1.7 !important;',
    '    }');
  s=sub(s,'    /* The first "Слава..." text and next "И ныне..." text form one',
    css+'    /* The first "Слава..." text and next "И ныне..." text form one','Communion CSS');
  s=sub(s,"      if (lacksTraditional || (lacksRussian && DATA.viewMode === 'russian')) {",
    "      if (!isCommunionPreparation && (lacksTraditional || (lacksRussian && DATA.viewMode === 'russian'))) {",
    'Missing translation label');
  const detection=multi(
    '      const communionHeadingOnlyIds = new Set();',
    '      if (isCommunionPreparation) {',
    '        for (let i=0; i+1<allItems.length; i++) {',
    '          const a=allItems[i], b=allItems[i+1];',
    "          if(a?.item_type==='section' && b?.item_type==='text' && b.text &&",
    "             String(a.title||a.title_uk||'').trim() &&",
    "             !String(a.content||a.content_uk||'').trim())",
    '            communionHeadingOnlyIds.add(Number(a.id));',
    '        }',
    '      }');
  s=sub(s,'      // "Ангел вопияше" and "Светися, светися" are consecutive Text',
    detection+'      // "Ангел вопияше" and "Светися, светися" are consecutive Text',
    'Heading-text adjacency');
  s=sub(s,'          if (paschalOpeningItemIds.has(Number(item.id))) {',
    multi(
      '          if(isCommunionPreparation && communionHeadingOnlyIds.has(Number(item.id)))',
      "            wrapper.classList.add('communion-heading-only');"
    )+'          if (paschalOpeningItemIds.has(Number(item.id))) {',
    'Mark heading-only section');
  s=sub(s,'            const itemTitle =\n',
    multi("            if(isCommunionPreparation && primaryLanguage==='russian' && !russianText.trim())",
      '              return;')+'            const itemTitle =\n','No Russian-only placeholder');
  s=sub(s,"            if (DATA.viewMode === 'both') {",
    "            if (DATA.viewMode === 'both' &&\n                (!isCommunionPreparation || !!russianText.trim())) {",
    'No parallel placeholder');
  return s;
}
function canon(s){
  // Return immediately when already tagged, avoiding a second ternary rewrite.
  if(s.includes('const isThreeCanonsClosingPrayer ='))return s;
  const classify=multi(
    '      // Display rules for prayers of the Three Combined Canons only.',
    '      const isThreeCanonsClosingPrayer =',
    "        canon.slug === 'tri-sovmeshchennykh-kanona' &&",
    "        (effectiveSectionType === 'prayer' || section.grouped_prayer === true ||",
    '         /^(?:молитв|его\s+же(?:,|\s))/u.test(normalizeCanonCue(effectiveHeading)));');
  s=sub(s,"      sections.push({\n        className: canon.slug === 'tri-sovmeshchennykh-kanona'",
    classify+"      sections.push({\n        className: canon.slug === 'tri-sovmeshchennykh-kanona'",
    'Identify closing prayer');
  s=sub(s,"        className: canon.slug === 'tri-sovmeshchennykh-kanona'",
    "        className: (canon.slug === 'tri-sovmeshchennykh-kanona'",'Class expression');
  s=sub(s,"          : 'canon-section',\n\n        progressAnchorId:",
    "          : 'canon-section') +\n          (isThreeCanonsClosingPrayer ? ' three-combined-closing-prayer' : ''),\n\n        progressAnchorId:",
    'Scoped closing-prayer class');
  return s;
}
function canonCSS(s){
  const css=multi(
    '    /* Closing prayers of the Three Combined Canons ONLY. */',
    '    .rule-item.three-combined-canon.three-combined-closing-prayer.three-combined-heading {',
    '      border-bottom: 0 !important; padding-bottom: 0 !important; margin-bottom: 4px;',
    '    }',
    '    .rule-item.three-combined-canon.three-combined-closing-prayer .section-header::after {',
    '      content: none !important; display: none !important;',
    '    }',
    '    /* Visual paragraphs collapse to prose; original selectable text is intact. */',
    '    .rule-item.three-combined-canon.three-combined-closing-prayer .paragraph-gap {',
    '      display: inline !important; width: auto !important; height: auto !important;',
    '      overflow: visible !important; font-size: inherit !important;',
    '      line-height: inherit !important; white-space: normal !important;',
    '    }');
  return sub(s,"    /* The combined Three Canons' traditional UCS source has been",
    css+"    /* The combined Three Canons' traditional UCS source has been",'Closing-prayer CSS');
}
const patch=[communion,canon,canonCSS],jobs=[],errors=[];
for(let i=0;i<files.length;i++){
  const rel=files[i],dest=path.join(app,rel);
  try{
    if(!fs.existsSync(dest))throw Error('Missing file');
    const original=fs.readFileSync(dest,'utf8'),crlf=original.includes('\r\n');
    const norm=original.replace(/\r\n/g,'\n'),out=patch[i](norm);
    parse(out,{sourceType:'module',plugins:['jsx']});
    if(patch[i](out)!==out)throw Error('Not idempotent');
    const result=crlf?out.replace(/\n/g,'\r\n'):out;
    if(result!==original)jobs.push({rel,dest,original,result});
  }catch(e){errors.push(rel+': '+e.message)}
}
if(errors.length){
  errors.forEach(x=>console.error('STOP:',x));
  console.error('NO SOURCE FILES MODIFIED.');process.exit(1);
}
console.log('PASS: Communion preparation + combined-canon prayers only.');
console.log('CHANGES:',jobs.map(j=>j.rel).join(', ')||'none');
if(dry){console.log('DRY RUN. NO SOURCE FILES MODIFIED.');process.exit(0)}
if(!jobs.length){console.log('ALREADY APPLIED.');process.exit(0)}
const backup=path.join(root,'build-backups','communion-canons-'+new Date().toISOString().replace(/[:.]/g,'-'));
for(const j of jobs){const p=path.join(backup,j.rel);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,j.original,'utf8')}
try{
  for(const j of jobs)fs.writeFileSync(j.dest,j.result,'utf8');
  for(const rel of files)parse(fs.readFileSync(path.join(app,rel),'utf8'),{sourceType:'module',plugins:['jsx']});
}catch(e){
  for(const j of jobs)fs.writeFileSync(j.dest,j.original,'utf8');
  console.error('FAILED; originals restored:',e.message);process.exit(1);
}
jobs.forEach(j=>console.log('UPDATED:',j.rel));
console.log('SUCCESS. BACKUP:',backup);
