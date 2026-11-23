#!/usr/bin/env node
'use strict';
// Pure Node verification; does not require Metro, Android or backend access.
// The test executes the same pure ES-module logic used in RN via vm, replacing
// only ES export/import wrappers. The 210 UTF-8 JSON is loaded from Git.
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const {loadCalendarPresentationForNode}=require('./lib/loadCalendarPresentationForNode.cjs');
const {decoder,presenter}=loadCalendarPresentationForNode(root);
const decoderModule={exports:decoder};
const {getCalendarCardHymns,uniqueCalendarCards}=presenter;
const manifest=require('../src/data/calendar/uocCivicHymns210.json');
const shards=Array.from({length:8},(_,i)=>
  require('../src/data/calendar/uocAllCivilHymns'+i+'.json'));
assert.equal(manifest.entries.length,226);
assert.equal(new Set(manifest.entries.map(x=>x.card_id+'|'+x.kind+'|'+x.source_variant)).size,210);
assert.equal(new Set(manifest.entries.map(x=>x.card_id)).size,122);
let rendered=0;
for(const card of new Set(manifest.entries.map(x=>x.card_id))){
  const payload=getCalendarCardHymns({card_id:card},'ru');
  assert.equal(payload.missing.length,0,card);
  assert.equal(payload.sections.length,
    manifest.entries.filter(x=>x.card_id===card).length,card);
  rendered+=payload.sections.length;
  for(const field of payload.sections){
    assert.ok(field.text.trim());
    assert.ok(!decoderModule.exports.looksLegacyUcs(field.text),field.key);
  }
}
assert.equal(rendered,226);
const allCards=shards.flatMap(x=>x.cards);
assert.equal(allCards.length,1267);
assert.equal(allCards.reduce((n,c)=>n+c.hymns.length,0),2821);
const pp=allCards.find(x=>x.card_id==='blv-ca7f2ce407c66cc45b803749');
assert.ok(pp);
const feastWithNoCardId=getCalendarCardHymns({title:pp.title_ru},'ru');
assert.deepEqual(Array.from(feastWithNoCardId.sections,x=>x.title),
  ['Тропарь','Кондак']);
assert.ok(feastWithNoCardId.sections.every(x=>x.origin==='canonical_catalogue'));

const combined=getCalendarCardHymns({
 hymns:[{kind:'tropar',variant:1,language:'civil',
         content:'Основной тропарь\nИной тропарь\nВторой тропарь'}],
},'ru');
assert.equal(combined.sections.length,2);
assert.equal(combined.sections[0].title,'Тропарь');
assert.equal(combined.sections[1].title,'Иной тропарь');
const fallback=getCalendarCardHymns({
  troparion_content:'Д0бръ совётникъ ћвльсz бlжeнному',
},'ru');
assert.ok(fallback.sections.length>0);
const duplicates=uniqueCalendarCards([
  {id:1,title:'Апостолы Петр и Павел'},
  {id:2,title:'Апостолы Петр и Павел'},
  {id:3,title:'Святитель Николай'}
]);
assert.equal(duplicates.length,2);
console.log('PASS: 210 repairs, 226 independent variants + 2821 civil hymns on 1267 cards, title identity and extra hymns.');
