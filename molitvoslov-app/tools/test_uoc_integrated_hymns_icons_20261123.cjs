#!/usr/bin/env node
'use strict';
// Run with: node tools/test_uoc_integrated_hymns_icons_20261123.cjs
// No network, database writes or Android environment.
const assert=require('node:assert/strict');
const path=require('node:path');
const {loadCalendarPresentationForNode}=require('./lib/loadCalendarPresentationForNode.cjs');
const root=path.resolve(__dirname,'..');
const {decoder,icons,presenter}=loadCalendarPresentationForNode(root);
assert.equal(icons.safeIconCandidateCount,2734);
const iconShards=Array.from({length:12},(_,i)=>
  require(path.join(root,'src/data/calendar/uocIconCandidates'+i+'.json')));
const allIcons=iconShards.flatMap(s=>s.items);
assert.equal(allIcons.length,2734);
assert.equal(new Set(allIcons.map(x=>x[3])).size,2734);
const quarantine=[0,1].flatMap(i=>
  require(path.join(root,'src/data/calendar/uocIconQuarantine'+i+'.json')).items);
assert.equal(quarantine.length,598);
const suspect=quarantine[0];
assert.equal(icons.selectUocIcon({
  card_id:suspect[0],
  icon_url:'https://blagovist.info/wp-content/uploads/unverified.jpg',
}), '');
const first=allIcons[0];
assert.equal(icons.selectUocIcon({card_id:first[0]}),first[3]);
assert.equal(icons.selectUocIcon({title_ru:first[1]}),first[3]);
assert.equal(icons.selectUocIcon({card_id:first[0],icon_url:'https://example.org/editor.jpg',icon_is_manual:true}),
  'https://example.org/editor.jpg');
assert.equal(icons.selectUocIcon({card_id:'blv-unknown',title_ru:first[1],icon_url:''}),'');
assert.equal(icons.selectUocIcon({
  card_id:'blv-unknown',
  icon_url:'https://blagovist.info/wp-content/uploads/old-unverified.jpg',
}), '', 'Old source icon must not bypass the curated icon whitelist');
assert.equal(icons.selectUocIcon({
  card_id:'blv-unknown',icon_url:'https://molitvoslov.example/legacy-library.jpg',
}), 'https://molitvoslov.example/legacy-library.jpg',
'Unrelated existing image libraries must not be discarded');
assert.equal(icons.selectUocIcon({
  card_id:'blv-unknown',
  icon_url:'https://blagovist.info/wp-content/uploads/manually-selected.jpg',
  icon_is_manual:true,
}), 'https://blagovist.info/wp-content/uploads/manually-selected.jpg',
'Administrator icon selection must win');

assert.ok(icons.selectUocIcon({
  title_ru:'Славных и всехвальных первоверховных апостолов Петра и Павла'
}).endsWith('/Slavni-i-vsekhvalni-pervoverkhovni-apostoly-Petro-i-Pavlo_8.png'));
assert.ok(icons.selectUocIcon({
  title_ru:'Святитель Николай, архиепископ Мирликийский, чудотворец'
}).includes('Sviatytel-Mykolay-arkhiiepyskop'));
const nicholas=[
 {card_id:'blv-839dc39617bdf40503d594dd',
  title_ru:'Святителя Николая, архиеп. Мир Ликийских, чудотворца (около 345)'},
 {card_id:'blv-72fd8ac45d16938f68eb7306',
  title_ru:'Святитель Николай, архиепископ Мир Ликийских, чудотворец'}
];
assert.equal(presenter.uniqueCalendarCards(nicholas).length,1);
const allCivil=Array.from({length:8},(_,i)=>
  require(path.join(root,'src/data/calendar/uocAllCivilHymns'+i+'.json')))
  .flatMap(shard=>shard.cards);
assert.equal(allCivil.length,1267);
const hymnCount=allCivil.reduce((sum,card)=>sum+card.hymns.length,0);
assert.equal(hymnCount,2821);
const patches=require('../src/data/calendar/uocCivicHymns210.json').entries;
assert.equal(patches.length,226);
let tested=0;
for(const card of allCivil){
  const result=presenter.getCalendarCardHymns({card_id:card.card_id,title_ru:card.title_ru},'ru');
  assert.ok(result.sections.length>0,card.card_id);
  for(const part of result.sections){
    assert.ok(part.text.trim());
    assert.ok(!decoder.looksLegacyUcs(part.text),card.card_id+':'+part.key);
    tested++;
  }
}
const alt=presenter.getCalendarCardHymns({
  title_ru:'Тестовая память',
  troparion_content:'Гражданский основной тропарь',
  troparion_alternate_content:'Гражданский иной тропарь',
  troparion_alternate_script:'civil',
  kontakion_content:'Гражданский основной кондак',
  kontakion_alternate_content:'Гражданский иной кондак',
},'ru');
assert.equal(JSON.stringify(Array.from(alt.sections,x=>x.title)),
  JSON.stringify(['Тропарь','Иной тропарь','Кондак','Иной кондак']));
