#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const {prepareCard,unicodeCS}=require('./lib/calendarHymnVariants20261123.cjs');
const {looksLegacyUcs}=require('./lib/calendarUcs8Decode20261123.cjs');
const original={
  title:'Святитель Нектарий Эгинский',
  troparion_title:'Тропaрь, глaсъ №.\n\nПод0бенъ: Пустhнный жи1тель:',
  troparion_content:'Сили1вріи џтрасль и3 є3гjны храни1телz.\n\nИ$нъ тропaрь, глaсъ д7.\n\nПод0бенъ: Ск0рw предвари2:\n\nПрпdбнэ пожи1лъ є3си2 ћкw с™и1тель мydрый.',
  kontakion_title:'Кондaкъ, глaсъ }.\n\nПод0бенъ: Взбрaнной воев0дэ:',
  kontakion_content:'Правослaвіz ѕвэздY новосвётлую.\n\nИ$нъ кондaкъ, глaсъ в7:\n\nБжcтвенный гр0мъ, трубA дух0внаz.',
  life_content:'Родился Анастасиос Кефалас.',
};
const first=prepareCard(original);
assert.deepEqual(first.issues,[]);
assert.ok(first.changed>0);
assert.equal(original.troparion_alt_content,undefined,'Do not modify original');
const x=first.card;
for(const key of ['troparion_content','troparion_alt_content','kontakion_content','kontakion_alt_content'])
  assert.ok(x[key] && x[key].length>10,'missing hymn: '+key);
assert.ok(x.troparion_alt_title.includes('тропа́рь'));
assert.ok(x.kontakion_alt_title.includes('конда́къ'));
assert.ok(x.troparion_content.includes('Сили́врі'));
assert.ok(x.troparion_alt_content.includes('Прпⷣбнѣ'));
assert.ok(x.kontakion_alt_content.includes('Бжⷭ҇твенный'));
assert.ok(x.troparion_alt_content.includes('Подо́бенъ'));
assert.equal(x.life_content,original.life_content);
assert.equal(x.troparion_script,'csl');
assert.equal(x.kontakion_script,'csl');
assert.equal(x.troparion_alt_script,'csl');
assert.equal(x.kontakion_alt_script,'csl');
assert.equal(prepareCard(x).changed,0,'idempotence');
assert.deepEqual(prepareCard(x).issues,[]);
const plain='Преподо́бнически пожи́в, я́ко му́дрый иера́рх';
const civil=prepareCard({troparion_content:plain});
assert.equal(civil.card.troparion_content,plain,'do not rewrite existing civil field');
assert.equal(unicodeCS('Бжcтвенный гр0мъ'),'Бжⷭ҇твенный гро́мъ');
assert.equal(looksLegacyUcs('Тропaрь, глaсъ №.'),true);
console.log('PASS: old UCS8 replaced with Unicode Church Slavonic for Ponomar');
console.log('PASS: all four hymns separate, original/alt titles distinct');
console.log('PASS: civil originals, hagiography, source input remain unchanged');
console.log('PASS: idempotent normalization, no data deletion');
