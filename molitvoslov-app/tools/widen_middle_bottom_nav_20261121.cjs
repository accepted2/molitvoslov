#!/usr/bin/env node
'use strict';
// Widen ONLY the existing three-tab center group of BottomNav.
// Preserve customized local colors, labels, icons, height, animations,
// and the user's other uncommitted changes. Dry-run first.
const fs=require('node:fs');
const path=require('node:path');
const {parse}=require('@babel/parser');

const app=path.resolve(__dirname,'..');
const file=path.join(app,'src/components/navigation/BottomNav.js');
const dry=process.argv.includes('--dry-run');
const count=(text,needle)=>text.split(needle).length-1;
const ensure=(condition,description)=>{if(!condition)throw Error(description);};

const OUTER_OLD="    width: '23%',";
const CENTER_OLD="    width: '54%',";
const OUTER_NEW="    width: '15%',";
const CENTER_NEW="    width: '70%',";

function betweenStyles(source,from,to){
  const start=source.indexOf(from);
  if(start<0)return null;
  const next=source.indexOf(to,start+from.length);
  return next<0?null:source.slice(start,next);
}
function patch(source){
  ensure(source.includes('const renderTab = (item, columnStyle) => {'),
    'Centered BottomNav group not found. Apply group_center_bottom_nav_20261121.cjs first.');
  ensure(source.includes('ITEMS.slice(1, 4).map(item => renderTab(item, styles.centralTab))'),
    'Three middle buttons are no longer grouped as expected.');
  ensure(count(source,'  outerTab: {')===1&&count(source,'  centralTabs: {')===1,
    'Expected one outer-tab and one central-group style.');

  const outside=betweenStyles(source,'  outerTab: {','  centralTabs: {');
  const middle=betweenStyles(source,'  centralTabs: {','  centralTab: {');
  ensure(outside!==null&&middle!==null,'Unable to isolate navigation layout.');
  if(outside.includes(OUTER_NEW)&&middle.includes(CENTER_NEW)){
    ensure(!outside.includes(OUTER_OLD)&&!middle.includes(CENTER_OLD),
      'Mixed old/new BottomNav widths.');
    return source;
  }
  ensure(count(outside,OUTER_OLD)===1&&count(middle,CENTER_OLD)===1,
    'BottomNav already has custom widths. No automatic overwrite.');
  ensure(!outside.includes(OUTER_NEW)&&!middle.includes(CENTER_NEW),
    'Unexpected partial BottomNav spacing update.');

  const start=source.indexOf('  outerTab: {'),end=source.indexOf('  centralTab: {',start);
  let region=source.slice(start,end);
  region=region.replace(OUTER_OLD,OUTER_NEW).replace(CENTER_OLD,CENTER_NEW);
  const comments=region.match(/  \/\/ The two edge columns are mirror images\.[\s\S]*?  outerTab: \{/);
  if(comments){
    region=region.replace(comments[0],
      '  // Center group: 70% of width, with three equal 23.33% positions.\n'+
      '  // Symmetric outer tabs: 15% each; long Prayerbooks label fits.\n'+
      '  outerTab: {');
  }
  const updated=source.slice(0,start)+region+source.slice(end);
  const a=betweenStyles(updated,'  outerTab: {','  centralTabs: {');
  const b=betweenStyles(updated,'  centralTabs: {','  centralTab: {');
  ensure(a.includes(OUTER_NEW)&&b.includes(CENTER_NEW)&&
    !a.includes(OUTER_OLD)&&!b.includes(CENTER_OLD),
    'Could not verify new 15/70/15 tab layout.');
  return updated;
}

let before,after,output;
try{
  before=fs.readFileSync(file,'utf8');
  after=patch(before.replace(/\r\n/g,'\n'));
  parse(after,{sourceType:'module',plugins:['jsx']});
  ensure(patch(after)===after,'Patch is not idempotent.');
  output=before.includes('\r\n')?after.replace(/\n/g,'\r\n'):after;
}catch(error){
  console.error('STOP:',error.message);
  console.error('NO SOURCE FILES MODIFIED.');
  process.exit(1);
}
console.log('PASS: center trio now occupies 70% and outer tabs 15% each.');
console.log('PASS: only BottomNav column widths changed.');
console.log('TO UPDATE:',output===before?'none':'src/components/navigation/BottomNav.js');
if(dry){
  console.log('DRY RUN. NO SOURCE FILES MODIFIED.');
  process.exit(0);
}
if(output===before){
  console.log('ALREADY APPLIED.');
  process.exit(0);
}
const backup=path.join(app,'..','build-backups','bottom-nav-wider-middle-'+
  new Date().toISOString().replace(/[:.]/g,'-'),
  'src/components/navigation/BottomNav.js');
try{
  fs.mkdirSync(path.dirname(backup),{recursive:true});
  fs.writeFileSync(backup,before,'utf8');
  fs.writeFileSync(file,output,'utf8');
  const written=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');
  parse(written,{sourceType:'module',plugins:['jsx']});
  ensure(patch(written)===written,'Post-write verification failed.');
}catch(error){
  fs.writeFileSync(file,before,'utf8');
  console.error('FAILED. ORIGINAL RESTORED:',error.message);
  console.error('BACKUP:',backup);
  process.exit(1);
}
console.log('UPDATED: src/components/navigation/BottomNav.js');
console.log('SUCCESS. BACKUP:',backup);
