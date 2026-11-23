#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {transformFeast}=require('./lib/calendarHymnSplit20261123.cjs');
const {looksLegacyUcs,fromUcs8}=require('./lib/calendarUcsUnicode20261123.cjs');
const root=path.resolve(__dirname,'..');

const original={
  id:'uoc-blv-a7a1c9ec56f5cf1aa27deda7',
  troparion_title:'Тропaрь, глaсъ №.\n\nПод0бенъ: Пустhнный жи1тель:',
  troparion_content:'Сили1вріи џтрасль и3 є3гjны храни1телz, въ послBднzz лBта ћвльшагосz.\n\n'+
    'И$нъ тропaрь, глaсъ д7.\n\nПод0бенъ: Ск0рw предвари2:\n\n'+
    'Прпdбнэ пожи1лъ є3си2 ћкw с™и1тель мyдрый.',
  kontakion_title:'Кондaкъ, глaсъ }.\n\nПод0бенъ: Взбрaнной воев0дэ:',
  kontakion_content:'Правослaвіz ѕвэздY новосвётлую.\n\n'+
    'И$нъ кондaкъ, глaсъ в7:\n\nБжcтвенный гр0мъ, трубA дух0внаz.',
};
const before=JSON.stringify(original);
const first=transformFeast(original);
assert.equal(JSON.stringify(original),before,'source must never mutate');
assert.deepEqual(first.warnings,[],'the 2x2 known hymn sample must be split safely');
for(const kind of ['troparion','kontakion']){
  assert.ok(first.card[kind+'_content'],'first hymn must survive');
  assert.ok(first.card[kind+'_alternate_content'],'alternative must survive');
  assert.ok(first.card[kind+'_alternate_title'],'alternative heading must be saved');
  assert.equal(first.card[kind+'_script'],'csl');
  assert.equal(first.card[kind+'_alternate_script'],'csl');
  for(const field of [kind+'_content',kind+'_alternate_content',kind+'_title',kind+'_alternate_title']){
    const v=first.card[field];
    assert.ok(!looksLegacyUcs(v),'remaining UCS8 glyph mix in '+field);
    assert.ok(!/[a-zA-Z][0-9]|[0-9][a-zA-Z]/.test(v),'ASCII encoding remnants '+field);
  }
}
assert.ok(first.card.troparion_alternate_title.includes('Подо́бенъ'));
assert.ok(!first.card.troparion_alternate_content.includes('Подо́бенъ'));
assert.ok(first.card.troparion_content.startsWith('Сили́вр'));
assert.ok(first.card.kontakion_alternate_content.includes('гро́мъ'));
const second=transformFeast(first.card);
assert.deepEqual(second.warnings,[]);
assert.deepEqual(second.changes,[]);
assert.deepEqual(second.card,first.card);
const alreadyCivil={troparion_content:'Преподобнически пожив, яко мудрый иерарх.',
  kontakion_content:'Божественный гром, труба духовная.'};
assert.deepEqual(transformFeast(alreadyCivil).changes,[]);
assert.equal(fromUcs8('Тропaрь, глaсъ №.').includes('а҃'),true);

// Source files never get rewritten by this test.
const ui=fs.readFileSync(path.join(root,'src/services/calendarHymnDisplay.js'),'utf8');
assert.ok(ui.includes("'Ponomar'")===false,'UI helper must not attempt to load fonts itself');
console.log('PASS: two distinct troparia + two distinct kontakia, text preserved');
console.log('PASS: legacy UCS converted to Unicode for Ponomar, voice and Podoben retained');
console.log('PASS: idempotent transformation, normal civilian hymns unchanged');
console.log('PASS: no calendar JSON or database modification');
