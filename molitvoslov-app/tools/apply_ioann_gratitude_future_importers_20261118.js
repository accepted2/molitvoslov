#!/usr/bin/env node
'use strict';
// Prevent the original grateful prayer from being re-added to the main list,
// and avoid duplicate links if its complete text exists in gratitude already.
// Requires the prior nested-category importer patch.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const specs=[
 {relative:'tools/import_ioann_kronshtadtsky_collections_20261118.py',
  required:['gratitude = category(GRATITUDE_SLUG, GRATITUDE_NAME, main_category["id"], 10)'],
  steps:[
   {old:'        add_prayer(slug, label, prayer["text"], main_category, (i+1) * 10, SECOND_URL)',
    now:[
     '        # An identical gratitude prayer does not need a second category entry.',
     '        if i == 0 and any(',
     '            row["text"]["slug"] != slug and',
     '            title_key(row["text"].get("translation", "")) == title_key(prayer["text"])',
     '            for row in all_rows[GRATITUDE_SLUG]',
     '        ):',
     '            continue',
     '        add_prayer(slug, label, prayer["text"], gratitude if i == 0 else main_category, (i+1) * 10, SECOND_URL)',
    ].join('\n')},
   {old:'               for r in all_rows[MAIN_SLUG]) == 15',
    now:'               for r in all_rows[MAIN_SLUG]) == 14'},
  ]},
 {relative:'../molitvoslov-backend/api/management/commands/import_ioann_kronstadt_collections.py',
  required:['    "ioann-kronshtadtsky-molitvy",\n    "molitvy-ioanna-kronshtadtskogo",',
    'parent_slug = MISC if slug == CATEGORIES[0] else CATEGORIES[0]'],
  steps:[
   {old:'import json',now:'import json\nimport re\nimport unicodedata'},
   {old:'for slug, count in zip(CATEGORIES, (15, 3, 3)):',
    now:'for slug, count in zip(CATEGORIES, (14, 3, 3)):'},
   {old:'                        if not text_slug.startswith(expected_prefixes[slug]):',
    now:[
     '                        if not (text_slug.startswith(expected_prefixes[slug]) or',
     '                                (slug == CATEGORIES[1] and text_slug == "ioann-kronstadt-azbyka-prayer-01")):',
    ].join('\n')},
   {old:'                        prayer = Text.objects.filter(slug=text_slug).first()',
    now:[
     '                        if slug == CATEGORIES[1] and text_slug == "ioann-kronstadt-azbyka-prayer-01":',
     '                            def normalized(value):',
     '                                value = unicodedata.normalize("NFD", str(value or "").lower())',
     '                                value = "".join(ch for ch in value if unicodedata.category(ch) != "Mn")',
     '                                return re.sub(r"\\s+", " ", re.sub(r"[^а-яa-z0-9іїєґ]+", " ", value.replace("ё", "е"))).strip()',
     '                            previous_gratitude = CategoryText.objects.filter(category=entry).select_related("text")',
     '                            if any(other.text.slug != text_slug and normalized(other.text.translation or other.text.content or other.text.traditional_content) == normalized(body) for other in previous_gratitude):',
     '                                continue',
     '                        prayer = Text.objects.filter(slug=text_slug).first()',
    ].join('\n')},
  ]},
];
const changes=[];
for(const spec of specs){
 const file=path.resolve(root,spec.relative);
 const raw=fs.readFileSync(file,'utf8'),bom=raw.startsWith('\uFEFF')?'\uFEFF':'';
 let source=raw.slice(bom.length).replace(/\r\n/g,'\n');
 for(const item of spec.required){
  if(!source.includes(item))throw Error(spec.relative+': nested importer layout not installed. Run apply_ioann_nested_future_importers_20261118.js first. NO FILES MODIFIED.');
 }
 for(const [i,p] of spec.steps.entries()){
  const oldCount=source.split(p.old).length-1,doneCount=source.split(p.now).length-1;
  if(oldCount===1&&doneCount===0)source=source.replace(p.old,p.now);
  else if(doneCount===1&&(oldCount===0||p.now.includes(p.old)))continue;
  else throw Error(spec.relative+': importer code differs at step '+(i+1)+'. NO FILES MODIFIED.');
 }
 let after=bom+source;
 if(raw.includes('\r\n'))after=after.replace(/\n/g,'\r\n');
 if(after!==raw)changes.push({file,short:spec.relative,before:raw,after});
}
if(process.argv.includes('--dry-run')){
 console.log('DRY RUN PASS: '+changes.length+' importer updates; NO FILES MODIFIED.');
 process.exit(0);
}
if(!changes.length){console.log('PASS: both importers already keep grateful prayer properly nested.');process.exit(0);}
const dir=path.resolve(root,'..','build-backups','gratitude-future-importers-before-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(dir,{recursive:true});
for(const p of changes)fs.copyFileSync(p.file,path.join(dir,p.short.replace(/[\\/]/g,'__').replace(/\.\./g,'UP')));
const written=[];
try{for(const p of changes){fs.writeFileSync(p.file,p.after,'utf8');written.push(p);}}
catch(error){for(const p of written)fs.writeFileSync(p.file,p.before,'utf8');throw error;}
console.log('PASS: future Azbyka and Django imports preserve the nested grateful prayer.');
console.log('Backup: '+dir);
