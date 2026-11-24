#!/usr/bin/env node
'use strict';
// Pure-JS typography regression; execute the exact helpers embedded in the
// WebView runtime, not a separate approximation of their matching rules.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {parse} = require('@babel/parser');
const runtime = fs.readFileSync(path.resolve(__dirname,
  '../src/components/reader/selectableDocumentReader/runtime.js'),'utf8');
parse(runtime,{sourceType:'module',plugins:['jsx']});
assert(runtime.includes('MOLITVOSLOV_AKATHIST_IKOS_BOUNDARY_ACCENTS_V1'),
 'Run apply_akathist_ikos_layout_20261120.js before these tests.');

const between=(start,end)=>{
 const a=runtime.indexOf(start),b=runtime.indexOf(end,a);
 assert(a>=0&&b>a,'Runtime function anchors changed: '+start);
 return runtime.slice(a,b);
};
const code = between('const normalizedAkathistTextWithIndex = value =>',
                     'const HIGHLIGHT_COMBINING') +
 '\n' + between('const collectAkathistWordRanges = (value, pattern',
                 'const collectPsalterPrayerAccentRanges = value =>');
const helpers = new Function(code +
 '\nreturn {ranges: collectAkathistRefrainRanges, breaks: collectAkathistJoyBreaks, '+
 'initials: collectAkathistInitialRanges, alleluia: collectAkathistAlleluiaRanges};')();

const validate=(name,text,expected,expectedBreaks=null,ikos=true)=>{
 const ranges=helpers.ranges(text,ikos);
 const actual=ranges.map(range=>text.slice(range.start,range.end));
 assert.deepEqual(actual,expected,name+' wrong red spans');
 for(const range of ranges){
  assert(range.start>=0&&range.start<range.end&&range.end<=text.length,
    name+' invalid UTF-16 span');
 }
 const breaks=[...helpers.breaks(text,ikos)];
 if(expectedBreaks!==null)assert.deepEqual(breaks,expectedBreaks,name+' wrong line breaks');
 for(const offset of breaks){
  assert(offset>0&&offset<text.length,name+' break outside text');
  assert(!/[\r\n][ \t]*$/.test(text.slice(0,offset)),
   name+' redundant break before source newline');
  assert(ranges.some(range=>range.start===offset),name+' break without response');
 }
};
const ikos='Возопием к Тебе: Радуйся, светильниче веры; радуйся, сосуде благодати.';
validate('colon and semicolon',ikos,['Радуйся,','радуйся,'],
 [ikos.indexOf('Радуйся'),ikos.indexOf('радуйся')]);
const multiline='Возопием к Тебе:\nРадуйся, светильниче веры;\nРадуйся, сосуде благодати.';
validate('already separated lines',multiline,['Радуйся,','Радуйся,'],[]);
validate('narrative is not a litany',
  'Он радовался и затем сказал, что слово радуйся бывает в тексте.',
  [],[]);
validate('narrative after a full stop is not a litany',
  'Повесть окончена. В рассказе слово радуйся произнесено в другом контексте.',
  [],[]);
validate('quoted speech is not a litany',
  'Он сказал: «Радуйся, Благодатная!»; ученики услышали слова.',
  [],[]);
const solemn='И речем: Святителю Николае, моли Бога о нас; Господи мой, помилуй нас.';
validate('short multiword address',solemn,['Святителю Николае,','Господи мой,'],
 [solemn.indexOf('Святителю'),solemn.indexOf('Господи')]);
validate('long commas not colored beyond invocation',
  'Радуйся, Ковчеже, содержащий благодать; радуйся, светозарная звездо.',
  ['Радуйся,','радуйся,']);
validate('original accents preserved',
  'Рáдуйся, светилe; Раду́йся, сосуде; Радꙋ́йсѧ, Невесто.',
  ['Рáдуйся,','Раду́йся,','Радꙋ́йсѧ,']);
validate('no false positive inside another word',
  'Не забудь слово сорадуйся и выражение саморадуйся.',
  [],[]);
validate('simple opening response',
  'Радуйся, солнце правды!', ['Радуйся,'], []);
validate('ordinary introduction only',
  'Предстали апостолы со многими молитвами и поклонением.', [], []);
validate('Kontakion 1 has no extra Ikos-only vocatives',
  'И воззовем: Святителю Николае, моли Бога. Радуйся, отче!',
  ['Радуйся,'],null,false);
const alleluia='Песнь: Аллилуиа,';
assert.deepEqual(helpers.alleluia(alleluia)
  .map(range=>alleluia.slice(range.start,range.end)), ['Аллилуиа,']);
assert(runtime.includes("const isAkathistIkos = isAkathist && itemConfig?.metadata?.section_type === 'ikos';"),
  'Akathist response styling must not be added to prayers');
assert(runtime.includes('const hasAkathistInvocations = isAkathistIkos || isAkathistFirstKontakion;'),
  'Kontakion 1 scope changed unexpectedly');
assert(runtime.includes('akathistJoyBreaks.has(end)'),
  'Reader DOM break positions changed unexpectedly');
console.log('PASS: Akathist Ikos red phrases stop at first comma and include short vocatives');
console.log('PASS: plain narration, quotations, and substrings remain uncolored');
console.log('PASS: source newlines do not generate duplicate visual breaks');
console.log('PASS: accents, traditional spellings and original UTF-16 text offsets remain unchanged');
console.log('PASS: only Ikos and Kontakion 1 use invocation markup');
