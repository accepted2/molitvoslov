#!/usr/bin/env node
'use strict';
// Pure Node verification; does not require Metro, Android or backend access.
// The test executes the same pure ES-module logic used in RN via vm, replacing
// only ES export/import wrappers. The 210 UTF-8 JSON is loaded from Git.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const manifest=require('../src/data/calendar/uocCivicHymns210.json');
const decoderPath=path.join(root,'src/services/calendarCivicDecoder.js');
const presentationPath=path.join(root,'src/services/calendarCardPresentation.js');
const decoderSource=fs.readFileSync(decoderPath,'utf8')
  .replace(/export \{[^}]+\};?/, 'module.exports={looksLegacyUcs,convertLegacyUcsToCivil,expandTitlos,toCivilLetters};');
const decoderModule={exports:{}};
vm.runInNewContext(decoderSource,{module:decoderModule}, {filename:decoderPath});
const code=fs.readFileSync(presentationPath,'utf8')
  .replace(/import \{[\s\S]*?\} from '\.\/calendarCivicDecoder';\n/, '')
  .replace("const corrections = require('../data/calendar/uocCivicHymns210.json');",
           'const corrections = data;')
  .replace(/export const /g,'const ')
  + '\nmodule.exports={getCalendarCardHymns,uniqueCalendarCards};';
const mod={exports:{}};
vm.runInNewContext(code,{
  module:mod,data:manifest,...decoderModule.exports,
},{filename:presentationPath});
const {getCalendarCardHymns,uniqueCalendarCards}=mod.exports;
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
console.log('PASS: 210 original variants, 226 blocks, 122 cards; civic text, extra hymns and one image per saint.');
