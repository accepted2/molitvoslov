#!/usr/bin/env node
'use strict';
// READ ONLY: compare Russian/Ukrainian payloads of ALL monthly calendars.
// No files are modified. Run with --month=2026-11 for one month.
const fs=require('node:fs'),path=require('node:path');
const dir=path.join(__dirname,'..','src','data','calendar');
const arg=process.argv.find(x=>x.startsWith('--month='));
const month=arg&&arg.slice(8);
if(month&&!/^20\d\d-(?:0[1-9]|1[0-2])$/.test(month))throw Error('Invalid --month');
const files=fs.readdirSync(dir).filter(x=>/^20\d\d-(?:0[1-9]|1[0-2])\.json$/.test(x)&&(!month||x===month+'.json')).sort();
if(!files.length)throw Error('No calendar month JSON files');
const mib=x=>(x/1048576).toFixed(2);
const totals={days:0,raw:0,equalFields:0,longStrings:0,feastsUk:0,feastsEqual:0,feastsEqualDays:0};
const counts=new Map();
function collect(value,strings){
 if(typeof value==='string'){if(value.length>95)strings.set(value,(strings.get(value)||0)+1);return}
 if(Array.isArray(value)){for(const x of value)collect(x,strings);return}
 if(value&&typeof value==='object')for(const x of Object.values(value))collect(x,strings);
}
for(const file of files){
 const raw=fs.readFileSync(path.join(dir,file),'utf8'),json=JSON.parse(raw);
 const local={match:0,long:0,feasts:0};
 totals.raw+=Buffer.byteLength(raw);
 for(const pair of Object.values(json.days||{})){
  const ru=pair?.ru,uk=pair?.uk;
  if(!ru||!uk)continue;
  totals.days++;
  for(const [k,v] of Object.entries(uk)){
   if(!(k in ru))continue;
   const a=JSON.stringify(ru[k]),b=JSON.stringify(v),bytes=Buffer.byteLength(b);
   if(k==='all_feasts')totals.feastsUk+=bytes;
   if(a===b){
    totals.equalFields+=bytes;local.match+=bytes;
    const entry=counts.get(k)||{n:0,bytes:0};entry.n++;entry.bytes+=bytes;counts.set(k,entry);
    if(k==='all_feasts'){totals.feastsEqual+=bytes;totals.feastsEqualDays++;local.feasts++}
   }
  }
  const r=new Map(),u=new Map();
  collect(ru.all_feasts,r);collect(ru.main_feast,r);
  collect(uk.all_feasts,u);collect(uk.main_feast,u);
  for(const [value,n]of u){
   const shared=Math.min(n,r.get(value)||0);
   local.long+=shared*Buffer.byteLength(value,'utf8');
  }
 }
 totals.longStrings+=local.long;
 console.log(file,'raw',mib(Buffer.byteLength(raw)),'MiB; exact ru/uk fields',mib(local.match),
  'MiB; repeated long text',mib(local.long),'MiB; identical all_feasts days',local.feasts);
}
console.log('\n'+files.length+' calendar months, '+totals.days+' bilingual days.');
console.log('Raw JSON:',mib(totals.raw),'MiB');
console.log('Identical ru/uk field contents:',mib(totals.equalFields),'MiB (raw upper bound)');
console.log('Repeated long text in ru/uk feasts:',mib(totals.longStrings),
 'MiB (may overlap matching fields)');
console.log('Ukrainian all_feasts:',mib(totals.feastsUk),
 'MiB; exactly same as Russian:',mib(totals.feastsEqual),
 'MiB in',totals.feastsEqualDays,'days');
console.log('Identical fields:');
for(const [k,v]of [...counts].sort((a,b)=>b[1].bytes-a[1].bytes).slice(0,20))
 console.log(' ',k,mib(v.bytes)+' MiB',v.n+' days');
console.log('READ ONLY. Raw data savings estimates are not measured APK savings.');
