#!/usr/bin/env node
'use strict';
// Offline, transactional patcher. Applies only the i18n differences between
// the immutable baseline and the reviewed three-language commit. Preserves
// unrelated edits in the local worktree; aborts before writing on conflicts.
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {parse}=require('@babel/parser');

const root=path.resolve(__dirname,'../..');
const app=path.join(root,'molitvoslov-app');
const oldRef='6621b8cf1057221b56571b72d97ea902f8d5f260';
const newRef='68534a06057b5ca31fa9be082dd49b8a4e8868b4';
const dry=process.argv.includes('--dry-run');
const paths=[
  'src/services/languagePreferences.js',
  'src/services/localizedContent.js',
  'src/services/readerLanguageModes.js',
  'src/services/readerPreferences.js',
  'src/i18n/translations.js',
  'src/services/calendarPreferences.js',
  'src/services/churchCalendar.js',
  'src/screens/HoursScreen.js',
  'src/screens/HoursReadingScreen.js',
  'src/screens/PrayerLearningScreen.js',
  'src/screens/AccountScreen.js',
  'src/screens/MenuScreen.js',
  'src/screens/CommunionPreparationScreen.js',
  'src/screens/ConfessionPreparationScreen.js',
  'src/components/navigation/BottomNav.js',
  'src/components/navigation/FixedSectionHeader.js',
];
const dependencies=[
  'src/i18n/traditionalUi.js',
  'src/i18n/extraCopy.js',
  'src/data/hoursLocalization.js',
  'src/data/prayerLearningLocalized.js',
];
for(const rel of dependencies){
  const filename=path.join(app,rel);
  if(!fs.existsSync(filename)){
    throw Error('Missing dependency: '+rel+'; run the documented git restore first. NO FILES MODIFIED.');
  }
}

const git=(ref,rel)=>{
  try{
    return execFileSync('git',['show',ref+':molitvoslov-app/'+rel],{
      cwd:root,encoding:'utf8',maxBuffer:16*1024*1024,windowsHide:true,
      stdio:['ignore','pipe','pipe'],
    }).replace(/\r\n/g,'\n');
  }catch(error){
    throw Error('Git object not available: '+ref+' '+rel+
      '. Run git fetch. NO FILES MODIFIED. '+String(error.stderr||error.message).slice(0,200));
  }
};

function createHunks(a,b){
  const A=a.split('\n'),B=b.split('\n'),n=A.length,m=B.length,w=m+1;
  if(n*m>11000000)throw Error('Unexpected file size for safe patch.');
  const matrix=new Uint16Array((n+1)*(m+1));
  for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--){
    matrix[i*w+j]=A[i]===B[j]
      ?matrix[(i+1)*w+j+1]+1
      :Math.max(matrix[(i+1)*w+j],matrix[i*w+j+1]);
  }
  let i=0,j=0;const ops=[];
  while(i<n||j<m){
    if(i<n&&j<m&&A[i]===B[j]){
      ops.push({kind:'=',text:A[i]});i++;j++;
    }else if(i<n&&(j===m||matrix[(i+1)*w+j]>=matrix[i*w+j+1])){
      ops.push({kind:'-',text:A[i]});i++;
    }else{
      ops.push({kind:'+',text:B[j]});j++;
    }
  }
  const changed=[];
  for(let k=0;k<ops.length;k++)if(ops[k].kind!=='=')changed.push(k);
  const groups=[];
  for(const index of changed){
    const prior=groups[groups.length-1];
    if(prior&&index-prior.end<=5)prior.end=index;
    else groups.push({start:index,end:index});
  }
  const collect=(seq,kind)=>seq.filter(x=>x.kind!==kind).map(x=>x.text).join('\n');
  return groups.map(({start,end})=>{
    const seq=ops.slice(Math.max(0,start-3),Math.min(ops.length,end+4));
    const core=ops.slice(start,end+1);
    return {old:collect(seq,'+'),next:collect(seq,'-'),
      coreOld:collect(core,'+'),coreNew:collect(core,'-')};
  });
}
const count=(s,chunk)=>chunk?s.split(chunk).length-1:0;
function patch(source,changes,relative){
  let output=source;
  changes.forEach((h,index)=>{
    if(h.old===h.next)return;
    if(count(output,h.next)===1)return; // already applied
    else if(count(output,h.old)===1)output=output.replace(h.old,h.next);
    else if(h.coreOld&&count(output,h.coreOld)===1)
      output=output.replace(h.coreOld,h.coreNew);
    else throw Error(relative+' conflict at change '+(index+1)+'/'+changes.length+
      '. Existing edits preserved. NO FILES MODIFIED.');
  });
  return output;
}
const writes=[];
for(const rel of paths){
  const file=path.join(app,rel);
  if(!fs.existsSync(file))throw Error('File missing: '+rel+'. NO FILES MODIFIED.');
  const base=git(oldRef,rel);
  const next=git(newRef,rel);
  const hunks=createHunks(base,next);
  if(patch(base,hunks,rel)!==next){
    throw Error('Patch self-validation failed for '+rel+'. NO FILES MODIFIED.');
  }
  const source=fs.readFileSync(file,'utf8');
  const patched=patch(source.replace(/\r\n/g,'\n'),hunks,rel);
  parse(patched,{sourceType:'module',plugins:['jsx']});
  const result=source.includes('\r\n')?patched.replace(/\n/g,'\r\n'):patched;
  if(result!==source)writes.push({file,rel,result});
}
console.log('PASS: three-language patch prepared in memory; all files parse.');
console.log('TO UPDATE:',writes.map(x=>x.rel).join(', ')||'none');
if(!writes.length){console.log('ALREADY INSTALLED. NO FILES MODIFIED.');process.exit(0);}
if(dry){console.log('DRY RUN. NO FILES MODIFIED.');process.exit(0);}
const backup=path.resolve(root,'build-backups',
  'three-language-ui-'+new Date().toISOString().replace(/[:.]/g,'-'));
for(const x of writes){
  const dest=path.join(backup,x.rel);
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.copyFileSync(x.file,dest);
}
for(const x of writes){
  fs.writeFileSync(x.file,x.result,'utf8');
  console.log('UPDATED:',x.rel);
}
console.log('BACKUP:',backup);
