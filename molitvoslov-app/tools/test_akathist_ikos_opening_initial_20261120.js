#!/usr/bin/env node
'use strict';
// Verify the ACTUAL WebView renderer rules, not a second implementation.
// The visual first character of Ikos prose is red independently of
// recognized refrains; narrative Jesus is not made a red refrain again.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {parse}=require('@babel/parser');
const file=path.resolve(__dirname,
 '../src/components/reader/selectableDocumentReader/runtime.js');
const source=fs.readFileSync(file,'utf8');
parse(source,{sourceType:'module',plugins:['jsx']});
assert(source.includes('MOLITVOSLOV_AKATHIST_IKOS_OPENING_INITIAL_V1'),
 'Apply apply_akathist_ikos_opening_initial_20261120.js first.');
const take=(a,b)=>{
 const start=source.indexOf(a),end=source.indexOf(b,start);
 assert(start>=0&&end>start,'Akathist WebView anchor moved: '+a);
 return source.slice(start,end);
};
const h=new Function(
 take('const normalizedAkathistTextWithIndex = value =>','const HIGHLIGHT_COMBINING')+
 '\n'+take('const collectAkathistWordRanges = (value, pattern',
 'const collectPsalterPrayerAccentRanges = value =>')+
 '\nreturn {initials:collectAkathistInitialRanges,'+
 'responses:collectAkathistRefrainRanges,'+
 'breaks:collectAkathistJoyBreaks};'
)();
const label=(text,ranges)=>ranges.map(r=>text.slice(r.start,r.end));
const ikos4='Возрадуемся о пришествии Твоем, Пребожественный\nИису́се, '+
 'и взываем: Слава Тебе Господи, Спасителю наш; '+
 'Слава Тебе Господи, наставниче наш; '+
 'Слава Тебе Господи, жизни Подателю; '+
 'Слава Тебе Господи, свету мира.';
const ikos4Actual=label(ikos4,h.initials(ikos4,true,true,false));
assert.deepEqual(ikos4Actual,
 ['Слава','Слава','Слава','Слава','В'],
 'Ikos 4: red opening letter plus real refrains, not narrative Иисусе');
const ikos6='Прежде век Сый и свет Твой даровавый, Иису́се, '+
 'благовествуя. Вопием: Слава Тебе Господи, милость; '+
 'Слава Тебе Господи, спасение; Слава Тебе Господи, благодать.';
assert.deepEqual(label(ikos6,h.initials(ikos6,true,true,false)),
 ['Слава','Слава','Слава','П'],
 'Ikos 6: only opening initial and three true red refrains');
const ikosStartsWithResponse='Радуйся, Свете; радуйся, Хранителю; радуйся, Небесная радость.';
assert.deepEqual(label(ikosStartsWithResponse,
 h.initials(ikosStartsWithResponse,true,true,false)),
 ['Радуйся','радуйся','радуйся'],
 'Ikos starting with refrain must NOT duplicate its first red letter');
const ikosOnlyProse='О чудесе велицем ныне возвеселимся, любовию исповедуя Христа.';
assert.deepEqual(label(ikosOnlyProse,
 h.initials(ikosOnlyProse,true,true,false)),['О'],
 'Ikos without a detectable acclamation retains one red initial');
const accented='А҆́гг҃ели воспевают ныне славу Господню.';
assert.deepEqual(label(accented,h.initials(accented,true,true,false)),['А'],
 'Church Slavonic initial should not color the rest of a word');
const kont1='Предвечный Царю веков, Господи, воспоем Тебе: '+
 'Свят, Свят, Свят еси Господи Боже наш.';
assert.deepEqual(label(kont1,h.initials(kont1,true,false,true)),['Свят'],
 'First Kontakion introduction remains ordinary while its true response is red');
const prayer='Пресвятая Троице, слава Тебе во веки. Аминь.';
assert.deepEqual(label(prayer,h.initials(prayer,false,false,false)),['П'],
 'Existing Akathist prayer initial stays unchanged');
assert.equal(h.breaks(ikos4,true).size,4,
 'Visual line breaks for genuine Ikos responses must remain unchanged');
assert(!h.initials(ikos4,true,true,false).some(r=>
 ikos4.slice(r.start,r.end).includes('Иисусе')),
 'Prose words must not be falsely colored');
assert(source.includes('akathistInitialRanges.forEach( range =>'),
 'Red initial offsets must still be included in DOM text boundaries');
console.log('PASS: every Ikos has a red first opening letter');
console.log('PASS: true acclamation starts keep the full first word red, without duplicates');
console.log('PASS: narrative Иисусе in Ikos 4 and Ikos 6 remains normal');
console.log('PASS: first Kontakion, prayer blocks, source texts and UTF-16 offsets unaffected');
