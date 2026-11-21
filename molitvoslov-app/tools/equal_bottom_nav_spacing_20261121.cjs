#!/usr/bin/env node
'use strict';
// Make the five BottomNav hit areas exactly equal in width.
// Preserve the existing navigation colors, gradient, icons, labels,
// font size, menu height, animations and any unrelated local changes.
const fs=require('node:fs');
const path=require('node:path');
const {parse}=require('@babel/parser');

const app=path.resolve(__dirname,'..');
const source=path.join(app,'src/components/navigation/BottomNav.js');
const dry=process.argv.includes('--dry-run');
const oldStyle="  item: {\n    flex: 1,\n    minWidth: 0,";
const newStyle=[
  '  item: {',
  '    // Five fixed-width columns: visual centers stay equally spaced even',
  '    // when the active tab has a border or labels have different lengths.',
  "    width: '20%',",
  '    flexGrow: 0,',
  '    flexShrink: 0,',
  '    minWidth: 0,',
].join('\n');

const count=(text,term)=>text.split(term).length-1;
const verify=(text)=>{
  if(count(text,newStyle)!==1)throw Error('Five equal-width tab columns not found exactly once');
  if(count(text,oldStyle)!==0)throw Error('Old flexible tab width still present');
  if(count(text,"{key: '")!==5)throw Error('Unexpected tab count: expected five');
  if(!text.includes("isActive && styles.itemActive"))throw Error('Active tab highlight missing');
  if(!text.includes("t('navCompact.'+item.key)"))throw Error('Church Slavonic tab labels missing');
};
function patch(text){
  if(text.includes(newStyle)){
    verify(text);
    return text;
  }
  const oldCount=count(text,oldStyle);
  if(oldCount!==1)throw Error('Unrecognized item style (expected one flex: 1 block, got '+oldCount+')');
  const updated=text.replace(oldStyle,newStyle);
  verify(updated);
  return updated;
}

let before,after,output;
try {
  before=fs.readFileSync(source,'utf8');
  after=patch(before.replace(/\r\n/g,'\n'));
  parse(after,{sourceType:'module',plugins:['jsx']});
  if(patch(after)!==after)throw Error('Patch is not idempotent');
  output=before.includes('\r\n')?after.replace(/\n/g,'\r\n'):after;
}catch(error){
  console.error('STOP:',error.message);
  console.error('NO SOURCE FILES MODIFIED.');
  process.exit(1);
}
console.log('PASS: five equal 20% tab columns; icons and captions centered.');
console.log('PASS: original menu appearance and interactions preserved.');
if(dry){
  console.log(output===before?'DRY RUN: already applied':'DRY RUN: BottomNav.js would change');
  console.log('NO SOURCE FILES MODIFIED.');
  process.exit(0);
}
if(output===before){
  console.log('ALREADY APPLIED. NO SOURCE FILES MODIFIED.');
  process.exit(0);
}

const backup=path.join(app,'..','build-backups','bottom-nav-equal-spacing-'+
  new Date().toISOString().replace(/[:.]/g,'-'),
  'src/components/navigation/BottomNav.js');
try {
  fs.mkdirSync(path.dirname(backup),{recursive:true});
  fs.writeFileSync(backup,before,'utf8');
  fs.writeFileSync(source,output,'utf8');
  const saved=fs.readFileSync(source,'utf8').replace(/\r\n/g,'\n');
  parse(saved,{sourceType:'module',plugins:['jsx']});
  verify(saved);
}catch(error){
  fs.writeFileSync(source,before,'utf8');
  console.error('FAILED. ORIGINAL RESTORED:',error.message);
  console.error('BACKUP:',backup);
  process.exit(1);
}
console.log('UPDATED: src/components/navigation/BottomNav.js');
console.log('SUCCESS. BACKUP:',backup);
