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
const allCards=shards.flatMap(x=>x.cards);
assert.equal(allCards.length,1267);
assert.equal(allCards.reduce((n,c)=>n+c.hymns.length,0),2821);
const catalogueById=new Map(allCards.map(card=>[card.card_id,card]));
assert.equal(catalogueById.size,allCards.length);

const repairGroups=new Map();
for(const row of manifest.entries){
  if(!repairGroups.has(row.card_id))repairGroups.set(row.card_id,[]);
  repairGroups.get(row.card_id).push(row);
}
assert.equal(repairGroups.size,122);
const kindName=kind=>kind==='tropar'?'troparion':
  kind==='kondak'?'kontakion':kind;
const normalizeText=value=>String(value||'').normalize('NFC')
  .replace(/[\u200b\u00ad\ufeff\u2060]/gu,'')
  .replace(/\r\n?/gu,'\n')
  .replace(/[ \t]+/gu,' ')
  .replace(/[ \t]*\n[ \t]*/gu,'\n')
  .trim();

let verifiedRepairs=0;
let rendered=0;
let extraVariants=0;
for(const [cardId,repairs] of repairGroups){
  const card=catalogueById.get(cardId);
  assert.ok(card,cardId+': canonical card missing');
  const payload=getCalendarCardHymns({card_id:cardId},'ru');
  assert.equal(payload.missing.length,0,cardId);
  const displayedByKey=new Map(payload.sections.map(field=>[field.key,field]));
  assert.equal(displayedByKey.size,payload.sections.length,
    cardId+': rendered variant keys must be unique');

  // The 210 repair groups (226 corrected variants) are a SUBSET of the full
  // 2,821-hymn catalogue. Do not delete an unaffected troparion because a
  // particular repair package only corrected the associated kontakion.
  assert.equal(payload.sections.length,card.hymns.length,
    cardId+': preserve all canonical variants, including unpatched hymns');
  for(const hymn of card.hymns){
    const key=kindName(hymn.kind)+':'+hymn.variant;
    const field=displayedByKey.get(key);
    assert.ok(field,cardId+': missing canonical variant '+key);
    assert.equal(normalizeText(field.text),normalizeText(hymn.content),
      cardId+': text changed for canonical variant '+key);
    assert.ok(!decoderModule.exports.looksLegacyUcs(field.text),
      cardId+': broken UCS text in '+key);
  }
  for(const repair of repairs){
    const key=kindName(repair.kind)+':'+repair.variant;
    const field=displayedByKey.get(key);
    assert.ok(field,cardId+': missing repaired variant '+key);
    assert.equal(normalizeText(field.text),normalizeText(repair.content),
      cardId+': repaired content mismatch in '+key);
    verifiedRepairs++;
  }
  extraVariants+=payload.sections.length-repairs.length;
  rendered+=payload.sections.length;
}
assert.equal(verifiedRepairs,226);
assert.equal(extraVariants,32,
  '32 independent source hymns are not part of the 210 repair groups');
assert.equal(rendered,258);
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
console.log('PASS: 210 repair groups / 226 verified repairs + 32 other hymns preserved across 122 cards ('+rendered+' rendered); 2821 civil hymns on 1267 cards, title identity and extra hymns.');
