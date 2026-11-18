#!/usr/bin/env node
'use strict';
// Reorganize St John of Kronstadt prayers in existing offlineContent.json.
// 1) Misc Prayers -> St John -> Gratitude + "My Life in Christ"
// 2) Root standalone St John prayers: unlink exact duplicates; move distinct
//    original CategoryText links into St John without changing Text ID or slug.
// 3) Preserve all other content, favorites and stable deep links.
//
// --dry-run prints a detailed audit without writing any file.
// Every modified file is backed up before an atomic replacement.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const appRoot = path.resolve(__dirname, '..');
const file = path.join(appRoot, 'src', 'data', 'offlineContent.json');
const raw = fs.readFileSync(file, 'utf8');
const bom = raw.startsWith('\uFEFF') ? '\uFEFF' : '';
const original = raw.slice(bom.length);
const data = JSON.parse(original);
const ROOT = 'raznye-molitvy';
const MAIN = 'ioann-kronshtadtsky-molitvy';
const GRATITUDE = 'molitvy-ioanna-kronshtadtskogo';
const VOLUMES = 'ioann-kronshtadtsky-moya-zhizn-vo-khriste';
const nested = [MAIN, GRATITUDE, VOLUMES];

if (!Array.isArray(data.categories) || !data.category_texts || !data.texts ||
    typeof data.category_texts !== 'object' || typeof data.texts !== 'object') {
  throw Error('Unexpected offline content schema; NO FILES MODIFIED.');
}
const categories = new Map(data.categories.map(c => [c.slug, c]));
for (const slug of [ROOT, ...nested]) {
  if (!categories.has(slug) || !Array.isArray(data.category_texts[slug])) {
    throw Error('Missing imported category or its prayers: '+slug+'. NO FILES MODIFIED.');
  }
}
const root = categories.get(ROOT), main = categories.get(MAIN),
      gratitude = categories.get(GRATITUDE), volumes = categories.get(VOLUMES);
if (!(Number(root.id) > 0) || !(Number(main.id) > 0) ||
    !(Number(gratitude.id) > 0) || !(Number(volumes.id) > 0)) {
  throw Error('Invalid category IDs. NO FILES MODIFIED.');
}
if (Number(main.parent) !== Number(root.id) ||
    Number(volumes.parent) !== Number(main.id) ||
    ![Number(root.id), Number(main.id)].includes(Number(gratitude.parent))) {
  throw Error('Unexpected parent hierarchy; NO FILES MODIFIED.');
}
if (data.category_texts[GRATITUDE].length < 3 ||
    data.category_texts[MAIN].length < 15 ||
    data.category_texts[VOLUMES].length < 3) {
  throw Error('Complete imported collections were not found; NO FILES MODIFIED.');
}

const trim = s => String(s || '').trim();
const cleanBody = s => trim(s).normalize('NFD')
  .replace(/[\u0300-\u036f\u0483-\u0489]/g,'')
  .toLowerCase().replace(/ё/g,'е')
  .replace(/[^а-яa-z0-9іїєґ]+/gi,' ').replace(/\s+/g,' ').trim();
const bestText = text => trim(text?.translation) || trim(text?.content) ||
  trim(text?.traditional_content) || '';
const titleKey = value => cleanBody(value);
const saint = /иоанн[а-я]*\s+(?:[^ ]+\s+){0,4}кронштадтск/i;
const isSaintPrayer = (text) => {
  const title = titleKey(text?.title || '');
  const description = titleKey(text?.description || '');
  return /(^|\s)молитв[а-я]*/.test(title) &&
    (saint.test(title) || saint.test(description));
};
const indexedById = new Map(Object.values(data.texts)
  .filter(t => Number(t?.id)>0).map(t => [Number(t.id), t]));
const resolved = row => {
  const slug = trim(row?.text?.slug);
  const bySlug = slug && data.texts[slug];
  return bySlug || indexedById.get(Number(row?.text?.id)) || null;
};

const reports = [];
const touched = new Map();
const mainRows = data.category_texts[MAIN];
const imported = [];
for(const slug of nested) {
  for(const row of data.category_texts[slug]) {
    const text = resolved(row);
    if (!text) throw Error('Broken row in '+slug+'. NO FILES MODIFIED.');
    const normalized = cleanBody(bestText(text));
    if (normalized.length >= 60) imported.push({slug, text, normalized});
  }
}
const moved = [];
const kept = [];
const existingMain = new Set(mainRows.map(row => Number(row?.text?.id)).filter(x=>x>0));
let nextOrder = Math.max(0,...mainRows.map(row=>Number(row?.order)||0))+10;
let matches = 0;
let changed = false;
for(const row of data.category_texts[ROOT]) {
  const text = resolved(row);
  if (!text || !isSaintPrayer(text)) {
    kept.push(row);
    continue;
  }
  const id = Number(text.id), slug = trim(text.slug);
  if (!(id>0) || !slug) throw Error('St John root prayer has no stable ID or slug; NO FILES MODIFIED.');
  const body = cleanBody(bestText(text));
  if (body.length < 30) throw Error('St John root prayer body is missing: '+slug+'. NO FILES MODIFIED.');
  const exact = imported.find(p => p.normalized === body && Number(p.text.id)!==id);
  const selfLinked = existingMain.has(id);
  if (exact || selfLinked) {
    matches += 1;
    reports.push({
      action: 'DUPLICATE_UNLINK_ROOT_ONLY',
      title: text.title,
      slug,
      matchedTitle: exact?.text.title || text.title,
      matchedCategory: exact?.slug || MAIN,
      textIdRetained: id,
    });
    changed = true;
  } else {
    // The original Text is reused. Do not create another prayer record.
    row.category = {...main};
    row.order = nextOrder;
    nextOrder += 10;
    mainRows.push(row);
    existingMain.add(id);
    moved.push(slug);
    reports.push({
      action:'MOVE_LINK_TO_IOANN',
      title:text.title,
      slug,
      textIdRetained:id,
      similarTitles:imported.filter(p => titleKey(p.text.title)===titleKey(text.title))
        .map(p=>p.text.slug).slice(0,6),
    });
    changed = true;
  }
  touched.set(slug, {id, move: !exact && !selfLinked});
}
if(kept.length !== data.category_texts[ROOT].length) data.category_texts[ROOT] = kept;
if(Number(gratitude.parent) !== Number(main.id)) {
  gratitude.parent = main.id;
  changed = true;
  reports.unshift({action:'NEST_CATEGORY',title:gratitude.name,under:main.name});
}

