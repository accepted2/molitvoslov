#!/usr/bin/env node
'use strict';
// Restore Android edge-to-edge gesture navigation by removing the opaque
// brown app-owned backdrop. No changes to BottomNav, Android system glyphs,
// app themes, screen layout, insets, or native dependencies.
const fs=require('node:fs');
const path=require('node:path');
const {parse}=require('@babel/parser');

const app=path.resolve(__dirname,'..');
const repoRoot=path.resolve(app,'..');
const dry=process.argv.includes('--dry-run');
const files=['App.js','src/components/navigation/SystemNavigationBackdrop.js'];
const importLine="import {SystemNavigationBackdrop} from './src/components/navigation/SystemNavigationBackdrop';";
const viewLine='          <SystemNavigationBackdrop />';
const oldColor="backgroundColor: '#4D3020'";
const newColor="backgroundColor: 'transparent'";

const requireCheck=(condition,label)=>{
  if(!condition)throw Error(label);
};
const count=(value,needle)=>value.split(needle).length-1;

function patchApp(source){
  const imports=count(source,importLine);
  const views=count(source,viewLine);
  const references=count(source,'SystemNavigationBackdrop');
  if(imports===0 && views===0){
    requireCheck(references===0,'Unexpected remaining SystemNavigationBackdrop usage in App.js');
    return source;
  }
  requireCheck(imports===1 && views===1 && references===3,
    'Cannot safely identify one existing Android navigation backdrop import and element');
  // Remove only the dedicated Android backdrop. Preserve all content under
  // <SafeAreaProvider> and all screen-specific background colors.
  let result=source.replace(importLine+'\n','');
  result=result.replace(viewLine+'\n','');
  requireCheck(!result.includes('SystemNavigationBackdrop'),'Unremoved backdrop reference in App.js');
  requireCheck(result.includes('<ShareFeedbackHost />') &&
    result.includes('<AppNavigator />'),'Main application layout changed unexpectedly');
  return result;
}

function patchBackdrop(source){
  const opaque=count(source,oldColor);
  const transparent=count(source,newColor);
  if(opaque===0){
    requireCheck(transparent===1,
      'Unknown Android system navigation backdrop style: refusing to overwrite local preferences');
    return source;
  }
  requireCheck(opaque===1 && transparent===0,
    'Unexpected duplicate Android navigation backdrop color');
  return source.replace(oldColor,newColor);
}
const patches=[patchApp,patchBackdrop];
const all=[];
try{
  for(let i=0;i<files.length;i++){
    const relative=files[i];
    const full=path.join(app,relative);
    requireCheck(fs.existsSync(full),'Missing '+relative);
    const original=fs.readFileSync(full,'utf8');
    const normalized=original.replace(/\r\n/g,'\n');
    const after=patches[i](normalized);
    parse(after,{sourceType:'module',plugins:['jsx']});
    requireCheck(patches[i](after)===after,'Patch is not repeatable: '+relative);
    const output=original.includes('\r\n')?after.replace(/\n/g,'\r\n'):after;
    all.push({relative,full,original,output});
  }
  requireCheck(!all[0].output.includes('SystemNavigationBackdrop'),
    'Opaque Android overlay is still mounted in App.js');
  requireCheck(!all[1].output.includes('#4D3020'),
    'Brown color remains in optional navigation backdrop');
  requireCheck(all[1].output.includes(newColor),
    'Optional navigation backdrop is not transparent');
}catch(error){
  console.error('STOP:',error.message);
  console.error('NO SOURCE FILES MODIFIED.');
  process.exit(1);
}

console.log('PASS: no app-owned brown layer under Android system gestures.');
console.log('PASS: in-app BottomNav, safe areas and system buttons unchanged.');
console.log('TO UPDATE:',all.filter(x=>x.original!==x.output).map(x=>x.relative).join(', ')||'none');

if(dry){
  console.log('DRY RUN. NO SOURCE FILES MODIFIED.');
  process.exit(0);
}
const changed=all.filter(x=>x.original!==x.output);
if(!changed.length){
  console.log('ALREADY APPLIED.');
  process.exit(0);
}
const backup=path.join(repoRoot,'build-backups',
  'android-transparent-nav-'+new Date().toISOString().replace(/[:.]/g,'-'));
try{
  for(const x of changed){
    const dest=path.join(backup,x.relative);
    fs.mkdirSync(path.dirname(dest),{recursive:true});
    fs.writeFileSync(dest,x.original,'utf8');
  }
  for(const x of changed)fs.writeFileSync(x.full,x.output,'utf8');
  for(const x of all){
    const final=fs.readFileSync(x.full,'utf8');
    parse(final,{sourceType:'module',plugins:['jsx']});
    requireCheck(patches[files.indexOf(x.relative)](final.replace(/\r\n/g,'\n'))===
      final.replace(/\r\n/g,'\n'),'Post-write verification failed: '+x.relative);
  }
}catch(error){
  for(const x of changed)fs.writeFileSync(x.full,x.original,'utf8');
  console.error('ERROR. ORIGINAL FILES RESTORED:',error.message);
  console.error('BACKUP:',backup);
  process.exit(1);
}
changed.forEach(x=>console.log('UPDATED:',x.relative));
console.log('SUCCESS. BACKUP:',backup);
