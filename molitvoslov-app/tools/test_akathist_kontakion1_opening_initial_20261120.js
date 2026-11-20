#!/usr/bin/env node
'use strict';
// Verify the real WebView helpers, including red opening initial,
// first Kontakion hymn responses, Church Slavonic accents and Ikos guard.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {parse}=require('@babel/parser');
const runtime=fs.readFileSync(path.resolve(__dirname,
 '../src/components/reader/selectableDocumentReader/runtime.js'),'utf8');
parse(runtime,{sourceType:'module',plugins:['jsx']});
assert(runtime.includes('MOLITVOSLOV_AKATHIST_KONTAKION1_OPENING_INITIAL_V1'),
 'Apply apply_akathist_kontakion1_opening_initial_20261120.js first.');
const take=(start,end)=>{
 const a=runtime.indexOf(start),b=runtime.indexOf(end,a);
 assert(a>=0&&b>a,'WebView function changed: '+start);
 return runtime.slice(a,b);
};
const h=new Function(
 take('const normalizedAkathistTextWithIndex = value =>','const HIGHLIGHT_COMBINING')+
 '\n'+take('const collectAkathistWordRanges = (value, pattern',
 'const collectPsalterPrayerAccentRanges = value =>')+
 '\nreturn {initials:collectAkathistInitialRanges,'+
 'responses:collectAkathistRefrainRanges,breaks:collectAkathistJoyBreaks};'
)();
const labels=(text,rs)=>rs.map(p=>text.slice(p.start,p.end));
const nativity='Избраннии от всех племен и народов, ангельскую вси '+
 'в веселии поюще песнь: Сла́ва в вы́шних Бо́гу и на земли мир!';
assert.deepEqual(labels(nativity,h.initials(nativity,true,false,true)),
 ['Сла́ва','И'],
 'Nativity first Kontakion: only original first letter plus one hymn response');
assert.deepEqual([...h.breaks(nativity,false,true)],
 [nativity.indexOf('Сла́ва')],
 'Nativity first Kontakion hymn starts on a separate visual line');
const trinity='Предвечный Царю веков и Господи, восхвалим Тя: '+
 'Свят, Свят, Свят еси Господи Боже наш, помилуй ны!';
assert.deepEqual(labels(trinity,h.initials(trinity,true,false,true)),
 ['Свят','П'],
 'Holy Trinity first Kontakion: red first glyph and hymn cue Свят');
assert.deepEqual([...h.breaks(trinity,false,true)],
 [trinity.indexOf('Свят')],
 'Holy Trinity first Kontakion hymn begins new line');
const firstAlreadyRefrain='Свят, Свят, Свят еси Господи Боже наш.';
assert.deepEqual(labels(firstAlreadyRefrain,h.initials(firstAlreadyRefrain,true,false,true)),
 ['Свят'],
 'Do not add a duplicated red first letter inside a red hymn word');
const church='А҆́гг҃ели воспевают радость: Свят, Свят, Свят еси Господи.';
assert.deepEqual(labels(church,h.initials(church,true,false,true)),
 ['Свят','А҆́'],
 'Church Slavonic red initial includes accent marks');
const ikos='Воспеваем Тя: Слава Тебе Господи, милосердый; '+
 'Слава Тебе Господи, прещедрый; Слава Тебе Господи, всеблагий.';
assert.deepEqual(labels(ikos,h.initials(ikos,true,true,false)),
 ['Слава','Слава','Слава','В'],
 'Ikos first initial and refrain words remain unchanged');
const prayer='Пресвятая Троице, слава Тебе.';
assert.deepEqual(labels(prayer,h.initials(prayer,false,false,false)),
 ['П'],'Prayer behavior stays unchanged');
assert.deepEqual(labels(nativity,h.responses(nativity,false,false)),[],
 'Kontakion 1 special hymn is scoped to first Kontakion only');
assert(runtime.includes('akathistInitialRanges.forEach( range =>'),
 'WebView must retain red span boundaries');
console.log('PASS: Nativity Kontakion 1 first red letter and later red Слава on new line');
console.log('PASS: Holy Trinity Kontakion 1 first red letter and later red Свят');
console.log('PASS: first-word refrain has no duplicate red initial');
console.log('PASS: Ikos initials, prayer text, accents and offsets stay unchanged');
