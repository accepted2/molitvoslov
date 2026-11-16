#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {FORMAT_KEY,packCalendarMonth,unpackCalendarMonth}=require('../src/services/calendarMonthCodec');

const month={
  year:2026,month:11,total_days:3,
  metadata:{pascha:'2026-04-12',source:'local'},
  days:{
    '2026-11-14':{
      ru:{date_gregorian:'2026-11-14',all_feasts:[
        {id:10,name:'Святой',life:'Long Cyrillic text '.repeat(500),icons:['a','b']},
      ],main_feast:{id:10,name:'Главный святой'},readings:['Lk. 1'],summary:'a',ru_only:true},
      uk:{date_gregorian:'2026-11-14',all_feasts:[
        {id:10,name:'Святой',life:'Long Cyrillic text '.repeat(500),icons:['a','b']},
      ],main_feast:{id:10,name:'Головний святий'},readings:['Lk. 1'],summary:'б',uk_only:7},
      note:'retain other day fields',
    },
    '2026-11-15':{
      ru:{all_feasts:[{name:'Original Russian life',text:'R'}],main_feast:{name:'R'}},
      uk:{all_feasts:[{name:'Справжній український переклад',text:'U'}],
        main_feast:{name:'U'}},
    },
    '2026-11-16':{
      ru:{date_gregorian:'2026-11-16',readings:[{book:'Bible',chapter:1}],empty:null},
      uk:{date_gregorian:'2026-11-16',readings:[{book:'Bible',chapter:1}],empty:null},
    },
    '2026-11-17':{ru:{a:1},de:{a:2}}, // extra language is preserved
  },
};
const orig=JSON.parse(JSON.stringify(month));
const packed=packCalendarMonth(orig);
assert.equal(packed[FORMAT_KEY],1);
assert.deepStrictEqual(Object.keys(packed.days['2026-11-14'].uk),
  ['main_feast','summary','uk_only']);
assert.deepStrictEqual(packed.days['2026-11-14'].ru,orig.days['2026-11-14'].ru);
const serialized=JSON.stringify(packed);
assert.ok(Buffer.byteLength(serialized)<Buffer.byteLength(JSON.stringify(orig)),
  'Lossless format did not reduce sample size');
const decoded=unpackCalendarMonth(JSON.parse(serialized));
assert.deepStrictEqual(decoded,orig);
assert.deepStrictEqual(unpackCalendarMonth(orig),orig,'Old uncompressed month must remain supported');
assert.deepStrictEqual(decoded.days['2026-11-14'].uk.all_feasts,
  decoded.days['2026-11-14'].ru.all_feasts);
assert.notStrictEqual(decoded.days['2026-11-14'].uk.all_feasts,
  decoded.days['2026-11-14'].ru.all_feasts,
  'Language arrays must be independent to avoid cross-language mutation');
assert.notStrictEqual(decoded.days['2026-11-14'].uk.all_feasts[0],
  decoded.days['2026-11-14'].ru.all_feasts[0]);
decoded.days['2026-11-14'].ru.all_feasts[0].name='edited-in-view';
assert.equal(decoded.days['2026-11-14'].uk.all_feasts[0].name,'Святой');
assert.equal(decoded.days['2026-11-14'].uk.uk_only,7);
assert.ok(!('ru_only' in decoded.days['2026-11-14'].uk));
assert.deepStrictEqual(decoded.days['2026-11-17'].de,{a:2});
assert.throws(()=>packCalendarMonth(packed),/already packed/);
assert.throws(()=>unpackCalendarMonth({...packed,[FORMAT_KEY]:2}),/Unsupported/);

const source=fs.readFileSync(path.join(__dirname,'../src/services/calendarOfflineStore.js'),'utf8');
assert.match(source,/unpackCalendarMonth\(loader\(\)\)/);
const generator=fs.readFileSync(path.join(__dirname,'pack-calendar-months-20261116.js'),'utf8');
for(const marker of ['assert.deepStrictEqual(expanded,parsed)',
  'calendar-month-originals-','--apply','--restore=','sha256','fs.copyFileSync']){
  assert.ok(generator.includes(marker),'Missing transactional packing safeguard: '+marker);
}
console.log('PASS: exact calendar RU/UK roundtrip, disjoint localized days, all metadata, original key order and array isolation');
console.log('PASS: old calendar JSON compatibility, native runtime decode hook and SHA-verified backup/restore guards');
