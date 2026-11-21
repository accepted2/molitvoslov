#!/usr/bin/env node
'use strict';
// Safely merge the Church Slavonic calendar typography/numeral and Account
// support changes with the user's existing local source modifications.
// No hard reset, no overwriting of unrelated files or calendar databases.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawnSync} = require('node:child_process');
const {parse} = require('@babel/parser');

const app = path.resolve(__dirname, '..');
const root = path.resolve(app, '..');
const baseRef = '22e4ac48e1b091b9db877e09704e159a8760a95c';
const targetRef = '971630c776a76ec2feb2a6ff3c9ea54cfed76730';
const dry = process.argv.includes('--dry-run');
const files = [
  'src/screens/MenuScreen.js',
  'src/screens/ChurchCalendarScreen.js',
  'src/screens/AccountScreen.js',
  'src/screens/MemorialScreen.js',
];
const added = [
  'src/services/calendarDisplayNumerals.js',
  'src/services/projectSupport.js',
  'src/i18n/supportCopy.js',
  'src/components/settings/ProjectSupportSection.js',
];
function assert(condition, why) {if (!condition) throw new Error(why);}
function gitShow(ref, file) {
  const result = spawnSync('git',
    ['-C', root, 'show', ref + ':molitvoslov-app/' + file],
    {encoding:'utf8', maxBuffer:12*1024*1024, windowsHide:true});
  assert(result.status === 0,
    'Git cannot read '+ref+' for '+file+': '+String(result.stderr||'').trim());
  return result.stdout.replace(/\r\n/g, '\n');
}
function parseJs(text, file) {
  try {parse(text,{sourceType:'module',plugins:['jsx']});}
  catch(error){throw new Error('JavaScript syntax '+file+': '+error.message);}
}
function mergeFile(local, base, target, filename) {
  if(local === target) return local;
  if(local === base) return target;
  const folder = fs.mkdtempSync(path.join(os.tmpdir(),'molitvoslov-csl-merge-'));
  const localFile=path.join(folder,'ours.js');
  const baseFile=path.join(folder,'base.js');
  const targetFile=path.join(folder,'new.js');
  try {
    fs.writeFileSync(localFile,local,'utf8');
    fs.writeFileSync(baseFile,base,'utf8');
    fs.writeFileSync(targetFile,target,'utf8');
    const merge=spawnSync('git',['merge-file','-p',
      '-L','local','-L','previous','-L','new',
      localFile,baseFile,targetFile],
      {encoding:'utf8',maxBuffer:16*1024*1024,windowsHide:true});
    assert(merge.status===0,
      'Local edits overlap the new changes in '+filename+
      '. No files modified. Send the STOP message to the assistant.');
    return merge.stdout;
  } finally {
    fs.rmSync(folder,{recursive:true,force:true});
  }
}
const verify = results => {
  const read=file=>results.find(x=>x.file===file)?.output||'';
  const menu=read('src/screens/MenuScreen.js');
  const calendar=read('src/screens/ChurchCalendarScreen.js');
  const account=read('src/screens/AccountScreen.js');
  const memorial=read('src/screens/MemorialScreen.js');
  const numeral=read('src/services/calendarDisplayNumerals.js');
  const support=read('src/components/settings/ProjectSupportSection.js');
  assert(menu.includes('displayCalendarNumber(cell.day, calendarLanguage)') &&
         menu.includes('styles.miniCalendarMonthTraditional'),
         'Home calendar numeral/font change is incomplete');
  assert(calendar.includes('displayCalendarNumber(cell.day, language)') &&
         calendar.includes('displayCalendarDateText('),
         'Full calendar numeral/date change is incomplete');
  assert(account.includes('<ProjectSupportSection />') &&
         account.includes("cslText(15,23)"),
         'Account font/support section change is incomplete');
  assert(memorial.includes('cslStyle(19, 27)'),
         'Memorial Church Slavonic font change is incomplete');
  assert(numeral.includes('toChurchSlavonicNumeral') &&
         support.includes('Linking.openURL(url)'),
         'New calendar or support helpers are incomplete');
  // 2026 and 2027 must be formatted on display only, without rewriting
  // any date values or downloaded calendar years.
  const tested = new Function(numeral.replace(/export const /g,'const ')+
    '\nreturn {toChurchSlavonicNumeral,displayCalendarNumber};')();
  assert(tested.toChurchSlavonicNumeral(21)==='к҃а' &&
         tested.toChurchSlavonicNumeral(2026)==='҂вк҃ѕ' &&
         tested.toChurchSlavonicNumeral(2027)==='҂вк҃з' &&
         tested.displayCalendarNumber(21,'ru')===21,
         'Church Slavonic numeral verification failed');
};

