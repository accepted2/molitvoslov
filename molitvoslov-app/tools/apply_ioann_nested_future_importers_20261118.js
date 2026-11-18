#!/usr/bin/env node
'use strict';
// Patch future Python/Django importers only at known exact anchors.
// Apply after reorganize_ioann_kronstadt_catalog_20261118.js.
// All files verified before any modification; existing changes preserved.
const fs=require('node:fs'),path=require('node:path');
const appRoot=path.resolve(__dirname,'..');
const specs=[{"file":"tools/import_ioann_kronshtadtsky_collections_20261118.py","replacements":[{"old":"    gratitude = category(GRATITUDE_SLUG, GRATITUDE_NAME, parent[\"id\"], 10)\n    main_category = category(MAIN_SLUG, MAIN_NAME, parent[\"id\"], 20)\n    volumes_category = category(VOLUME_SLUG, VOLUME_NAME, main_category[\"id\"], 10)","now":"    main_category = category(MAIN_SLUG, MAIN_NAME, parent[\"id\"], 20)\n    gratitude = category(GRATITUDE_SLUG, GRATITUDE_NAME, main_category[\"id\"], 10)\n    volumes_category = category(VOLUME_SLUG, VOLUME_NAME, main_category[\"id\"], 10)"}]},{"file":"../molitvoslov-backend/api/management/commands/import_ioann_kronstadt_collections.py","replacements":[{"old":"CATEGORIES = [\n    \"molitvy-ioanna-kronshtadtskogo\",\n    \"ioann-kronshtadtsky-molitvy\",\n    \"ioann-kronshtadtsky-moya-zhizn-vo-khriste\",\n]","now":"CATEGORIES = [\n    \"ioann-kronshtadtsky-molitvy\",\n    \"molitvy-ioanna-kronshtadtskogo\",\n    \"ioann-kronshtadtsky-moya-zhizn-vo-khriste\",\n]"},{"old":"for slug, count in zip(CATEGORIES, (3, 15, 3)):","now":"for slug, count in zip(CATEGORIES, (15, 3, 3)):"},{"old":"                    parent_slug = MISC if slug != CATEGORIES[2] else CATEGORIES[1]\n                    parent_obj = parent if parent_slug == MISC else imported[parent_slug]","now":"                    parent_slug = MISC if slug == CATEGORIES[0] else CATEGORIES[0]\n                    parent_obj = parent if parent_slug == MISC else imported[parent_slug]"},{"old":"                        if entry.parent_id != parent_obj.id:\n                            raise CommandError(\"Existing category belongs to another parent: \" + slug)","now":"                        if entry.parent_id != parent_obj.id:\n                            if slug == CATEGORIES[1] and entry.parent_id == parent.id:\n                                entry.parent = parent_obj\n                                entry.save(update_fields=[\"parent\"])\n                            else:\n                                raise CommandError(\"Existing category belongs to another parent: \" + slug)"},{"old":"                    expected_prefixes = {\n                        CATEGORIES[0]: \"ioann-kronshtadtsky-\",\n                        CATEGORIES[1]: \"ioann-kronstadt-azbyka-prayer-\",\n                        CATEGORIES[2]: \"ioann-kronstadt-moya-zhizn-tom-\",\n                    }","now":"                    expected_prefixes = {\n                        CATEGORIES[0]: \"ioann-kronstadt-azbyka-prayer-\",\n                        CATEGORIES[1]: \"ioann-kronshtadtsky-\",\n                        CATEGORIES[2]: \"ioann-kronstadt-moya-zhizn-tom-\",\n                    }"}]}];
const pending=[];
for(const spec of specs){
 const file=path.resolve(appRoot,spec.file);
 if(!fs.existsSync(file))throw Error('Missing importer: '+file+'. NO FILES MODIFIED');
 const before=fs.readFileSync(file,'utf8'),bom=before.startsWith('\uFEFF')?'\uFEFF':'';
 let output=before.slice(bom.length).replace(/\r\n/g,'\n');
 for(let i=0;i<spec.replacements.length;i++){
  const {old,now}=spec.replacements[i],oldN=output.split(old).length-1,newN=output.split(now).length-1;
  if(oldN===1&&newN===0)output=output.replace(old,now);
  else if(oldN===0&&newN===1)continue;
  else throw Error('Importer '+spec.file+' patch '+(i+1)+' differs. NO FILES MODIFIED.');
 }
 let after=bom+output;
 if(before.includes('\r\n'))after=after.replace(/\n/g,'\r\n');
 if(before!==after)pending.push({file,short:spec.file,before,after});
}
if(process.argv.includes('--dry-run')){
 console.log('DRY RUN PASS. NO FILES MODIFIED. Future imports updated: '+pending.length);process.exit(0);
}
if(!pending.length){console.log('PASS: future importers already use the nested hierarchy.');process.exit(0)}
const dir=path.resolve(appRoot,'..','build-backups',
 'ioann-future-import-before-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(dir,{recursive:true});
for(const p of pending)fs.copyFileSync(p.file,path.join(dir,p.short.replace(/[\\/]/g,'__').replace(/\.\./g,'UP')));
const written=[];
try{for(const p of pending){fs.writeFileSync(p.file,p.after,'utf8');written.push(p)}}
catch(e){for(const p of written)fs.writeFileSync(p.file,p.before,'utf8');throw e}
console.log('PASS: Python and Django future importers retain nested St John prayer structure.');
console.log('Backup: '+dir);
