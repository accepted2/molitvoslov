#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const content = JSON.parse(fs.readFileSync(path.resolve(__dirname,'../src/data/offlineContent.json'),'utf8').replace(/^\uFEFF/,''));
const category = content.categories.find(item=>item.slug==='molitvy-ioanna-kronshtadtskogo');
const root = content.categories.find(item=>item.slug==='raznye-molitvy');
assert(root, 'Missing Misc Prayers category');
assert(category, 'Missing St John of Kronstadt subcategory');
assert.equal(Number(category.parent), Number(root.id), 'Nested under Misc Prayers');
const slugs = [
  'ioann-kronshtadtsky-blagodarenie-za-bozhii-milosti',
  'ioann-kronshtadtsky-blagodarenie-za-dary',
  'ioann-kronshtadtsky-molitva-ko-presvyatoi-troitse'
];
const rows = content.category_texts[category.slug];
assert(Array.isArray(rows), 'No prayer list for subcategory');
assert.equal(rows.filter(row=>slugs.includes(row?.text?.slug)).length,3, 'Need three prayer rows');
const titles = new Set(), ids = new Set();
for(const slug of slugs) {
  const text = content.texts[slug];
  const row = rows.find(item=>item?.text?.slug===slug);
  assert(text && row, 'Missing text or row: '+slug);
  assert.equal(text.id,row.text.id);
  assert(Number(text.id)>0, 'Reader route requires positive text IDs');
  assert.equal(text.language,'ru');
  assert(!text.content?.trim(), 'Do not invent an unsupported Church Slavonic version');
  assert(!text.traditional_content?.trim(), 'Do not invent a traditional version');
  assert(text.translation?.length > 200, 'Prayer must not be truncated');
  assert(text.translation.includes(slug.endsWith('troitse') ? 'О Троице' : slug.endsWith('dary') ? 'Благодарю Тя' : 'Господи!'));
  assert.equal(text.source_url,'https://azbyka.ru/molitvoslov/blagodarenie-za-vsyakoe-blagodeyanie-bozhie.html');
  assert(!titles.has(text.title) && !ids.has(text.id),'Duplicate title/id');
  titles.add(text.title); ids.add(text.id);
}
assert.equal(rows.filter(row=>slugs.includes(row?.text?.slug)).length,3);
console.log('PASS: three complete prayers, source attribution and unique IDs');
console.log('PASS: Misc Prayers -> St John of Kronstadt -> separate Reader slugs');
console.log('PASS: only attested Russian text, no invented Slavonic translation');
