#!/usr/bin/env node
'use strict';
// Safely integrate the improved Android widgets from the GitHub branch into
// the user's Windows checkout. Unrelated local edits are 3-way merged, never
// overwritten. Every candidate is validated BEFORE any files are written.
const fs=require('node:fs'), os=require('node:os'), path=require('node:path');
const {execFileSync,spawnSync}=require('node:child_process');
const repoRoot=path.resolve(__dirname,'..','..');
const appRoot=path.join(repoRoot,'molitvoslov-app');
const beforeRef='origin/fix/calendar-auto-day-rollover-20261118';
const afterRef='origin/feat/widgets-responsive-state-20261118';
const targets=[
 'src/widgets/widgetLayout.js',
 'src/widgets/widgetState.js',
 'src/widgets/QuoteOfDayWidget.js',
 'src/widgets/ChurchCalendarWidget.js',
 'src/widgets/widgetTaskHandler.js',
 'src/screens/MenuScreen.js',
 'tools/test_widget_bundle_20261118.js',
];
const git=(...args)=>execFileSync('git',args,{cwd:repoRoot,encoding:'utf8',maxBuffer:20*1024*1024});
const gitFile=(ref,p)=>git('show',ref+':molitvoslov-app/'+p);
try{
 git('rev-parse','--verify',afterRef);
 git('rev-parse','--verify',beforeRef);
}catch(error){
 console.error('Missing local GitHub refs. Fetch BOTH feature and base branches first.');
 process.exit(1);
}
const originalStyle=(text,merged)=>text.includes('\r\n')?
 merged.replace(/\r?\n/g,'\r\n'):merged.replace(/\r\n/g,'\n');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'molitvoslov-widgets-'));
let files=[];
try{
 for(const name of targets){
  const file=path.join(appRoot,name);
  const exists=fs.existsSync(file);
  const local=exists?fs.readFileSync(file,'utf8'):null;
  const incoming=gitFile(afterRef,name);
  let updated=incoming;
  if(exists && local!==incoming){
   let base=null;
   try{base=gitFile(beforeRef,name)}catch(_error){}
   if(base===null){
    throw Error(name+': this file already exists locally, but was new in feature branch.');
   }
   if(local===base)updated=incoming;
   else if(local===incoming)updated=local;
   else{
    const prefix=String(files.length);
    const mine=path.join(temp,prefix+'-local');
    const ancestor=path.join(temp,prefix+'-base');
    const theirs=path.join(temp,prefix+'-remote');
    fs.writeFileSync(mine,local,'utf8');
    fs.writeFileSync(ancestor,base,'utf8');
    fs.writeFileSync(theirs,incoming,'utf8');
    const merge=spawnSync('git',['merge-file','-p',mine,ancestor,theirs],{
      cwd:repoRoot,encoding:'utf8',maxBuffer:20*1024*1024,
    });
    if(merge.status!==0 || /^(<<<<<<<|=======|>>>>>>>)/m.test(merge.stdout)){
      throw Error(name+': local edit intersects widget changes ('+
        (merge.stderr||'merge conflict').trim()+'). NO FILES MODIFIED.');
    }
    updated=originalStyle(local,merge.stdout);
   }
  }
  files.push({name,file,exists,original:local,updated});
 }
 const pending=files.filter(x=>!x.exists||x.updated!==x.original);
 if(!pending.length){
  console.log('PASS: all improved widget sources already installed.');
  process.exit(0);
 }
 const backups=path.resolve(repoRoot,'build-backups',
   'widgets-before-'+new Date().toISOString().replace(/[:.]/g,'-'));
 fs.mkdirSync(backups,{recursive:true});
 for(const item of pending)if(item.exists){
  const destination=path.join(backups,item.name.replace(/[\\/]/g,'__'));
  fs.copyFileSync(item.file,destination);
 }
 const written=[];
 try{
  for(const item of pending){
   fs.mkdirSync(path.dirname(item.file),{recursive:true});
   fs.writeFileSync(item.file,item.updated,'utf8');
   written.push(item);
  }
 }catch(error){
  for(const item of written){
   if(item.exists)fs.writeFileSync(item.file,item.original,'utf8');
   else if(fs.existsSync(item.file))fs.unlinkSync(item.file);
  }
  throw error;
 }
 console.log('PASS: widgets integrated, preserving unrelated local changes.');
 console.log('Changed:',pending.map(x=>x.name).join(', '));
 console.log('Backups:',backups);
 console.log('Run: node tools/test_widget_bundle_20261118.js');
}finally{
 fs.rmSync(temp,{recursive:true,force:true});
}
