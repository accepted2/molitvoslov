#!/usr/bin/env node
'use strict';
// Keep the next Azbyka/Django imports from re-adding the grateful prayer to
// the main St John category. Patch only known anchors, after previous
// nested-category importer patch has been applied.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const specs=[
 {relative:'tools/import_ioann_kronshtadtsky_collections_20261118.py',
  required:['gratitude = category(GRATITUDE_SLUG, GRATITUDE_NAME, main_category["id"], 10)'],
  steps:[
   {old:'        add_prayer(slug, label, prayer["text"], main_category, (i+1) * 10, SECOND_URL)',
    now:'        add_prayer(slug, label, prayer["text"], gratitude if i == 0 else main_category, (i+1) * 10, SECOND_URL)'},
   {old:'    assert len(all_rows[GRATITUDE_SLUG]) >= 3',
    now:'    assert len(all_rows[GRATITUDE_SLUG]) >= 4'},
   {old:'               for r in all_rows[MAIN_SLUG]) == 15',
    now:'               for r in all_rows[MAIN_SLUG]) == 14'},
  ]},
 {relative:'../molitvoslov-backend/api/management/commands/import_ioann_kronstadt_collections.py',
  required:['    "ioann-kronshtadtsky-molitvy",\n    "molitvy-ioanna-kronshtadtskogo",',
   'parent_slug = MISC if slug == CATEGORIES[0] else CATEGORIES[0]'],
  steps:[
   {old:'for slug, count in zip(CATEGORIES, (15, 3, 3)):',
    now:'for slug, count in zip(CATEGORIES, (14, 4, 3)):'},
   {old:'                        if not text_slug.startswith(expected_prefixes[slug]):',
    now:'                        if not (text_slug.startswith(expected_prefixes[slug]) or\n' +
      '                                (slug == CATEGORIES[1] and text_slug == "ioann-kronstadt-azbyka-prayer-01")):'},
  ]},
];
const changes=[];
for(const spec of specs){
 const file=path.resolve(root,spec.relative);
 const original=fs.readFileSync(file,'utf8'),bom=original.startsWith('\uFEFF')?'\uFEFF':'';
 let result=original.slice(bom.length).replace(/\r\n/g,'\n');
 for(const item of spec.required){
  if(!result.includes(item))throw Error(spec.relative+': old hierarchy not patched. Run apply_ioann_nested_future_importers first. NO FILES MODIFIED.');
 }
 for(const [i,item] of spec.steps.entries()){
  const old=result.split(item.old).length-1,done=result.split(item.now).length-1;
  if(old===1&&done===0)result=result.replace(item.old,item.now);
  else if(old===0&&done===1)continue;
  else throw Error(spec.relative+': unexpected importer near step '+(i+1)+'. NO FILES MODIFIED.');
 }
 let after=bom+result;
 if(original.includes('\r\n'))after=after.replace(/\n/g,'\r\n');
 if(after!==original)changes.push({file,short:spec.relative,before:original,after});
}
if(process.argv.includes('--dry-run')){
 console.log('DRY RUN PASS: '+changes.length+' future importers ready; NO FILES MODIFIED.');
 process.exit(0);
}
if(!changes.length){console.log('PASS: future importers already put this prayer in gratitude.');process.exit(0);}
const dir=path.resolve(root,'..','build-backups','gratitude-future-importers-before-'+
  new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(dir,{recursive:true});
for(const e of changes)fs.copyFileSync(e.file,path.join(dir,e.short.replace(/[\\/]/g,'__').replace(/\.\./g,'UP')));
const written=[];
try{for(const e of changes){fs.writeFileSync(e.file,e.after,'utf8');written.push(e);}}
catch(error){for(const e of written)fs.writeFileSync(e.file,e.before,'utf8');throw error;}
console.log('PASS: future Python and Django imports keep the grateful prayer in gratitude.');
console.log('Backup: '+dir);