const pending = [];
try {
  const planned = [...files, ...added];
  for(const file of planned){
    const full = path.join(app,file);
    const base = added.includes(file) ? null : gitShow(baseRef,file);
    const target = gitShow(targetRef,file);
    const existing = fs.existsSync(full) ? fs.readFileSync(full,'utf8') : null;
    if(!added.includes(file)) {
      assert(existing!==null,'Missing application source: '+file);
      const normalized=existing.replace(/\r\n/g,'\n');
      const updated=mergeFile(normalized,base,target,file);
      parseJs(updated,file);
      pending.push({file,full,original:existing,
        output:existing.includes('\r\n')?updated.replace(/\n/g,'\r\n'):updated,
        changed:normalized!==updated});
    } else {
      assert(existing===null || existing.replace(/\r\n/g,'\n')===target,
        'An already existing new file differs: '+file+'. No overwrite.');
      parseJs(target,file);
      pending.push({file,full,original:existing,output:target,
        changed:existing===null});
    }
  }
  verify(pending);
}catch(error){
  console.error('STOP:',error.message);
  console.error('NO PROJECT FILES MODIFIED.');
  process.exit(1);
}
console.log('PASS: both calendars use Slavonic numeral display only.');
console.log('PASS: Account and Memorial fonts, localized support section.');
console.log('PASS: no calendar database, API, saved IDs or payment credentials modified.');
console.log('TO UPDATE:',pending.filter(x=>x.changed).map(x=>x.file).join(', ')||'none');
if(dry) {
  console.log('DRY RUN. NO PROJECT FILES MODIFIED.');
  process.exit(0);
}
const jobs=pending.filter(x=>x.changed);
if(!jobs.length) {console.log('ALREADY INSTALLED.');process.exit(0);}
const backup=path.join(root,'build-backups',
  'csl-calendar-account-support-'+new Date().toISOString().replace(/[:.]/g,'-'));
try{
  for(const j of jobs)if(j.original!==null){
    const dest=path.join(backup,j.file);
    fs.mkdirSync(path.dirname(dest),{recursive:true});
    fs.writeFileSync(dest,j.original,'utf8');
  }
  for(const j of jobs){
    fs.mkdirSync(path.dirname(j.full),{recursive:true});
    fs.writeFileSync(j.full,j.output,'utf8');
  }
  for(const j of pending){
    const saved=fs.readFileSync(j.full,'utf8').replace(/\r\n/g,'\n');
    parseJs(saved,j.file);
  }
}catch(error){
  for(const j of jobs){
    if(j.original!==null)fs.writeFileSync(j.full,j.original,'utf8');
    else if(fs.existsSync(j.full))fs.unlinkSync(j.full);
  }
  console.error('FAILED. ORIGINAL FILES RESTORED:',error.message);
  console.error('BACKUP:',backup);
  process.exit(1);
}
console.log('SUCCESS: Church Slavonic calendar and Account support UI installed.');
console.log('BACKUP:',backup);
console.log('DONATION: External payment remains disabled until EXPO_PUBLIC_SUPPORT_URL is configured.');
