#!/usr/bin/env node
'use strict';
// Restore five requested Russian text passages in Communion preparation only.
// The Church Slavonic fields, all IDs, all other rules and all source JSON stay intact.
const fs=require('node:fs'),path=require('node:path');
const {parse}=require('@babel/parser');
const app=path.resolve(__dirname,'..'),root=path.resolve(app,'..');
const dry=process.argv.includes('--dry-run');
const helper='src/services/communionRussianCompletion.js';
const files=['src/services/contentApi.js','src/components/reader/PrayerRuleReader.js'];
const assert=(condition,message)=>{if(!condition)throw Error(message)};
function replaceOnce(s,from,to,description){
  if(s.includes(to))return s;
  const count=s.split(from).length-1;
  assert(count===1,description+': expected one anchor, found '+count);
  return s.replace(from,to);
}
function apiPatch(original){
  let s=original;
  s=replaceOnce(s,
    "import {getCurrentContent} from './contentStore';",
    "import {getCurrentContent} from './contentStore';\n"+
    "import {completeCommunionRussian} from './communionRussianCompletion';",
    'Import Communion Russian completion');
  s=replaceOnce(s,
    '    return response(data);\n',
    '    return response(completeCommunionRussian(data));\n',
    'Preview/Django prayer rule response');
  // Only prayer-rules getLocal handler, not texts, psalter or canons.
  const start=s.indexOf("  match = path.match(/^prayer-rules");
  const end=s.indexOf("  match = path.match(/^psalters",start+1);
  assert(start>=0 && end>start,'Cannot locate offline prayer rule route safely');
  const block=s.slice(start,end);
  const patched=replaceOnce(block,
    '    return item;',
    '    return completeCommunionRussian(item);',
    'Offline prayer rule response');
  s=s.slice(0,start)+patched+s.slice(end);
  assert(s.includes('return response(completeCommunionRussian(data));'),'Django not patched');
  assert(s.includes('return completeCommunionRussian(item);'),'Offline not patched');
  return s;
}
function readerPatch(original){
  let s=original;
  // The helper has the reviewed RU additions and reconstructs lost rubric
  // labels by reading the original Slavonic source, not translation guesses.
  const rubricImport="import {getCommunionRussianRubric} from '../../services/communionRussianCompletion';";
  if(!s.includes(rubricImport)){
    s=replaceOnce(s,
      "import {getCommunionRuleKind,",
      rubricImport+"\nimport {getCommunionRuleKind,",
      'Communion rubric helper import');
  }

  // Scope all color and spacing changes to this particular Communion rule.
  // Do not affect morning/evening, other prayer books, or thanksgiving.
  const visualStyles=[
    '    /* Communion preparation: compact verses, brown headings and rubrics. */',
    '    body.communion-preparation .rule-title,',
    '    body.communion-preparation .section-title,',
    '    body.communion-preparation .section-header .prayer-title {',
    '      color: var(--reader-section-heading, var(--accent-dark, #5A3822)) !important;',
    '    }',
    '    body.communion-preparation .rule-item {',
    '      margin-bottom: 5px;',
    '      padding-bottom: 7px;',
    '    }',
    '    body.communion-preparation .rule-item.communion-heading-only {',
    '      border-bottom: 0 !important;',
    '      margin-bottom: 0 !important;',
    '      padding-bottom: 0 !important;',
    '    }',
    '    body.communion-preparation .rule-item.communion-heading-only .section-title {',
    '      margin-bottom: 4px;',
    '    }',
    '    body.communion-preparation .translation-text .communion-ru-rubric {',
    '      display: inline;',
    '      color: var(--liturgical) !important;',
    '      font-weight: 700;',
    '      font-style: italic;',
    '      margin-right: 5px;',
    '    }',
    '',
  ].join('\n');
  if(!s.includes('/* Communion preparation: compact verses, brown headings and rubrics. */')){
    s=replaceOnce(s,
      '    /* The first "Слава..." text and next "И ныне..." text form one',
      visualStyles+'    /* The first "Слава..." text and next "И ныне..." text form one',
      'Scoped Communion compact typography');
  }

  // Keep the explicit newlines between the preceding doxology and prayers
  // from the user's Russian translation, in both RU and CS+RU.
  const lineBreakStyles=[
    '    /* Communion PREPARATION, Russian text only: preserve the explicit',
    '       newlines separating doxologies from the following hymn text. */',
    '    body.communion-preparation .reader-text.communion-russian-linebreaks,',
    '    body.communion-preparation .translation-text.communion-russian-linebreaks {',
    '      white-space: pre-line;',
    '    }',
    '',
  ].join('\n');
  if(!s.includes('/* Communion PREPARATION, Russian text only: preserve the explicit')){
    s=replaceOnce(s,
      '    /* The first "Слава..." text and next "И ныне..." text form one',
      lineBreakStyles+'    /* The first "Слава..." text and next "И ныне..." text form one',
      'Scoped Communion Russian line breaks');
  }

  // Heading-only sections (e.g. Psalm 22, Irmos, prayer titles) are separate
  // items immediately before their contents in the imported Communion rule.
  // Do not add a 24px blank border-and-margin between them.
  const headingMap=[
    '      const communionHeadingOnlyIds = new Set();',
    "      if (DATA.communionKind === 'preparation') {",
    '        for (let i = 0; i + 1 < allItems.length; i += 1) {',
    '          const first=allItems[i], next=allItems[i+1];',
    "          if (first?.item_type === 'section' &&",
    "              next?.item_type === 'text' && next.text &&",
    "              String(first.title || first.title_uk || '').trim() &&",
    "              !String(first.content || first.content_uk || '').trim()) {",
    '            communionHeadingOnlyIds.add(Number(first.id));',
    '          }',
    '        }',
    '      }',
    '',
  ].join('\n');
  if(!s.includes('const communionHeadingOnlyIds = new Set();')){
    s=replaceOnce(s,
      '      // "Ангел вопияше" and "Светися, светися" are consecutive Text',
      headingMap+'      // "Ангел вопияше" and "Светися, светися" are consecutive Text',
      'Communion heading/text adjacency');
  }
  const headingMark=[
    "          if (DATA.communionKind === 'preparation' &&",
    '              communionHeadingOnlyIds.has(Number(item.id))) {',
    "            wrapper.classList.add('communion-heading-only');",
    '          }',
    '',
  ].join('\n');
  if(!s.includes("wrapper.classList.add('communion-heading-only')")){
    s=replaceOnce(s,
      '          if (paschalOpeningItemIds.has(Number(item.id))) {',
      headingMark+'          if (paschalOpeningItemIds.has(Number(item.id))) {',
      'Communion heading-only class');
  }
  // Precompute the rubric on the native side. The WebView has no access to
  // imported JS helpers; its payload carries the labels by stable item ID.
  const rubrics=[
    '  const communionRussianRubricByItem = {};',
    "  if (communionKind === 'preparation') {",
    '    for (const item of rule?.items || []) {',
    "      if (item?.item_type !== 'text' || !item.text) continue;",
    '      const rubric=getCommunionRussianRubric(item.text.content, item.text.translation);',
    '      if (rubric) communionRussianRubricByItem[String(item.id)] = rubric;',
    '    }',
    '  }',
    '',
  ].join('\n');
  if(!s.includes('const communionRussianRubricByItem = {}')){
    s=replaceOnce(s,
      '  const communionTypographyByItem = {};',
      rubrics+'  const communionTypographyByItem = {};',
      'Communion RU rubrics by stable item ID');
  }
  if(!s.includes('    communionRussianRubricByItem,\n')){
    s=replaceOnce(s,
      '    communionJoinedTroparionIds,\n',
      '    communionJoinedTroparionIds,\n    communionRussianRubricByItem,\n',
      'Communion rubric payload');
  }

  const currentRubric=[
    '            const communionRussianRubric =',
    "              DATA.communionKind === 'preparation'",
    "                ? (DATA.communionRussianRubricByItem?.[String(item.id)] || '')",
    "                : '';",
    '',
  ].join('\n');
  if(!s.includes('            const communionRussianRubric =')){
    s=replaceOnce(s,
      '            // The Communion service\'s Russian text needs the same rubric',
      currentRubric+'            // The Communion service\'s Russian text needs the same rubric',
      'Scoped Russian rubric variable');
  }
  // Preserve existing source rubrics in CS/CS traditional. Only the Russian
  // tab needs the inferred heading before text; parallel gets its own span.
  if(!s.includes("              (viewMode === 'russian' ? communionRussianRubric : '') ||")){
    s=replaceOnce(s,
      '            const inlineLabel =\n              getRuleInlineLabel(',
      "            const inlineLabel =\n              (viewMode === 'russian' ? communionRussianRubric : '') ||\n              getRuleInlineLabel(",
      'Restore RU inline rubric');
  }

  const primary=[
    "            if (DATA.communionKind === 'preparation' &&",
    "                primaryLanguage === 'russian' && /\\n/u.test(russianText)) {",
    "              textElement.classList.add('communion-russian-linebreaks');",
    "            }",
    '',
  ].join('\n');
  if(!s.includes("textElement.classList.add('communion-russian-linebreaks')")){
    s=replaceOnce(s,
      '            textElement.dataset.itemId =',
      primary+'            textElement.dataset.itemId =',
      'Standalone Russian text line breaks');
  }

  const parallelRubric=[
    "              if (DATA.communionKind === 'preparation' &&",
    '                  communionRussianRubric && russianText.trim()) {',
    "                translationElement.insertBefore(",
    "                  el('span','communion-ru-rubric',communionRussianRubric),",
    '                  translationElement.firstChild',
    '                );',
    '              }',
    '',
  ].join('\n');
  if(!s.includes("'communion-ru-rubric',communionRussianRubric")){
    s=replaceOnce(s,
      '              const isEveningKondakParallel =',
      parallelRubric+'              const isEveningKondakParallel =',
      'Restore RU rubrics in parallel translation');
  }
  const parallel=[
    "              if (DATA.communionKind === 'preparation' && /\\n/u.test(russianText)) {",
    "                translationElement.classList.add('communion-russian-linebreaks');",
    "              }",
    '',
  ].join('\n');
  if(!s.includes("translationElement.classList.add('communion-russian-linebreaks')")){
    s=replaceOnce(s,
      '              const isEveningKondakParallel =',
      parallel+'              const isEveningKondakParallel =',
      'Parallel Russian line breaks');
  }
  if(!s.includes('body.communion-preparation .section-title') ||
     !s.includes('communionRussianRubricByItem') ||
     !s.includes("el('span','communion-ru-rubric'")){
    throw Error('Incomplete Communion presentation restoration');
  }
  return s;
}
const helperPath=path.join(app,helper);
if(!fs.existsSync(helperPath) ||
   !fs.readFileSync(helperPath,'utf8').includes('export const completeCommunionRussian =')){
  console.error('STOP: first restore src/services/communionRussianCompletion.js from GitHub.');
  console.error('NO SOURCE FILES MODIFIED.');process.exit(1);
}
function verifyBundledCommunionTexts(){
  const bundlePath=path.join(app,'src/data/offlineContent.json');
  assert(fs.existsSync(bundlePath),'Bundled offlineContent.json missing');
  const bundle=JSON.parse(fs.readFileSync(bundlePath,'utf8'));
  const helperSource=fs.readFileSync(helperPath,'utf8')
    .replace(/^export const /gm,'const ');
  const load=new Function(helperSource+
    '\nreturn {completeCommunionRussian,COMMUNION_RU_SLUG};');
  const {completeCommunionRussian,COMMUNION_RU_SLUG}=load();
  const rule=bundle?.prayer_rules?.by_slug?.[COMMUNION_RU_SLUG];
  assert(rule && Array.isArray(rule.items),
    'Communion preparation rule not present in bundled offline content');
  const completed=completeCommunionRussian(rule);
  assert(completed!==rule,
    'Cannot identify all five requested Communion Russian passages');
  const modified=[];
  completed.items.forEach((item,index)=>{
    if(item?.text?.translation!==rule.items[index]?.text?.translation) {
      modified.push({index,content:String(item?.text?.content||''),
        translation:String(item?.text?.translation||'')});
    }
    assert(item?.text?.content===rule.items[index]?.text?.content,
      'Church Slavonic source unexpectedly changed');
  });
  // One or more source translations may already match the requested edition
  // (notably the first troparion). Verify the five FINAL passages, not that
  // exactly five fields had to change.
  const finalRussian=(completed.items||[])
    .filter(item=>item?.item_type==='text' && item.text)
    .map(item=>String(item.text.translation||''));
  const checks=[
    ['Post-Psalm doxology',v=>v==='Сла́ва Отцу́, и Сы́ну, и Свято́му Ду́ху, и ны́не и при́сно, и во ве́ки веко́в. Ами́нь.'],
    ['Post-Psalm Alleluia',v=>v==='Аллилу́иа, аллилу́иа, аллилу́иа,\nсла́ва Тебе́, Бо́же. (Трижды)'],
    ['First troparion',v=>v.startsWith('Беззакония мои презри, Господи, от Девы рожденный,')],
    ['Second troparion',v=>v.startsWith('Сла́ва Отцу, и Сы́ну, и Свято́му Ду́ху.\nНа причащение')],
    ['Third troparion',v=>v.startsWith('И ны́не, и при́сно, и во ве́ки веко́в, ами́нь.\nБесчисленно множество')],
  ];
  for(const [name,test] of checks){
    assert(finalRussian.filter(test).length===1,
      name+' missing or duplicated in the completed Russian sequence');
  }
  assert(modified.length<=5,'Unrelated Russian translations were modified');
  console.log('VERIFIED: all 5 requested RU passages; updated fields: '+modified.length);
  assert(completeCommunionRussian(completed)===completed,
    'Communion Russian completion is not idempotent');
  console.log('VERIFIED: the bundled Communion rule matches the targeted headings.');
}
try{
  verifyBundledCommunionTexts();
}catch(error){
  console.error('STOP:',error.message);
  console.error('NO SOURCE FILES MODIFIED.');process.exit(1);
}

