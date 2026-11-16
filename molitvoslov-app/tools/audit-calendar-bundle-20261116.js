#!/usr/bin/env node
'use strict';
// Read-only audit of the calendar's potential contribution to the Hermes
// bundle. Never edits calendar text, Pascha dates, saint/reading records, images
// or any APK and does not require npm packages.
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const calendar=path.join(root,'src','data','calendar');
const data=path.join(root,'src','data');
const byteLength=s=>Buffer.byteLength(s,'utf8');
const mib=n=>(n/1048576).toFixed(2);
const scan=[];
function walk(dir) {
  if(!fs.existsSync(dir))return;
  for(const f of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,f.name);
    if(f.isDirectory())walk(full);
    else if(/\.(?:js|jsx|ts|tsx)$/.test(f.name))scan.push(full);
  }
}
walk(path.join(root,'src'));
for(const p of ['App.js','index.js','metro.config.js']){
  const full=path.join(root,p);
  if(fs.existsSync(full))scan.push(full);
}
const sourceFiles=scan.map(file=>({file:path.relative(root,file).replace(/\\/g,'/'),
  content:fs.readFileSync(file,'utf8')}));
function references(token) {
  return sourceFiles.filter(p=>p.content.includes(token))
    .map(p=>p.file);
}
const standalone=path.join(data,'calendar_2026.json');
const months=fs.existsSync(calendar)
  ? fs.readdirSync(calendar).filter(name=>/^20\d\d-(?:0[1-9]|1[0-2])\.json$/.test(name)).sort()
  : [];
const monthSizes=months.map(name=>({name,bytes:fs.statSync(path.join(calendar,name)).size}));
const monthTotal=monthSizes.reduce((n,f)=>n+f.bytes,0);
console.log('SOURCE SIZE (uncompressed; not APK size):');
console.log('  2025-2027 monthly calendar files:',months.length,'files,',mib(monthTotal),'MiB');
console.log('  2026 standalone monolith:',fs.existsSync(standalone)?mib(fs.statSync(standalone).size)+' MiB':'absent');
console.log('  calendar_2026.json import references:',references('calendar_2026.json').join(', ')||'none found');
console.log('  monthly calendar module references:',references("data/calendar/").join(', ')||'none found');
console.log('  calendarOfflineStore.js references:',references('calendarOfflineStore').join(', ')||'none found');
console.log('  largest source months:',
  monthSizes.slice().sort((a,b)=>b.bytes-a.bytes).slice(0,8)
    .map(x=>x.name+' '+mib(x.bytes)+' MiB').join('; '));
console.log('');
if(!months.length){console.log('No calendar months available. Exiting without changes.');process.exit(0);}
const inspectArg=process.argv.find(a=>a.startsWith('--sample='));
const selected=inspectArg?inspectArg.slice(9):'2026-11';
if(!/^20\d\d-(?:0[1-9]|1[0-2])$/.test(selected) || !months.includes(selected+'.json')){
  throw Error('Unknown sample month '+selected);
}
const payload=JSON.parse(fs.readFileSync(path.join(calendar,selected+'.json'),'utf8'));
const days=payload?.days||{};
const samples=Object.entries(days);
const breakdown={};
const nDays=samples.length;
const langCounts={};
let maxDay=0;
let maxDate='';
for(const [date,languages] of samples){
  if(!languages || typeof languages!=='object')continue;
  const daySize=byteLength(JSON.stringify(languages));
  if(daySize>maxDay){maxDay=daySize;maxDate=date;}
  for(const [lang,record] of Object.entries(languages)){
    if(!record || typeof record!=='object')continue;
    langCounts[lang]=(langCounts[lang]||0)+1;
    for(const [key,value] of Object.entries(record)){
      const sumKey=lang+' / '+key;
      breakdown[sumKey]=(breakdown[sumKey]||0)+byteLength(JSON.stringify(value));
    }
  }
}
const overall=fs.statSync(path.join(calendar,selected+'.json')).size;
console.log('STRUCTURAL PROFILE: '+selected+'.json ('+mib(overall)+' MiB)');
console.log('  Days:',nDays,'languages:',JSON.stringify(langCounts));
console.log('  Largest day:',maxDate,'('+mib(maxDay)+' MiB)');
console.log('  Leading fields of the sample month (raw JSON bytes):');
for(const [key,bytes] of Object.entries(breakdown).sort((a,b)=>b[1]-a[1]).slice(0,25)){
  console.log('    '+key+': '+mib(bytes)+' MiB ('+(bytes/overall*100).toFixed(1)+'%)');
}
console.log('');
console.log('This is a read-only estimate. React Native bundles statically required JSON');
console.log('into Hermes; inspect the actual APK with analyze-apk-size-20261113.ps1.');
console.log('No data was changed.');
