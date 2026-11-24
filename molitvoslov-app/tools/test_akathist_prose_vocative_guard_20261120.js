#!/usr/bin/env node
'use strict';
// Execute the exact bundled WebView typography helpers with source-like
// passages from Ikos 4/6 and a true Jesus-acclamation Akathist.
// The test never reads/writes prayer data or modifies phone bookmarks.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {parse}=require('@babel/parser');
const file=path.resolve(__dirname,'../src/components/reader/selectableDocumentReader/runtime.js');
const runtime=fs.readFileSync(file,'utf8');
parse(runtime,{sourceType:'module',plugins:['jsx']});
assert(runtime.includes('MOLITVOSLOV_AKATHIST_PROSE_VOCATIVE_GUARD_V1'),
  'Run apply_akathist_prose_vocative_guard_20261120.js first.');
const take=(start,end)=>{
 const a=runtime.indexOf(start),b=runtime.indexOf(end,a);
 assert(a>=0&&b>a,'Cannot find reader function: '+start);
 return runtime.slice(a,b);
};
const helpers=new Function(
 take('const normalizedAkathistTextWithIndex = value =>','const HIGHLIGHT_COMBINING')+
 '\n'+take('const collectAkathistWordRanges = (value, pattern',
   'const collectPsalterPrayerAccentRanges = value =>')+
 '\nreturn {ranges:collectAkathistRefrainRanges,breaks:collectAkathistJoyBreaks,'+
 ' boundary:isAkathistResponseBoundary};'
)();
const litany=(prefix='Слава Тебе Господи')=>[
 prefix+', просветивый нас;',
 prefix+', исцеливый нас;',
 prefix+', избавивый нас;',
 prefix+', спасший нас.',
].join('\n');
const cases=[
 ['Ikos 4 - incidental Jesus after soft source wrap',
  'Сего ради и мы, чада новаго Израиля, чтуще Твое, Пребожественный\n'+
  'Иису́се, во плоти к нам пришествие и рождество, с верою зовем:\n'+litany(),
  ['Слава Тебе Господи,','Слава Тебе Господи,','Слава Тебе Господи,','Слава Тебе Господи,']],
 ['Ikos 6 - incidental Jesus after comma and a line break',
  'Возсиявый прежде век от Отца, изшел еси во спасение людей Твоих,\n'+
  'Иису́се, благовествуя нищим, исцеляя сокрушенныя сердцем. Мы поем:\n'+litany(),
  ['Слава Тебе Господи,','Слава Тебе Господи,','Слава Тебе Господи,','Слава Тебе Господи,']],
 ['Ikos 4 without a soft source break',
  'Чтуще Твое, Пребожественный Иисусе, во плоти пришествие, взываем:\n'+litany(),
  ['Слава Тебе Господи,','Слава Тебе Господи,','Слава Тебе Господи,','Слава Тебе Господи,']],
 ['Ikos 6 when prose contains strong punctuation',
  'В начале восхвалим Бога. Иисусе, ведомый Отцу. Приносим хвалу:\n'+litany(),
  ['Слава Тебе Господи,','Слава Тебе Господи,','Слава Тебе Господи,','Слава Тебе Господи,']],
 ['Jesus-centered Ikos keeps its actual red acclamations',
  'Предстоим Тебе:\nИисусе, Спасителю наш;\nИисусе, Свете мира;\n'+
  'Иисусе, Господи сил;\nИисусе, Человеколюбче.',
  ['Иисусе,','Иисусе,','Иисусе,','Иисусе,']],
 ['Theotokos-centered Ikos keeps Raduyusya',
  'Тако взываем:\nРадуйся, Пречистая;\nРадуйся, Светозарная;\n'+
  'Радуйся, заступница наша;\nРадуйся, Царице.',
  ['Радуйся,','Радуйся,','Радуйся,','Радуйся,']],
 ['Doxology and mixed genuine addresses keep repeated families',
  'Взываем: Слава Тебе Господи, спасение;\nИисусе, Спасителю;\n'+
  'Иисусе, Благий;\nИисусе, милосердый;\nСлава Тебе Господи, милость.',
  ['Слава Тебе Господи,','Иисусе,','Иисусе,','Иисусе,','Слава Тебе Господи,']]
];
for(const [label,text,expected] of cases){
 const ranges=helpers.ranges(text,true);
 const actual=ranges.map(r=>text.slice(r.start,r.end));
 assert.deepEqual(actual,expected,label+' red ranges');
 for(const r of ranges)assert(r.start>=0&&r.end<=text.length&&r.end>r.start,
  label+' offsets');
 const breaks=[...helpers.breaks(text,true)];
 for(const offset of breaks){
  assert(ranges.some(r=>r.start===offset),label+' broken without a true refrain');
  assert(!/[\r\n][ \t]*$/u.test(text.slice(0,offset)),label+' duplicate line break');
 }
 if(label.includes('incidental')||label.includes('without a soft')||label.includes('strong punctuation')){
  assert(!ranges.some(r=>/^Иису/iu.test(text.slice(r.start,r.end))),
   label+' still incorrectly highlights Jesus in prose');
 }
}
assert(runtime.includes("const isAkathistIkos = isAkathist && itemConfig?.metadata?.section_type === 'ikos';"),
 'The guard must remain scoped to Akathist Ikoses');
assert(runtime.includes('if (extraResponses) {'),
 'The Ikos-only condition must be retained');
console.log('PASS: Ikos 4 and 6 - narrative "Иисусе" stays normal, including soft source wraps');
console.log('PASS: repeated Jesus and Raduyusya refrains remain red');
console.log('PASS: alternate legitimate refrain families repeated >=2 remain available');
console.log('PASS: true refrains retain their existing line-break and original UTF-16 offsets');