const jobs=[],problems=[];
const patches=[apiPatch,readerPatch];
for(let i=0;i<files.length;i++){
  const relative=files[i],file=path.join(app,relative);
  try{
    assert(fs.existsSync(file),'Missing '+relative);
    const original=fs.readFileSync(file,'utf8');
    const normalized=original.replace(/\r\n/g,'\n');
    const result=patches[i](normalized);
    parse(result,{sourceType:'module',plugins:['jsx']});
    assert(patches[i](result)===result,'Patch not idempotent: '+relative);
    const output=original.includes('\r\n')?result.replace(/\n/g,'\r\n'):result;
    if(original!==output)jobs.push({relative,file,original,output});
  }catch(error){problems.push(relative+': '+error.message)}
}
if(problems.length){
  problems.forEach(item=>console.error('STOP:',item));
  console.error('NO SOURCE FILES MODIFIED.');process.exit(1);
}
console.log('PASS: only Communion preparation Russian text, both offline and Django preview.');
console.log('TO UPDATE:',jobs.map(j=>j.relative).join(', ')||'none');
if(dry){console.log('DRY RUN: NO SOURCE FILES MODIFIED.');process.exit(0)}
if(!jobs.length){console.log('ALREADY APPLIED.');process.exit(0)}
const backup=path.join(root,'build-backups','communion-ru-text-'+
  new Date().toISOString().replace(/[:.]/g,'-'));
for(const job of jobs){
  const copy=path.join(backup,job.relative);
  fs.mkdirSync(path.dirname(copy),{recursive:true});
  fs.writeFileSync(copy,job.original,'utf8');
}
try{
  for(const job of jobs)fs.writeFileSync(job.file,job.output,'utf8');
  for(const rel of files)parse(fs.readFileSync(path.join(app,rel),'utf8'),
    {sourceType:'module',plugins:['jsx']});
}catch(error){
  for(const job of jobs)fs.writeFileSync(job.file,job.original,'utf8');
  console.error('FAILED AND RESTORED ORIGINALS:',error.message);
  process.exit(1);
}
jobs.forEach(job=>console.log('UPDATED:',job.relative));
console.log('SUCCESS. BACKUP:',backup);
