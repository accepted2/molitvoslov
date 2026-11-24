#!/usr/bin/env node
'use strict';
// Offline-only regression: tests live JSON migration without touching user's files.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const script=path.join(__dirname,'reorganize_ioann_kronstadt_catalog_20261118.js');
const workspace=fs.mkdtempSync(path.join(os.tmpdir(),'ioann-nested-test-'));
const app=path.join(workspace,'app');
fs.mkdirSync(path.join(app,'tools'),{recursive:true});
fs.mkdirSync(path.join(app,'src','data'),{recursive:true});
fs.copyFileSync(script,path.join(app,'tools',path.basename(script)));
const root={id:1,slug:'raznye-molitvy',name:'Разные молитвы',parent:null,order:1};
const main={id:2,slug:'ioann-kronshtadtsky-molitvy',name:'Молитвы святого праведного Иоанна Кронштадтского',parent:1,order:2};
const gratitude={id:3,slug:'molitvy-ioanna-kronshtadtskogo',name:'Благодарственные молитвы святого праведного Иоанна Кронштадтского',parent:1,order:3};
const volumes={id:4,slug:'ioann-kronshtadtsky-moya-zhizn-vo-khriste',name:'Моя жизнь во Христе',parent:2,order:4};
const categories=[root,main,gratitude,volumes];
const content={
 schema_version:1,content_version:'old',generated_at:'old',
 categories, category_texts:Object.fromEntries(categories.map(c=>[c.slug,[]])),
 texts:{},prayer_rules:{list:[]},canons:{list:[]},akathists:{list:[]},
};
let id=1,rowId=1;
const text=(slug,title,translation,category)=>{
 const t={id:id++,slug,title,description:'',content:'',traditional_content:'',translation,
 categories:[category],language:'ru'};
 content.texts[slug]=t;return t
};
const link=(slug,cat,order=10)=>{
 const t=content.texts[slug];
 content.category_texts[cat.slug].push({id:rowId++,category:cat,text:{...t,categories:[...t.categories]},order});
};
const body='Господи, помилуй нас, прости грехи наши, благослови и сохрани нас от всякого зла. Аминь.';
for(let i=1;i<=3;i++){
 const slug='ioann-kronshtadtsky-gratitude-'+i;
 text(slug,'Благодарственная молитва '+i, i===1?body:'Молитва '+i+'. '+body,gratitude);link(slug,gratitude,i*10);
}
for(let i=1;i<=15;i++){
 const slug='ioann-kronstadt-azbyka-prayer-'+i;
 text(slug,'Молитва '+i,'Отче наш. '+i+'. '+body,main);link(slug,main,i*10);
}
for(let i=1;i<=3;i++){
 const slug='ioann-kronstadt-moya-zhizn-tom-'+i;
 text(slug,'Том '+i,'Из книги том '+i+'. '+body,volumes);link(slug,volumes,i*10);
}
text('root-exact','Молитва ко Пресвятой Троице святого праведного Иоанна Кронштадтского',body,root);
link('root-exact',root,10);
text('root-distinct','Молитвы святого праведного Иоанна Кронштадтского','Уникальная молитва автора. '+body,root);
link('root-distinct',root,20);
text('unrelated','Молитва перед дорогой','Господи, сохрани путников.',root);
link('unrelated',root,30);
const target=path.join(app,'src','data','offlineContent.json');
fs.writeFileSync(target,JSON.stringify(content,null,2),'utf8');
const run=args=>{
 const result=spawnSync(process.execPath,[path.join(app,'tools',path.basename(script)),...args],
  {cwd:app,encoding:'utf8',timeout:15000});
 assert.equal(result.status,0,'Migration failure: '+result.stderr+'\n'+result.stdout);
 return result.stdout;
};
try{
 const before=fs.readFileSync(target);
 const dry=run(['--dry-run']);
 assert.match(dry,/exact duplicates unlinked: 1/);
 assert.match(dry,/original prayers moved: 1/);
 assert.equal(fs.readFileSync(target).toString(),before.toString(),'Dry run modified source!');
 const applied=run([]);
 assert.match(applied,/PASS: gratitude nested/);
 const changed=JSON.parse(fs.readFileSync(target,'utf8'));
 assert.equal(changed.categories.find(c=>c.slug===gratitude.slug).parent,main.id);
 assert.deepEqual(changed.category_texts[root.slug].map(row=>row.text.slug),['unrelated']);
 const moved=changed.category_texts[main.slug].find(row=>row.text.slug==='root-distinct');
 assert.equal(moved.text.id,content.texts['root-distinct'].id);
 assert.equal(moved.category.parent,root.id);
 assert.equal(moved.category.id,main.id);
 assert.equal(changed.texts['root-exact'].id,content.texts['root-exact'].id);
 assert(!changed.texts['root-exact'].categories.some(c=>c.id===root.id));
 assert(changed.texts['root-distinct'].categories.some(c=>c.id===main.id));
 assert(!changed.texts['root-distinct'].categories.some(c=>c.id===root.id));
 assert.deepEqual(changed.texts.unrelated,content.texts.unrelated);
 assert.equal(changed.category_texts[gratitude.slug].length,3);
 assert.equal(changed.category_texts[main.slug].length,16);
 assert.equal(changed.category_texts[volumes.slug].length,3);
 const appliedBytes=fs.readFileSync(target);
 const second=run([]);
 assert.match(second,/already installed/);
 assert.deepEqual(fs.readFileSync(target),appliedBytes,'Second run modified catalog');
 console.log('PASS: root collection becomes a nested gratitude category');
 console.log('PASS: exact duplicate root entry unlinked, original text ID retained');
 console.log('PASS: distinct prayer moved without new text ID or missing links');
 console.log('PASS: unrelated prayers, other categories and personal data untouched');
 console.log('PASS: dry-run does not write; second run idempotent');
} finally {
 fs.rmSync(workspace,{recursive:true,force:true});
}
