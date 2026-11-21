#!/usr/bin/env node
'use strict';
// Only the Communion PREPARATION language tab; preserve all other rules.
const fs=require('node:fs'),path=require('node:path'),{parse}=require('@babel/parser');
const app=path.resolve(__dirname,'..'),root=path.resolve(app,'..');
const screen='src/screens/PrayerRuleScreen.js';
const source=path.join(app,screen);
const helper=path.join(app,'src/services/communionTraditionalRule.js');
const manuscript=path.join(app,'src/data/communionTraditionalSource.json');
const dry=process.argv.includes('--dry-run');
const marker='/* CS_TRAD_COMMUNION_TAB_ENABLED_20261121 */';
const assert=(ok,msg)=>{if(!ok)throw Error(msg)};
function one(s,regex,replacement,label){
  const matches=[...s.matchAll(regex)];
  assert(matches.length===1,label+': expected one source occurrence, found '+matches.length);
  return s.replace(regex,replacement);
}
function patch(s){
  const importLine="import {hasCommunionTraditionalEdition} from '../services/communionTraditionalRule';";
  if(!s.includes(importLine)){
    s=one(s,/^import \{READER_LANGUAGE_MODES, buildReaderLanguageOptions\} from '\.\.\/services\/readerLanguageModes';$/gm,
      match=>match+'\n'+importLine,'Traditional edition import');
  }
  if(!s.includes(marker)){
    // The imported base rule has no traditional_content fields. The full
    // traditional manuscript is intentionally stored in a separate module.
    const expression=/(\bconst hasTraditionalTranslation\s*=\s*useMemo\(\s*\(\)\s*=>\s*)(?=\(rule\?\.items\s*\|\|\s*\[\]\)\.some\()/g;
    s=one(s,expression,
      (full,prefix)=>prefix+
        '/* CS_TRAD_COMMUNION_TAB_ENABLED_20261121 */\n      '+
        'hasCommunionTraditionalEdition(rule) ||\n      ',
      'Uploaded edition availability');
  }
  const optionGuard="hasCommunionTraditionalEdition(rule) && option.key === MODE_TRADITIONAL";
  if(!s.includes(optionGuard)){
    const options=/options:\s*buildReaderLanguageOptions\(\{([\s\S]*?)\}\),/g;
    s=one(s,options,(full,config)=>
      'options: buildReaderLanguageOptions({'+config+'}).map(option =>\n'+
      '        hasCommunionTraditionalEdition(rule) && option.key === MODE_TRADITIONAL\n'+
      '          ? {...option, disabled: false}\n'+
      '          : option\n'+
      '      ),',
      'Enable traditional option for this Communion rule');
  }
  const directMarker="if (hasCommunionTraditionalEdition(rule)) {";
  if(!s.includes(directMarker)){
    s=one(s,
      /onLanguageChange=\{\(mode\)\s*=>\s*readerRef\.current\?\.changeViewMode\(mode\)\}/g,
      'onLanguageChange={(mode) => {\n'+
      '          if (hasCommunionTraditionalEdition(rule)) {\n'+
      '            handleViewModeChange(mode);\n'+
      '            return;\n'+
      '          }\n'+
      '          readerRef.current?.changeViewMode(mode);\n'+
      '        }}',
      'Direct native header switching for Communion');
  }
  return s;
}
function verify(s){
  const expected=[
    "import {hasCommunionTraditionalEdition} from '../services/communionTraditionalRule';",
    marker,'hasCommunionTraditionalEdition(rule) ||',
    'hasCommunionTraditionalEdition(rule) && option.key === MODE_TRADITIONAL',
    'if (hasCommunionTraditionalEdition(rule)) {',
    'handleViewModeChange(mode);',
    'readerRef.current?.changeViewMode(mode);'
  ];
  expected.forEach(term=>assert(s.includes(term),'Missing '+term));
  assert(s.split(marker).length===2,'Duplicate tab availability guard');
  assert(s.split("import {hasCommunionTraditionalEdition}").length===2,
    'Duplicate helper import');
}
function verifyData(){
  assert(fs.existsSync(helper),'Missing traditional rule builder');
  assert(fs.existsSync(manuscript),'Missing traditional manuscript');
  parse(fs.readFileSync(helper,'utf8'),{sourceType:'module',plugins:['jsx']});
  const data=JSON.parse(fs.readFileSync(manuscript,'utf8'));
  const count=data.groups?.reduce((n,g)=>n+(g.blocks?.length||0),0);
  assert(data.document==='posledovanie-ko-svyatomu-prichashcheniyu' &&
    data.groups?.length===27 && count===108,'Incomplete traditional manuscript');
  console.log('VERIFIED: 27 sections / 108 traditional text blocks.');
}
let original,updated,output;
try{
  verifyData();
  original=fs.readFileSync(source,'utf8');
  updated=patch(original.replace(/\r\n/g,'\n'));
  parse(updated,{sourceType:'module',plugins:['jsx']});
  verify(updated);
  assert(patch(updated)===updated,'Not safely repeatable');
  output=original.includes('\r\n')?updated.replace(/\n/g,'\r\n'):updated;
}catch(e){
  console.error('STOP:',e.message);
  console.error('NO SOURCE FILES MODIFIED.');process.exit(1);
}
console.log('PASS: CS Traditional Communion tab enabled and header switch direct.');
console.log('TO UPDATE:',output===original?'none':screen);
if(dry){console.log('DRY RUN. NO SOURCE FILES MODIFIED.');process.exit(0)}
if(output===original){console.log('ALREADY APPLIED.');process.exit(0)}
const backup=path.join(root,'build-backups','communion-traditional-tab-'+
  new Date().toISOString().replace(/[:.]/g,'-'),screen);
try{
  fs.mkdirSync(path.dirname(backup),{recursive:true});
  fs.writeFileSync(backup,original,'utf8');
  fs.writeFileSync(source,output,'utf8');
  const saved=fs.readFileSync(source,'utf8').replace(/\r\n/g,'\n');
  parse(saved,{sourceType:'module',plugins:['jsx']});verify(saved);
}catch(e){
  fs.writeFileSync(source,original,'utf8');
  console.error('ERROR. ORIGINAL RESTORED:',e.message);
  console.error('BACKUP:',backup);process.exit(1);
}
console.log('UPDATED:',screen);
console.log('SUCCESS. BACKUP:',backup);