const blank=presenter.getCalendarCardHymns({
  title_ru:allCivil[0].title_ru,card_id:allCivil[0].card_id,
  troparion_content:'',protected_hymn_fields:['troparion_content'],
},'ru');
assert.ok(blank.sections.every(h=>h.kind!=='troparion'||h.variant!==1));
const realOldCalendarPeterPaul=presenter.getCalendarCardHymns({
  id:1593,
  source_id:3069,
  title:'Святых славных и всехвальных и первоверховных апостолов Петра и Павла',
  icon_url:'',
},'ru');
assert.equal(realOldCalendarPeterPaul.sections.length,2,
  'Old July calendar must resolve approved Peter/Paul feast alias');
assert.ok(realOldCalendarPeterPaul.sections.every(
  section=>section.origin==='canonical_catalogue'));
assert.equal(icons.selectUocIcon({
  id:1593,
  source_id:3069,
  title:'Святых славных и всехвальных и первоверховных апостолов Петра и Павла',
}).includes('Slavni-i-vsekhvalni-pervoverkhovni-apostoly'),true);
// In the 2025-2027 release-only calendar source IDs are canonical blv-* keys.
const november = require('../src/data/calendar/2026-11.json');
const nektarios = november.days['2026-11-22'].ru.main_feast;
assert.equal(nektarios.source_id,'blv-a7a1c9ec56f5cf1aa27deda7');
const nektariosHymns = presenter.getCalendarCardHymns(nektarios,'ru');
assert.equal(nektariosHymns.sections.length,4,
  'Nektarios must show both troparia and both kontakia from the checked catalogue');
// The day of the Synaxis includes the distinct canonical Michael icon/card.
const archangels = november.days['2026-11-21'].ru.all_feasts;
const michael = archangels.find(f => f.source_id==='blv-e800801bc36780be611d8945');
assert.ok(michael,'Canonical Synaxis of Archangel Michael card is missing');
assert.ok(presenter.getCalendarCardHymns(michael,'ru').sections.length >= 1);
const homonymGuard = presenter.getCalendarCardHymns({
  source_id:3301,title:'Преподобный Онисифор Печерский',
},'ru');
assert.equal(homonymGuard.sections.length,0,
  'An unrelated legacy numeric source ID must not transplant other hymns');
const december = require('../src/data/calendar/2026-12.json');
const nicholas = december.days['2026-12-19'].ru.all_feasts
  .find(f => f.source_id==='blv-839dc39617bdf40503d594dd');
assert.ok(nicholas,'Canonical Nicholas of Myra feast missing on December 19');
const nicholasHymns = presenter.getCalendarCardHymns(nicholas,'ru');
assert.ok(nicholasHymns.sections.some(x=>x.kind==='troparion'));
assert.ok(nicholasHymns.sections.some(x=>x.kind==='kontakion'));
assert.equal(presenter.getCalendarCardHymns({
  source_id:3355,title:'Николай Японский',
},'ru').sections.length,0,
  'Nicholas of Myra name guard failed');

// Visual structure must mark hymn cards separately; do not silently regress
// to unstyled generic paragraphs even if data tests remain green.
const saintScreen=require('node:fs').readFileSync(
  path.join(root,'src/screens/SaintDetailScreen.js'),'utf8');
const calendarScreen=require('node:fs').readFileSync(
  path.join(root,'src/screens/ChurchCalendarScreen.js'),'utf8');
assert.match(saintScreen, /subtitle=\{hymn\.subtitle\}\s+isHymn\b/,
  'Saint hymn accordion must preserve its subtitle and hymn-specific formatting');
assert.match(calendarScreen, /text=\{hymn\.text\}\s+isHymn\b/,
  'Calendar hymn block must preserve its text and hymn-specific formatting');
assert.ok(saintScreen.includes('hymnSectionLabel'));
assert.ok(calendarScreen.includes('hymnSectionLabel'));

const similarlyNamedUnrelated=presenter.getCalendarCardHymns({
  title:'Святого апостола Петра, ученика первоверховного апостола Павла',
},'ru');
assert.equal(similarlyNamedUnrelated.sections.length,0,
  'Different individual saint must not inherit the feast hymns');

console.log('PASS: release-only 2026 canonical ID associations + visual hymn formatting; 1267 cards, 2821 source hymns, 226 patched variants, '+
  tested+' readable rendered sections; 2734 unique icons, 598 quarantined; manual override and alternate fields.');
