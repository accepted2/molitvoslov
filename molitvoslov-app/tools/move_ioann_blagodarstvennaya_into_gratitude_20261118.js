#!/usr/bin/env node
'use strict';
// Keep the original ID, slug, prayer text and favorites. Move only one
// CategoryText link from "St John" to its nested "Gratitude" subcategory.
// A genuine duplicate of an existing gratitude prayer is merely unlinked
// from the parent; Text records are NEVER deleted.
// --dry-run makes no changes; an original-file backup precedes atomic replace.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname,'..');
const file = path.join(root,'src','data','offlineContent.json');
const original = fs.readFileSync(file,'utf8');
const bom = original.startsWith('\uFEFF')?'\uFEFF':'';
const raw = original.slice(bom.length);
const payload = JSON.parse(raw);
const MAIN = 'ioann-kronshtadtsky-molitvy';
const THANKS = 'molitvy-ioanna-kronshtadtskogo';
const TARGET = 'ioann-kronstadt-azbyka-prayer-01';
const categories = payload.categories;
const groups = payload.category_texts;
if (!Array.isArray(categories) || !groups || !payload.texts) {
  throw Error('Unexpected offlineContent.json structure. NO FILES MODIFIED.');
}
const main = categories.find(c=>c.slug===MAIN), thanks = categories.find(c=>c.slug===THANKS);
if (!main || !thanks || Number(thanks.parent)!==Number(main.id) ||
    !Array.isArray(groups[MAIN]) || !Array.isArray(groups[THANKS])) {
  throw Error('The two nested St John categories are missing or not yet arranged. NO FILES MODIFIED.');
}
const indexes = groups[MAIN].filter(row=>row?.text?.slug===TARGET);
const thankRows = groups[THANKS];
const already = thankRows.filter(row=>row?.text?.slug===TARGET);
if (indexes.length>1 || already.length>1 || (indexes.length && already.length)) {
  // Both links may exist due to an interrupted earlier import; never create a third.
  if (indexes.length===1 && already.length===1) {
    console.log('Target already linked in gratitude; redundant main entry will be unlinked.');
  } else throw Error('Unexpected duplicate prayer links: '+TARGET+'. NO FILES MODIFIED.');
}
const source=payload.texts[TARGET];
if (!source || !source.id || !String(source.title||'').toLowerCase().includes('благодарственн') ||
    !String(source.translation||source.content||'').trim()) {
  throw Error('Original grateful prayer is incomplete or changed; NO FILES MODIFIED.');
}
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f\u0483-\u0489]/g,'')
 .toLowerCase().replace(/ё/g,'е').replace(/[^а-яa-z0-9іїєґ]+/gi,' ')
 .replace(/\s+/g,' ').trim();
const body=t=>String(t?.translation||t?.content||t?.traditional_content||'');
const sourceBody=norm(body(source));
if(sourceBody.length<50)throw Error('Cannot deduplicate a suspiciously short prayer. NO FILES MODIFIED.');
const sameText = thankRows.find(row=>
  row?.text?.slug!==TARGET &&
  norm(body(payload.texts[row?.text?.slug]||row.text))===sourceBody);
if (!indexes.length && !already.length) {
  if (sameText) {
    console.log('PASS: grateful prayer already represented by identical text in gratitude. NO FILES MODIFIED.');
    process.exit(0);
  }
  throw Error('Cannot find "Молитва благодарственная" by original source slug; NO FILES MODIFIED.');
}
const requestedAction = already.length ? 'ALREADY_IN_GRATITUDE':
 sameText ? 'EXACT_DUPLICATE_IN_GRATITUDE' : 'MOVE_EXISTING_PRAYER_INTO_GRATITUDE';
console.log('Prayer: '+source.title);
console.log('Source slug: '+TARGET+'; text ID: '+source.id);
console.log('Action: '+requestedAction);
if(sameText)console.log('Identical gratitude text: '+sameText.text.slug);
if(!indexes.length){
 console.log('PASS: grateful prayer already moved. NO FILES MODIFIED.');
 process.exit(0);
}
const entry=indexes[0];
if(Number(entry?.text?.id)!==Number(source.id))throw Error('Text ID mismatch. NO FILES MODIFIED.');
groups[MAIN]=groups[MAIN].filter(row=>row!==entry);
if(!already.length && !sameText){
 const order=Math.max(0,...thankRows.map(row=>Number(row.order)||0))+10;
 entry.order=order;
 entry.category={...thanks};
 thankRows.push(entry);
}
const newCategoryList = old => {
 const current=Array.isArray(old)?old:[];
 const filtered=current.filter(c=>Number(c?.id)!==Number(main.id));
 if(!sameText && !filtered.some(c=>Number(c?.id)===Number(thanks.id)))filtered.push({...thanks});
 return filtered;
};
const sync=txt=>{
 if(!txt || txt.slug!==TARGET)return;
 txt.categories=newCategoryList(txt.categories);
};
sync(source);
for(const records of Object.values(groups))if(Array.isArray(records))for(const record of records)sync(record.text);
if(groups[MAIN].some(row=>row?.text?.slug===TARGET))
 throw Error('Target still appears in main category. NO FILES MODIFIED.');
if(!sameText && !groups[THANKS].some(row=>row?.text?.slug===TARGET))
 throw Error('Gratitude link validation failed. NO FILES MODIFIED.');
if(process.argv.includes('--dry-run')){
 console.log('DRY RUN PASS. NO FILES MODIFIED.');
 process.exit(0);
}
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'
 ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const versionPayload={...payload};
delete versionPayload.schema_version;delete versionPayload.content_version;delete versionPayload.generated_at;
payload.content_version=crypto.createHash('sha256').update(
 JSON.stringify(stable(versionPayload)),'utf8').digest('hex');
payload.generated_at=new Date().toISOString();
const pretty=/^\s*\{\s*\n/.test(raw);
let updated=JSON.stringify(payload,null,pretty?2:0)+'\n';
if(original.includes('\r\n'))updated=updated.replace(/\n/g,'\r\n');
const dir=path.resolve(root,'..','build-backups','gratitude-prayer-before-'+
 new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(dir,{recursive:true});
fs.copyFileSync(file,path.join(dir,'offlineContent.json'));
const tmp=file+'.gratitude-prayer-tmp';
try{
 fs.writeFileSync(tmp,bom+updated,'utf8');
 const verified=JSON.parse(fs.readFileSync(tmp,'utf8').replace(/^\uFEFF/,''));
 if(verified.category_texts[MAIN].some(row=>row.text?.slug===TARGET))
  throw Error('Final prayer migration check failed');
 fs.renameSync(tmp,file);
}catch(error){try{fs.unlinkSync(tmp)}catch{}throw error;}
console.log('PASS: "Молитва благодарственная" now belongs to the gratitude section.');
console.log('Backup: '+path.join(dir,'offlineContent.json'));
console.log('Preserved original text, slug, ID and unrelated sections.');
