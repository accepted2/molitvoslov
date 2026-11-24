#!/usr/bin/env node
'use strict';
// Safely removes Azbyka decorative "***" separators from the Ioann Kronstadt
// imports and deduplicates ONLY a provably identical prayer shown at the root.
// Never deletes prayer text records, user saves, category children or other texts.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const file=path.join(root,'src/data/offlineContent.json');
const original=fs.readFileSync(file,'utf8');
const bom=original.startsWith('\uFEFF')?'\uFEFF':'';
const raw=original.slice(bom.length);
let data;
try{data=JSON.parse(raw)}catch(e){throw Error('Invalid offlineContent.json: '+e.message)}
if(!data?.texts||!data?.category_texts||!Array.isArray(data.categories))throw Error('Unexpected schema; NO FILES MODIFIED');
const ROOT='raznye-molitvy';
const IOANN=['molitvy-ioanna-kronshtadtskogo','ioann-kronshtadtsky-molitvy','ioann-kronshtadtsky-moya-zhizn-vo-khriste'];
const isIoannSlug=slug=>/^(?:ioann-kronshtadtsky-|ioann-kronstadt-azbyka-prayer-|ioann-kronstadt-moya-zhizn-tom-)/.test(String(slug||''));
const trimDecorativeSeparators=body=>{
 const chunks=String(body||'').replace(/\r\n/g,'\n').split(/\n\s*\n/);
 return chunks.filter(chunk=>!/^\s*(?:\*\s*){3,}\s*$/.test(chunk))
   .join('\n\n').trim();
};
const canonical=body=>String(body||'').normalize('NFD')
 .replace(/[\u0300-\u036f\u0483-\u0489]/g,'').toLowerCase().replace(/ё/g,'е')
 .replace(/[^а-яa-z0-9іїєґ]+/gi,' ').trim().replace(/\s+/g,' ');
const changes=[],updated=new Map(),candidates=[];
const linkedSlugs=new Set();
for(const slug of IOANN){
 for(const row of data.category_texts[slug]||[]){
  if(isIoannSlug(row?.text?.slug))linkedSlugs.add(row.text.slug);
 }
}
for(const slug of linkedSlugs){
 const text=data.texts[slug];
 if(!text)throw Error('Missing imported prayer text: '+slug+'. NO FILES MODIFIED.');
 const before=String(text.translation||'');
 const after=trimDecorativeSeparators(before);
 if(before!==after) {
  if(after.length<25)throw Error('A prayer became too short: '+slug);
  text.translation=after;
  updated.set(slug,after);
  changes.push('Removed decorative separators from '+slug);
 }
}
if(updated.size){
 for(const rows of Object.values(data.category_texts)){
  for(const row of rows){
   const slug=row?.text?.slug;
   if(updated.has(slug))row.text.translation=updated.get(slug);
  }
 }
}
// Exclude only a duplicate already available inside an Ioann subcategory,
// proven by a complete normalized content match (not by similar titles).
const importedBodies=new Set([...linkedSlugs].map(slug=>canonical(
 data.texts[slug]?.translation || data.texts[slug]?.content || ''
)).filter(text=>text.length>70));
const rootRows=data.category_texts[ROOT];
if(!Array.isArray(rootRows))throw Error('Root prayer category not found. NO FILES MODIFIED.');
const retained=[];
for(const row of rootRows){
 const prayer=row?.text;
 const title=String(prayer?.title||'');
 const details=String(prayer?.description||'');
 const isCandidate=/иоанн.*кронштадт/i.test(title+' '+details);
 if(!isCandidate){retained.push(row);continue;}
 const body=canonical(prayer.translation||prayer.content||prayer.traditional_content||'');
 if(body.length>70 && importedBodies.has(body)){
  changes.push('Removed exact duplicate root listing (text kept): '+title+' ['+prayer.slug+']');
 }else{
  candidates.push({title,slug:prayer?.slug||'',reason:'Content not identical to an imported prayer'});
  retained.push(row);
 }
}
if(retained.length!==rootRows.length)data.category_texts[ROOT]=retained;
console.log('Ioann Kronstadt prayer audit:');
console.log('  Imported prayer slugs: '+linkedSlugs.size);
console.log('  Decorative separator edits: '+updated.size);
console.log('  Root exact duplicates removed from listing: '+(rootRows.length-retained.length));
if(candidates.length) {
 console.log('  Root prayers retained for editorial review (distinct or unmatched texts):');
 for(const item of candidates)console.log('    '+JSON.stringify(item));
}
for(const change of changes)console.log('  '+change);
if(!changes.length){console.log('PASS: nothing to clean. NO FILES MODIFIED.');process.exit(0)}
if(process.argv.includes('--dry-run')){
 console.log('DRY RUN PASS. NO FILES MODIFIED.');process.exit(0);
}
const hashSource={...data};
delete hashSource.schema_version;delete hashSource.content_version;delete hashSource.generated_at;
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'
 ?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
data.content_version=crypto.createHash('sha256').update(
 JSON.stringify(stable(hashSource)),'utf8').digest('hex');
data.generated_at=new Date().toISOString();
const pretty=/^\s*\{\s*\n/.test(raw);
let out=JSON.stringify(data,null,pretty?2:0)+'\n';
if(original.includes('\r\n'))out=out.replace(/\n/g,'\r\n');
const updatedContent=bom+out;
const backupDir=path.resolve(root,'..','build-backups',
 'ioann-prayer-clean-before-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backupDir,{recursive:true});
fs.copyFileSync(file,path.join(backupDir,'offlineContent.json'));
const temp=file+'.ioann-clean-tmp';
try {
 fs.writeFileSync(temp,updatedContent,'utf8');
 const verified=JSON.parse(fs.readFileSync(temp,'utf8').replace(/^\uFEFF/,''));
 if(!verified.category_texts[ROOT]||!verified.texts)throw Error('Post-write validation failed');
 fs.renameSync(temp,file);
}catch(error){try{fs.unlinkSync(temp)}catch{}throw error}
console.log('PASS: cleaned separators and safe root duplicates. Backup: '+backupDir);
console.log('Remember to rebuild the search index before release.');
