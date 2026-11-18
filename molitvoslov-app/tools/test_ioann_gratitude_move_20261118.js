#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const originalScript=path.join(__dirname,'move_ioann_blagodarstvennaya_into_gratitude_20261118.js');
const main={id:3,slug:'ioann-kronshtadtsky-molitvy',name:'Молитвы Иоанна',parent:1};
const grat={id:4,slug:'molitvy-ioanna-kronshtadtskogo',name:'Благодарственные молитвы',parent:3};
const TARGET='ioann-kronstadt-azbyka-prayer-01';
const sourceBody='Господи, благодарю Тебя за безмерную милость ко мне и всем людям, благослови нас и наполни сердца любовью!';
function prepare(duplicate){
 const source={id:41,slug:TARGET,title:'Молитва благодарственная',content:'',translation:sourceBody,categories:[main]};
 const prayer={id:42,slug:'ioann-kronshtadtsky-gratitude-02',title:'Благодарение Господу',
  content:'',translation:duplicate?sourceBody:'Господи, благодарю Тебя за всё, что даруешь. '+sourceBody,categories:[grat]};
 const mainRow={id:101,category:main,text:{...source,categories:[main]},order:10};
 const gratRow={id:102,category:grat,text:{...prayer,categories:[grat]},order:10};
 return {schema_version:1,content_version:'previous',generated_at:'previous',
 categories:[{id:1,slug:'raznye-molitvy',parent:null},main,grat],
 category_texts:{[main.slug]:[mainRow],[grat.slug]:[gratRow]},texts:{[TARGET]:source,[prayer.slug]:prayer},
 prayer_rules:{list:[]},extra:'unchanged'};
}
const run=(script,folder,extra=[])=>{
 const output=spawnSync(process.execPath,[script,...extra],{cwd:folder,encoding:'utf8',timeout:12000});
 assert.equal(output.status,0,'Nonzero exit: '+output.stderr+'\n'+output.stdout);
 return output.stdout;
};
for(const duplicate of [false,true]){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ioann-gratitude-'));
 try{
  const app=path.join(temp,'app'),script=path.join(app,'tools',path.basename(originalScript));
  fs.mkdirSync(path.dirname(script),{recursive:true});
  fs.mkdirSync(path.join(app,'src','data'),{recursive:true});
  fs.copyFileSync(originalScript,script);
  const file=path.join(app,'src','data','offlineContent.json');
  const before=prepare(duplicate);
  fs.writeFileSync(file,JSON.stringify(before,null,2),'utf8');
  const initial=fs.readFileSync(file);
  assert.match(run(script,app,['--dry-run']),/DRY RUN PASS/);
  assert.deepEqual(fs.readFileSync(file),initial,'Dry-run must not edit file');
  const result=run(script,app);
  assert.match(result,/PASS: "Молитва благодарственная"/);
  assert.match(result,duplicate?/EXACT_DUPLICATE_IN_GRATITUDE/:/MOVE_EXISTING_PRAYER_INTO_GRATITUDE/);
  const data=JSON.parse(fs.readFileSync(file,'utf8'));
  assert.equal(data.category_texts[main.slug].length,0);
  assert.equal(data.category_texts[grat.slug].length,duplicate?1:2);
  assert.equal(data.texts[TARGET].id,41);
  assert.equal(data.texts[TARGET].translation,sourceBody);
  assert.equal(data.extra,'unchanged');
  if(!duplicate){
   assert(data.category_texts[grat.slug].some(row=>row.id===101 && row.text.slug===TARGET));
   assert(data.texts[TARGET].categories.some(c=>c.id===grat.id));
  }
  const installed=fs.readFileSync(file);
  assert.match(run(script,app),/already moved/);
  assert.deepEqual(fs.readFileSync(file),installed,'Running twice must not re-write the catalog');
  console.log('PASS: '+(duplicate?'exact-duplicate link removal':'original link move')+
    ', stable text ID, dry-run, idempotence');
 }finally{fs.rmSync(temp,{recursive:true,force:true})}
}
