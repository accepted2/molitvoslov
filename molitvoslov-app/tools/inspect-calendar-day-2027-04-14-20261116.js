#!/usr/bin/env node
'use strict';
// Read-only cross-check of the packaged offline calendar against backend
// calendar_2027.json and calendar_preview_2027.json in the repository.
const fs=require('node:fs'),path=require('node:path');
const app=path.resolve(__dirname,'..');
const repo=path.resolve(app,'..');
const target='2027-04-14';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const sources=[
 ['OFFLINE_MONTH',path.join(app,'src/data/calendar/2027-04.json')],
 ['BACKEND_2027_JSON',path.join(repo,'molitvoslov-backend/calendar_2027.json')],
 ['BACKEND_PREVIEW_2027_JSON',path.join(repo,'molitvoslov-backend/calendar_preview_2027.json')],
];
function summary(obj){
 if(obj==null)return obj;
 if(typeof obj==='string')return obj.slice(0,270);
 if(typeof obj!=='object')return obj;
 if(Array.isArray(obj)){
  if(obj.length>30)return {length:obj.length,first:obj.slice(0,7).map(summary)};
  return obj.map(summary);
 }
 const out={};
 const omit=new Set(['life','life_text','full_text','hagiography','text','description','biography','html','content','troparion','kontakion','history','description_uk','description_ru']);
 for(const [key,value] of Object.entries(obj)){
  if(omit.has(key)){
   out[key]=typeof value==='string'?'[text '+value.length+' characters]':'[long field]';
  }else if(key==='all_feasts' || key==='feasts' || key==='saints' || key==='events'){
   const items=Array.isArray(value)?value:[];
   out[key]={total:items.length,examples:items.slice(0,25).map(x=>{
    if(typeof x==='string')return x.slice(0,220);
    if(!x || typeof x!=='object')return x;
    const keys=['name','title','short_name','name_ru','name_uk','name_cs','id','rank','category','type','date','feast_type','description','is_main'];
    const v={};
    for(const k of keys)if(k in x)v[k]=typeof x[k]==='string'?x[k].slice(0,230):x[k];
    v._keys=Object.keys(x).slice(0,25);
    return v;
   })};
  }else if(key==='main_feast'){
   out[key]=Array.isArray(value)?value.slice(0,8).map(summary):summary(value);
  }else if(Array.isArray(value)){
   out[key]={length:value.length,first:value.slice(0,6).map(summary)};
  }else if(typeof value==='object' && value!==null){
   const keys=Object.keys(value);
   if(keys.length>25)out[key]={keys:keys.slice(0,25),count:keys.length};
   else out[key]=summary(value);
  }else out[key]=typeof value==='string'?value.slice(0,260):value;
 }
 return out;
}
function findMatches(root){
 const hits=[];
 const seen=new Set();
 function rec(value,trail,depth){
  if(hits.length>=12 || depth>8 || !value||typeof value!=='object'||seen.has(value))return;
  seen.add(value);
  if(Array.isArray(value)){
   for(let i=0;i<value.length;i++)rec(value[i],trail+'['+i+']',depth+1);
  }else{
   const keys=Object.keys(value);
   const matches=Object.entries(value).filter(([k,v])=>typeof v==='string'&&v.startsWith(target));
   const pathDate=trail.endsWith('/'+target)||trail.endsWith('.'+target);
   if(pathDate||matches.length){
    if(keys.some(k=>['all_feasts','main_feast','feasts','date_gregorian','saints','readings','name'].includes(k))||pathDate){
     hits.push({location:trail, keys:keys.slice(0,30),data:summary(value)});
    }
   }
   for(const [key,item]of Object.entries(value)){
    if(key==='life'||key==='text'||key==='description'||key==='html')continue;
    if(depth>4 && !/^(days|results|dates|calendar|entries|data|ru|uk|2027|04|14|2027-04-14|feasts|main_feast|all_feasts)$/.test(key))continue;
    rec(item,trail+'/'+key,depth+1);
    if(hits.length>=12)return;
   }
  }
 }
 rec(root,'root',0);
 return hits;
}
for(const [label,file]of sources){
 console.log('\n================================ '+label);
 console.log('FILE:',path.relative(repo,file).replaceAll('\\','/'));
 if(!fs.existsSync(file)){console.log('MISSING FILE');continue;}
 const root=read(file);
 console.log('TYPE:',Array.isArray(root)?'array':typeof root,'ROOT KEYS:',Object.keys(root).slice(0,30));
 console.log('SIZE MiB:',(fs.statSync(file).size/1048576).toFixed(2));
 if(label==='OFFLINE_MONTH'){
   console.log('PACKED:',!!root.__molitvoslov_calendar_delta_version);
   let day=root.days?.[target];
   if(!day)console.log('DATE NOT FOUND IN root.days');
   else{
     if(root.__molitvoslov_calendar_delta_version){
       const {unpackCalendarMonth}=require('../src/services/calendarMonthCodec');
       day=unpackCalendarMonth(root).days[target];
     }
     for(const lang of ['ru','uk']){
       console.log('DAY '+lang+':',JSON.stringify(summary(day?.[lang]),null,2).slice(0,11000));
     }
     console.log('OTHER DAY KEYS:',Object.keys(day).filter(k=>k!=='ru'&&k!=='uk'));
   }
 }else{
   const hits=findMatches(root);
   console.log('MATCH COUNT:',hits.length);
   for(const hit of hits.slice(0,4))
     console.log('MATCH:',JSON.stringify(hit,null,2).slice(0,14000));
   if(!hits.length){
     console.log('No exact date record found. First entries, structure only:',
      JSON.stringify(summary(Array.isArray(root)?root.slice(0,2):Object.fromEntries(Object.entries(root).slice(0,3))),null,2).slice(0,2000));
   }
 }
}
console.log('\nREAD ONLY. No calendar content or APK changed.');
