#!/usr/bin/env node
'use strict';
// Add the user's exact Russian text to the LAST "Вечери Твоея тайныя"
// invocation in Communion preparation. Preserve source content, order, IDs
// and every other rule. This script only wires the already-reviewed helper.
const fs=require('node:fs');
const path=require('node:path');
const {parse}=require('@babel/parser');

const app=path.resolve(__dirname,'..');
const root=path.resolve(app,'..');
const helperPath=path.join(app,'src/services/communionRussianCompletion.js');
const apiPath=path.join(app,'src/services/contentApi.js');
const bundlePath=path.join(app,'src/data/offlineContent.json');
const dry=process.argv.includes('--dry-run');
const assert=(condition,message)=>{if(!condition)throw Error(message);};

function replaceOnce(source,from,to,label){
  if(source.includes(to))return source;
  const count=source.split(from).length-1;
  assert(count===1,label+': expected one anchor, found '+count);
  return source.replace(from,to);
}

function patchContentApi(original){
  let s=original;
  const importLine="import {completeCommunionRussian} from './communionRussianCompletion';";
  if(!s.includes(importLine)){
    s=replaceOnce(s,
      "import {getCurrentContent} from './contentStore';",
      "import {getCurrentContent} from './contentStore';\n"+importLine,
      'Local Communion helper import');
  }
  assert(s.split(importLine).length===2,
    'Unexpected duplicate Communion imports');

  // The GET handler for local Django is distinct from the offline routes.
  const liveStart=s.indexOf('const getLivePrayerRule = async (path) => {');
  const liveEnd=s.indexOf('\nconst notFound =',liveStart+1);
  assert(liveStart>=0 && liveEnd>liveStart,'Cannot identify Django handler');
  let live=s.slice(liveStart,liveEnd);
  live=replaceOnce(live,
    'return response(data);',
    'return response(completeCommunionRussian(data));',
    'Django Communion translation');
  s=s.slice(0,liveStart)+live+s.slice(liveEnd);

  const start=s.indexOf('  match = path.match(/^prayer-rules');
  const end=s.indexOf('  match = path.match(/^psalters',start+1);
  assert(start>=0 && end>start,'Cannot identify offline prayer rule route');
  let offline=s.slice(start,end);
  offline=replaceOnce(offline,
    '    return item;',
    '    return completeCommunionRussian(item);',
    'Offline Communion translation');
  s=s.slice(0,start)+offline+s.slice(end);

  assert(s.includes('return response(completeCommunionRussian(data));'),
    'Live response not routed through helper');
  assert(s.includes('return completeCommunionRussian(item);'),
    'Offline response not routed through helper');
  return s;
}

function verifyTarget(){
  assert(fs.existsSync(helperPath),'Missing communionRussianCompletion.js');
  assert(fs.existsSync(bundlePath),'Missing offlineContent.json');
  const helper=fs.readFileSync(helperPath,'utf8');
  assert(!helper.includes('findLastIndex('),
    'Old Communion helper needs updating from GitHub');
  const helperBody=helper.replace(/^export const /gm,'const ');
  const loaded=new Function(helperBody+
    '\nreturn {COMMUNION_RU_SLUG,FINAL_COMMUNION_RUSSIAN,hasFinalCommunionInvocation,completeCommunionRussian};')();
  const bundle=JSON.parse(fs.readFileSync(bundlePath,'utf8'));
  const rule=bundle?.prayer_rules?.by_slug?.[loaded.COMMUNION_RU_SLUG];
  assert(rule && Array.isArray(rule.items),
    'Communion preparation not found in offlineContent.json');
  assert(loaded.hasFinalCommunionInvocation(rule),
    'The final Church Slavonic invocation was not identified; no blind append');
  const updated=loaded.completeCommunionRussian(rule);
  assert(updated.items.length===rule.items.length,
    'A prayer row was unexpectedly inserted or removed');
  assert(loaded.hasFinalCommunionInvocation(updated),
    'Final invocation source changed unexpectedly');
  const lastIndex=updated.items.map((item,index)=>({item,index}))
    .filter(record=>record.item?.item_type==='text' && record.item.text)
    .at(-1)?.index;
  assert(Number.isInteger(lastIndex),'No last text item');
  const original=rule.items[lastIndex],completed=updated.items[lastIndex];
  assert(completed?.text?.translation===loaded.FINAL_COMMUNION_RUSSIAN,
    'Russian ending does not match the user-supplied text');
  assert(original?.text?.content===completed?.text?.content,
    'Church Slavonic source was modified');
  assert(original?.id===completed?.id && original?.text?.id===completed?.text?.id,
    'Prayer identifiers changed');
  assert(loaded.completeCommunionRussian(updated)===updated,
    'Completion is not idempotent');
  console.log('VERIFIED: last "Вечери Твоея тайныя", exact Russian text and original IDs.');
}

let original=null,output=null;
try{
  verifyTarget();
  assert(fs.existsSync(apiPath),'Missing contentApi.js');
  original=fs.readFileSync(apiPath,'utf8');
  const result=patchContentApi(original.replace(/\r\n/g,'\n'));
  parse(result,{sourceType:'module',plugins:['jsx']});
  assert(patchContentApi(result)===result,'ContentApi patch is not repeatable');
  output=original.includes('\r\n')?result.replace(/\n/g,'\r\n'):result;
}catch(error){
  console.error('STOP:',error.message);
  console.error('NO SOURCE FILES MODIFIED.');
  process.exit(1);
}

console.log('PASS: final Russian Communion prayer, no changes to any other reader.');
if(dry){
  console.log(output===original?'DRY RUN: already wired':'DRY RUN: contentApi.js would be updated');
  console.log('NO SOURCE FILES MODIFIED.');
  process.exit(0);
}
if(output===original){
  console.log('SUCCESS: already wired; updated helper will be used.');
  console.log('NO SOURCE FILES MODIFIED.');
  process.exit(0);
}
const backup=path.join(root,'build-backups',
  'final-communion-ru-'+new Date().toISOString().replace(/[:.]/g,'-'),
  'src/services/contentApi.js');
try{
  fs.mkdirSync(path.dirname(backup),{recursive:true});
  fs.writeFileSync(backup,original,'utf8');
  fs.writeFileSync(apiPath,output,'utf8');
  parse(fs.readFileSync(apiPath,'utf8'),{sourceType:'module',plugins:['jsx']});
}catch(error){
  if(original!==null)fs.writeFileSync(apiPath,original,'utf8');
  console.error('FAILED. ORIGINAL RESTORED:',error.message);
  console.error('BACKUP:',backup);
  process.exit(1);
}
console.log('UPDATED: src/services/contentApi.js');
console.log('SUCCESS. BACKUP:',backup);
