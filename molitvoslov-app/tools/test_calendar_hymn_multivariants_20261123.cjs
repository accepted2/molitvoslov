#!/usr/bin/env node
'use strict';
// Read-only integration regression: multiple different hymn variants must
// appear as separate sections, with independent headings, readable characters,
// and original source text preserved in the catalogue.
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const root=path.resolve(__dirname,'..');
const {decoder,presenter}=
  require('./lib/loadCalendarPresentationForNode.cjs')
    .loadCalendarPresentationForNode(root);
const cards=Array.from({length:8},(_,index)=>
  require('../src/data/calendar/uocAllCivilHymns'+index+'.json'))
  .flatMap(shard=>shard.cards);
const byId=new Map(cards.map(card=>[card.card_id,card]));
const get=cardId=>presenter.getCalendarCardHymns({card_id:cardId},'ru');
const badReplacement=/\uFFFD/u;
const mixedLatin=/[А-Яа-яЁёІіЇїЄєҐґ]+[A-Za-z][А-Яа-яЁёІіЇїЄєҐґ]*|[A-Za-z]+[А-Яа-яЁёІіЇїЄєҐґ]+/u;
const brokenDigit=/[А-Яа-яЁё][0-9][А-Яа-яЁё]/u;
const textCheck=(text,cardId,field)=>{
  assert.ok(typeof text==='string'&&text.trim(),cardId+': empty '+field);
  assert.ok(!decoder.looksLegacyUcs(text),cardId+': UCS-8 fragment in '+field);
  assert.ok(!badReplacement.test(text),cardId+': Unicode replacement character in '+field);
  assert.ok(!mixedLatin.test(text),cardId+': Latin lookalike embedded in Cyrillic '+field);
  assert.ok(!brokenDigit.test(text),cardId+': digit embedded in Cyrillic '+field);
};

assert.equal(cards.length,1267);
assert.equal(byId.size,cards.length,'Every canonical card requires a unique ID');
let rendered=0,multiSource=0,multiDistinct=0,missing=0,sourceCount=0;
for(const card of cards){
  const output=get(card.card_id);
  sourceCount+=card.hymns.length;
  rendered+=output.sections.length;
  missing+=output.missing.length;
  const sourceCivils=card.hymns.filter(h=>h.language!=='uk');
  const kinds=['tropar','kondak'];
  if(kinds.some(kind=>sourceCivils.filter(h=>h.kind===kind).length>1))multiSource++;
  if(kinds.some(kind=>new Set(sourceCivils.filter(h=>h.kind===kind)
    .map(h=>h.content.normalize('NFC'))).size>1))multiDistinct++;
  for(const entry of card.hymns){
    textCheck(entry.content,card.card_id,entry.kind+':'+entry.variant);
    if(entry.heading)textCheck(entry.heading,card.card_id,'heading '+entry.kind);
  }
  const displayedKeys=new Set();
  let previous=-1;
  for(const section of output.sections){
    textCheck(section.text,card.card_id,'rendered '+section.key);
    if(section.subtitle)textCheck(section.subtitle,card.card_id,'subtitle '+section.key);
    assert.ok(!displayedKeys.has(section.key),card.card_id+': duplicate rendered variant key');
    displayedKeys.add(section.key);
    const priority=(section.kind==='troparion'?0:100)+section.variant;
    assert.ok(priority>=previous,card.card_id+': variants rendered out of order');
    previous=priority;
  }
}
assert.equal(sourceCount,2821);
assert.equal(rendered,2815,'Expected 4 Ukrainian language duplicates + 2 identical repeated hymns hidden');
assert.equal(missing,0,'No canonical card may fail text conversion');
assert.equal(multiSource,256,'Multi-row source counts changed');
assert.equal(multiDistinct,254,'Two cards have identical, not independent, alternative texts');

