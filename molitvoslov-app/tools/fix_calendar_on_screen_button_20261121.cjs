#!/usr/bin/env node
'use strict';
// Fix ONLY the Calendar "На экран" font clipping. Reuse typography of
// the corresponding Quote of the Day button. All other local edits stay.
const fs=require('node:fs'),path=require('node:path');
const {parse}=require('@babel/parser');
const app=path.resolve(__dirname,'..'),file=path.join(app,'src/screens/MenuScreen.js');
const dry=process.argv.includes('--dry-run');
const count=(s,x)=>s.split(x).length-1;
const assert=(ok,description)=>{if(!ok)throw Error(description);};
const oldLabel='<Text style={styles.calendarWidgetButtonText}>{calendarCopy.onScreen}</Text>';
const newLabel='<Text style={[styles.heroQuoteActionText, styles.calendarWidgetButtonText]} numberOfLines={1}>{calendarCopy.onScreen}</Text>';
const oldHeight='  calendarWidgetButton: {\n    height: 30,';
const newHeight='  calendarWidgetButton: {\n    minHeight: 30,';
const oldMetrics=[
  '  calendarWidgetButtonText: {',
  "    color: '#7B4F2A',",
  "    fontFamily: 'serif',",
  '    fontSize: 11,',
  '    lineHeight: 10,',
  "    fontWeight: '700',",
  '  },',
].join('\n');
const newMetrics=[
  '  calendarWidgetButtonText: {',
  '    // Reuse heroQuoteActionText typography (15px line height and padding)',
  "    // so Cyrillic descenders, particularly 'р', cannot be clipped.",
  "    color: '#7B4F2A',",
  '  },',
].join('\n');
function replaceSafe(s,previous,next,desc){
  const oldCount=count(s,previous),newCount=count(s,next);
  if(newCount===1&&oldCount===0)return s;
  assert(oldCount===1&&newCount===0,
    desc+': local layout differs; refusing to overwrite any customizations');
  return s.replace(previous,next);
}
function patch(s){
  assert(s.includes("<Text style={styles.heroQuoteActionText}>{t('common.onScreen')}</Text>"),
    'Quote of the Day comparison button not found');
  s=replaceSafe(s,oldLabel,newLabel,'Calendar button text');
  s=replaceSafe(s,oldHeight,newHeight,'Calendar button height');
  s=replaceSafe(s,oldMetrics,newMetrics,'Calendar font metrics');
  return s;
}
function verify(s){
  assert(count(s,newLabel)===1,'Calendar label is not reusing quote button font');
  assert(count(s,newHeight)===1,'Calendar button minHeight not found');
  assert(count(s,newMetrics)===1,'Calendar typography override not correct');
  assert(count(s,oldLabel)===0&&count(s,oldMetrics)===0,'Old clipped style remains');
  assert(s.includes('onPress={showCalendarWidgetInfo}'),'Widget action not found');
  assert(s.includes("color: '#7B4F2A'"),'Calendar color missing');
}
let original,output;
try{
  original=fs.readFileSync(file,'utf8');
  const edited=patch(original.replace(/\r\n/g,'\n'));
  parse(edited,{sourceType:'module',plugins:['jsx']});
  verify(edited);
  assert(patch(edited)===edited,'Patch is not idempotent');
  output=original.includes('\r\n')?edited.replace(/\n/g,'\r\n'):edited;
}catch(e){
  console.error('STOP:',e.message);
  console.error('NO SOURCE FILES MODIFIED.');
  process.exit(1);
}
console.log('PASS: calendar text uses 15px line height and quote button padding.');
console.log('PASS: calendar palette, widget action and other layout unchanged.');
console.log('TO UPDATE:',output===original?'none':'src/screens/MenuScreen.js');
if(dry){console.log('DRY RUN. NO SOURCE FILES MODIFIED.');process.exit(0)}
if(output===original){console.log('ALREADY APPLIED.');process.exit(0)}
const backup=path.join(app,'..','build-backups',
  'calendar-button-no-clipping-'+new Date().toISOString().replace(/[:.]/g,'-'),
  'src/screens/MenuScreen.js');
try{
  fs.mkdirSync(path.dirname(backup),{recursive:true});
  fs.writeFileSync(backup,original,'utf8');
  fs.writeFileSync(file,output,'utf8');
  const written=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');
  parse(written,{sourceType:'module',plugins:['jsx']});
  verify(written);
}catch(e){
  fs.writeFileSync(file,original,'utf8');
  console.error('FAILED. ORIGINAL RESTORED:',e.message);
  console.error('BACKUP:',backup);
  process.exit(1);
}
console.log('UPDATED: src/screens/MenuScreen.js');
console.log('SUCCESS. BACKUP:',backup);
