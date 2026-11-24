#!/usr/bin/env node
'use strict';
// Review candidates, not automatic translations: liturgical and user-authored
// content must not be mechanically changed to match the UI language.
const fs=require('node:fs');
const path=require('node:path');
const {parse}=require('@babel/parser');
const root=path.resolve(__dirname,'../src');
const results=[];
const scanDirectories=['screens','components','widgets'];
const isCyrillic=/[А-Яа-яЁёІіЇїЄєҐґѢѣѲѳѴѵ]/u;
const scan=(node,filename)=>{
  if(!node||typeof node!=='object')return;
  const record=(type,source,pos)=>{
    const str=String(source||'').trim().replace(/\s+/gu,' ');
    if(!str||!isCyrillic.test(str))return;
    results.push({file:filename,type,line:pos?.line||0,text:str.slice(0,230)});
  };
  if(node.type==='JSXText')record('visible JSX',node.value,node.loc?.start);
  if(node.type==='JSXAttribute' &&
    ['accessibilityLabel','accessibilityHint','placeholder','label','title'].includes(
      node.name?.name) && node.value?.type==='StringLiteral')
    record('accessibility / field',node.value.value,node.loc?.start);
  if(node.type==='CallExpression' &&
    node.callee?.object?.name==='Alert' && node.callee?.property?.name==='alert')
    for(const arg of node.arguments)if(arg?.type==='StringLiteral')
      record('Alert',arg.value,arg.loc?.start);
  for(const [key,val] of Object.entries(node)){
    if(key==='loc'||key==='tokens'||key==='comments'||key==='extra')continue;
    if(Array.isArray(val)) {
      for(const part of val)if(part?.type)scan(part,filename);
    } else if(val?.type) {
      scan(val,filename);
    }
  }
};
const walk=(directory)=>{
  if(!fs.existsSync(directory))return;
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
    const file=path.join(directory,entry.name);
    if(entry.isDirectory())walk(file);
    else if(entry.isFile()&&/\.[cm]?[jt]sx?$/.test(entry.name)){
      const source=fs.readFileSync(file,'utf8');
      try{
        const ast=parse(source,{sourceType:'module',plugins:['jsx','typescript']});
        scan(ast,path.relative(root,file).replace(/\\/g,'/'));
      }catch(err){results.push({file:path.relative(root,file),type:'PARSE ERROR',line:0,text:err.message});}
    }
  }
};
scanDirectories.forEach(dir=>walk(path.join(root,dir)));
results.sort((a,b)=>a.file.localeCompare(b.file)||a.line-b.line);
const grouped={};
for(const item of results)(grouped[item.file]??=[]).push(item);
const stats=Object.entries(grouped).map(([file,hits])=>({file,count:hits.length}))
  .sort((a,b)=>b.count-a.count);
const outfile=path.resolve(__dirname,'../reports/ui-i18n-literal-audit-20261121.json');
fs.mkdirSync(path.dirname(outfile),{recursive:true});
fs.writeFileSync(outfile,JSON.stringify({generatedAt:new Date().toISOString(),
  note:'Candidates requiring human review; includes source-text literals.',
  total:results.length,byFile:stats,items:results},null,2),'utf8');
console.log('UI LITERAL AUDIT: '+results.length+' candidates in '+stats.length+' files.');
console.log('Report: '+outfile);
for(const item of stats.slice(0,30))console.log(String(item.count).padStart(4)+'  '+item.file);
console.log('This is a review report, not evidence that a prayer text should be translated.');