// Exact rich examples for manual Android testing:
const examples=[
  {
    id:'blv-a7a1c9ec56f5cf1aa27deda7',
    title:'Свт. Нектария Эгинского',
    expected:['Тропарь','Иной тропарь','Кондак','Иной кондак'],
  },
  {
    id:'blv-01c20f48d726643027c330eb',
    title:'Прп. Евфросинии Полоцкой',
    expected:['Тропарь','Иной тропарь','Кондак','Иной кондак','Иной кондак 3'],
  },
  {
    id:'blv-8e63eb9f08ac6e59b7798674',
    title:'Сщмч. Харалампия',
    expected:[
      'Тропарь','Иной тропарь','Иной тропарь 3','Иной тропарь 4',
      'Кондак','Иной кондак',
    ],
  },
];
for(const x of examples){
  const card=byId.get(x.id);
  assert.ok(card,x.title+': missing canonical card');
  const out=get(x.id);
  assert.deepEqual(Array.from(out.sections,s=>s.title),x.expected,x.title);
  for(const s of out.sections){
    const kind=s.kind==='troparion'?'tropar':'kondak';
    const source=card.hymns.find(h=>
      h.kind===kind&&h.variant===s.variant&&h.language!=='uk');
    assert.ok(source,x.title+': missing source for '+s.key);
    assert.equal(s.text,source.content,x.title+': source text truncated or modified');
    assert.equal(s.subtitle,source.heading,x.title+': independent glas/heading lost');
  }
}
// Real 2026 bundled OLD source ID: five hymns on the saint-detail screen.
const june=require('../src/data/calendar/2026-06.json');
const feast=june.days['2026-06-05'].ru.all_feasts
  .find(x=>x.source_id===3797);
assert.ok(feast,'Old Euphrosyne of Polotsk source card not found');
const legacyOutput=presenter.getCalendarCardHymns(feast,'ru');
assert.deepEqual(Array.from(legacyOutput.sections,s=>s.title),
  examples[1].expected,'Legacy calendar must render all 5 independent hymns');
const legacyCanonical=byId.get(examples[1].id);
for(const section of legacyOutput.sections){
  const source=legacyCanonical.hymns.find(row=>
    row.kind===(section.kind==='troparion'?'tropar':'kondak')
    && row.variant===section.variant && row.language!=='uk');
  assert.ok(source,'Missing independent source record for '+section.key);
  assert.equal(section.text,source.content,'Legacy card did not select corrected hymn text');
  assert.equal(section.subtitle,source.heading,'Legacy card lost the glas or title');
  assert.equal(section.origin,'canonical_catalogue',
    'Stale legacy text unexpectedly overrides audited catalogue');
}
const handwritten=presenter.getCalendarCardHymns({
  ...feast,
  troparion_content:'Ручная правка тропаря',
  protected_hymn_fields:['troparion_content'],
},'ru');
assert.equal(handwritten.sections.find(s=>s.key==='troparion:1').text,
  'Ручная правка тропаря','Protected manual edits must remain top priority');
assert.equal(presenter.getCalendarCardHymns({
  source_id:3797,title:'Преподобная Евфросиния Суздальская',
},'ru').sections.length,0,
'Source ID match alone must never borrow another saint’s hymns');
// Check the screens actually use the same hymn pipeline and distinct styling.
for(const [name,call] of [
  ['SaintDetailScreen.js','isHymn'],
  ['ChurchCalendarScreen.js','isHymn'],
]){
  const text=fs.readFileSync(path.join(root,'src/screens',name),'utf8');
  assert.ok(text.includes('cardHymns.sections.map'),name+': hymn list not rendered');
  assert.ok(text.includes(call),name+': hymn-specific layout absent');
}
console.log('PASS: 1267 cards / 2821 sources / 2815 visible sections; '+
  '256 multi-row cards, 254 with distinct variants; all headings and text readable.');
console.log('PASS: Nektarios 4, Euphrosyne 5 (including 2026-06-05 legacy card), Charalambos 6; independent titles, glases and text.');