// Fix nested copies of category metadata embedded in the exported serializers.
const updateCategoryRecord = c =>
  Number(c?.id) === Number(gratitude.id) ? {...c,parent:main.id} : c;
for(const group of Object.values(data.category_texts)) {
  if(!Array.isArray(group)) continue;
  for(const row of group) {
    if(Number(row?.category?.id)===Number(gratitude.id)) row.category=updateCategoryRecord(row.category);
    const stored=row?.text;
    const indexed=stored && resolved(row);
    if(!stored || !indexed) continue;
    if(!Array.isArray(stored.categories)) continue;
    stored.categories=stored.categories.map(updateCategoryRecord);
  }
}
for(const text of Object.values(data.texts)) {
  if(Array.isArray(text?.categories))
    text.categories=text.categories.map(updateCategoryRecord);
}
for(const [slug, info] of touched) {
  const updateText = text => {
    if(!text || (trim(text.slug)!==slug && Number(text.id)!==info.id))return;
    const previous=Array.isArray(text.categories) ? text.categories : [];
    const nonRoot=previous.filter(c=>Number(c.id)!==Number(root.id));
    if(info.move && !nonRoot.some(c=>Number(c.id)===Number(main.id)))nonRoot.push({...main});
    text.categories=nonRoot;
  };
  updateText(data.texts[slug]);
  for(const rows of Object.values(data.category_texts)) {
    if(!Array.isArray(rows)) continue;
    for(const row of rows) updateText(row.text);
  }
}
console.log('REORGANIZE IOANN KRONSTADT — verified local catalog');
console.log('Root prayers examined: '+touched.size+
  '; exact duplicates unlinked: '+matches+'; original prayers moved: '+moved.length);
for(const item of reports)console.log('  '+JSON.stringify(item));
if(!changed) {
  console.log('PASS: required nested structure already installed. NO FILES MODIFIED.');
  process.exit(0);
}
const validate=() => {
  if(Number(gratitude.parent)!==Number(main.id))throw Error('Gratitude category still at root');
  const remaining=data.category_texts[ROOT].filter(row=>isSaintPrayer(resolved(row)));
  if(remaining.length)throw Error('St John prayers still appear at root');
  const allIds=Object.values(data.category_texts).flat().map(row=>Number(row?.id)).filter(Number.isFinite);
  if(new Set(allIds).size!==allIds.length)throw Error('Duplicate CategoryText IDs after reorganization');
  for(const slug of moved) {
    const text=data.texts[slug];
    if(!mainRows.some(row=>Number(row?.text?.id)===Number(text.id)))throw Error('Moved text not linked: '+slug);
  }
};
validate();
if(process.argv.includes('--dry-run')) {
  console.log('DRY RUN PASS: NO FILES MODIFIED.');
  process.exit(0);
}
const versionSource={...data};
delete versionSource.schema_version;
delete versionSource.content_version;
delete versionSource.generated_at;
const stable = item => Array.isArray(item) ? item.map(stable) :
  item && typeof item==='object' ?
    Object.fromEntries(Object.keys(item).sort().map(key=>[key,stable(item[key])])) : item;
data.content_version=crypto.createHash('sha256')
  .update(JSON.stringify(stable(versionSource)),'utf8').digest('hex');
data.generated_at=new Date().toISOString();
const pretty=/^\s*\{\s*\n/.test(original);
let serialized=JSON.stringify(data,null,pretty?2:0)+'\n';
if(raw.includes('\r\n'))serialized=serialized.replace(/\n/g,'\r\n');
const dir=path.resolve(appRoot,'..','build-backups','ioann-nested-before-'+
  new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(dir,{recursive:true});
fs.copyFileSync(file,path.join(dir,'offlineContent.json'));
const temporary=file+'.ioann-nested-tmp';
try {
  fs.writeFileSync(temporary,bom+serialized,'utf8');
  const check=JSON.parse(fs.readFileSync(temporary,'utf8').replace(/^\uFEFF/,''));
  if(Number(check.categories.find(c=>c.slug===GRATITUDE)?.parent)!==Number(main.id))
    throw Error('Final tree validation failed');
  fs.renameSync(temporary,file);
}catch(error) {
  try{fs.unlinkSync(temporary)}catch{}
  throw error;
}
console.log('PASS: gratitude nested; two root prayer candidates consolidated without deleting text.');
console.log('Backup: '+path.join(dir,'offlineContent.json'));
console.log('Next: synchronize Django before re-exporting offlineContent.json.');
