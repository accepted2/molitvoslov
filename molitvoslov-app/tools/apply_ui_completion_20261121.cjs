#!/usr/bin/env node
'use strict';
// Transactional three-way merge of vetted interface-only changes.
// Never resets source files, stages Git changes, or overwrites conflicting edits.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
const {parse}=require('@babel/parser');
const root=path.resolve(__dirname,'../..');
const app=path.join(root,'molitvoslov-app');
const baseRef='f98a8c434432bcbaef0599da61bcc2da9ffac12f';
const targetRef='28db825f7b86d9e791ebf05d30f4d84f8149afdc';
const dry=process.argv.includes('--dry-run');
const paths=[
  'src/i18n/translations.js',
  'src/services/traditionalUiTypography.js',
  'src/components/navigation/BottomNav.js',
  'src/components/navigation/FixedSectionHeader.js',
  'src/screens/HoursScreen.js',
  'src/screens/MenuScreen.js',
  'src/screens/PrayerLearningScreen.js',
  'src/screens/AccountScreen.js',
  'src/screens/CommunionPreparationScreen.js',
  'src/screens/ConfessionPreparationScreen.js',
  'src/screens/FavoritesScreen.js',
  'src/screens/SearchScreen.js',
  'src/screens/NotificationsScreen.js',
  'src/screens/PrayerBooksScreen.js',
  'src/screens/ChurchCalendarScreen.js',
  'src/components/share/ContentContextMenu.js',
  'src/components/reader/ReaderBookmarkMenu.js',
  'src/components/reader/ReaderAppearanceSheet.js',
];
const deps=['src/i18n/interfaceCompletion.js'];
for(const rel of deps)if(!fs.existsSync(path.join(app,rel)))
  throw Error('Missing '+rel+'. Fetch dependencies first. NO FILES MODIFIED.');
const git=(ref,rel)=>{
  try{
    return execFileSync('git',['show',ref+':molitvoslov-app/'+rel],
      {cwd:root,encoding:'utf8',maxBuffer:20*1024*1024,windowsHide:true})
      .replace(/\r\n/g,'\n');
  }catch(error){
    throw Error('Missing Git revision '+ref+' for '+rel+
      ' (fetch the branch first). NO FILES MODIFIED.');
  }
};
const jobs=[],conflicts=[];
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'molitvoslov-ui-merge-'));
function mergeThreeWay(local,base,target,rel) {
  if(local===target)return local;
  if(local===base)return target;
  const filenames=['ours.js','base.js','theirs.js'].map(name=>path.join(temp,name));
  [local,base,target].forEach((content,i)=>fs.writeFileSync(filenames[i],content,'utf8'));
  try {
    return execFileSync('git',[
      'merge-file','--stdout','--diff3',
      '-L','local','-L','old','-L','new',
      ...filenames
    ],{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:25*1024*1024});
  }catch(error) {
    const preview=String(error.stdout||'');
    const blocks=preview.split('\n');
    const first=blocks.findIndex(line=>line.startsWith('<<<<<<<'));
    const excerpt=first>=0?blocks.slice(Math.max(0,first-3),Math.min(blocks.length,first+12)).join('\n'):'';
    throw Error('Three-way conflict ('+rel+').\n'+excerpt+
      '\nNO FILES MODIFIED. Local changes have priority.');
  }
}
try {
  for(const rel of paths) {
    try {
      const file=path.join(app,rel);
      if(!fs.existsSync(file))throw Error('Source file missing.');
      const raw=fs.readFileSync(file,'utf8');
      const local=raw.replace(/\r\n/g,'\n');
      const base=git(rel==='src/services/traditionalUiTypography.js'
        ? '952e8b736868073ac0bc99e0b516d05fc3466fbb' : baseRef,rel);
      const target=git(targetRef,rel);
      const merged=mergeThreeWay(local,base,target,rel);
      parse(merged,{sourceType:'module',plugins:['jsx']});
      const result=raw.includes('\r\n')?merged.replace(/\n/g,'\r\n'):merged;
      if(result!==raw)jobs.push({file,rel,result});
    } catch(err) {
      conflicts.push({rel,message:String(err?.message||err)});
    }
  }
} finally {
  fs.rmSync(temp,{recursive:true,force:true});
}
if(conflicts.length){
  console.error('CONFLICTS: '+conflicts.length+' source file(s). NO FILES MODIFIED.');
  for(const {rel,message} of conflicts)console.error('\n'+rel+'\n'+message);
  process.exit(1);
}
console.log('PASS: 18 interface files parsed and merged without conflict.');
console.log('TO UPDATE:',jobs.map(x=>x.rel).join(', ')||'none');
if(dry){console.log('DRY RUN. NO FILES MODIFIED.');process.exit(0);}
if(!jobs.length){console.log('ALREADY APPLIED. NO FILES MODIFIED.');process.exit(0);}
const backup=path.join(root,'build-backups',
  'ui-completion-'+new Date().toISOString().replace(/[:.]/g,'-'));
for(const job of jobs){
  const dest=path.join(backup,job.rel);
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.copyFileSync(job.file,dest);
}
for(const job of jobs){
  fs.writeFileSync(job.file,job.result,'utf8');
  console.log('UPDATED:',job.rel);
}
console.log('BACKUP:',backup);
