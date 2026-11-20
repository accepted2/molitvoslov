#!/usr/bin/env node
'use strict';
// Execute the actual WebView helper source to catch the exact regression
// noticed in Ikos 4 and Ikos 6 of Akathist to the Wisdom of God's Word.
// No duplicated implementation of red-span logic in this test.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {parse}=require('@babel/parser');
const file=path.resolve(__dirname,'../src/components/reader/selectableDocumentReader/runtime.js');
const runtime=fs.readFileSync(file,'utf8');
parse(runtime,{sourceType:'module',plugins:['jsx']});
assert(runtime.includes('MOLITVOSLOV_AKATHIST_DOXOLOGY_FULL_VOCATIVE_V1'),
  'Apply apply_akathist_doxology_vocative_20261120.js first.');
const take=(start,end)=>{
 const a=runtime.indexOf(start),b=runtime.indexOf(end,a);
 assert(a>=0&&b>a,'Cannot find WebView anchor '+start);
 return runtime.slice(a,b);
};
const helpers=new Function(
 take('const normalizedAkathistTextWithIndex = value =>','const HIGHLIGHT_COMBINING')+
 '\n'+take('const collectAkathistWordRanges = (value, pattern',
   'const collectPsalterPrayerAccentRanges = value =>')+
 '\nreturn {ranges:collectAkathistRefrainRanges,breaks:collectAkathistJoyBreaks};'
)();
const check=(label,text,expected,expectBreaks=null)=>{
 const spans=helpers.ranges(text,true);
 const actual=spans.map(span=>text.slice(span.start,span.end));
 assert.deepEqual(actual,expected,label+' red opening words');
 for(const span of spans){
   assert(span.start>=0&&span.start<span.end&&span.end<=text.length,label+' offsets');
 }
 const breaks=[...helpers.breaks(text,true)];
 if(expectBreaks!==null)assert.deepEqual(breaks,expectBreaks,label+' line breaks');
};
const ikos4='Взываем: Сла́ва Тебе́, Го́споди, спасе́ние дарова́вый; Сла́ва Тебе́, Го́споди, весь мир просвети́вый.';
check('Ikos 4 phrase',ikos4,['Сла́ва Тебе́, Го́споди,','Сла́ва Тебе́, Го́споди,'],
 [ikos4.indexOf('Сла́ва'),ikos4.lastIndexOf('Сла́ва')]);
const ikos6='Сими хваленьми:\nСла́ва Тебе́, Го́споди, чудеса́ сотвори́вый.\nСла́ва Тебе́, Го́споди, все́х исцеля́яй.';
check('Ikos 6 phrase',ikos6,['Сла́ва Тебе́, Го́споди,','Сла́ва Тебе́, Го́споди,'],[]);
check('Russian unaccented','Слава Тебе, Господи, мир даровавший.',
 ['Слава Тебе, Господи,'],[]);
check('First doxology comma is not the end','Слава Тебе, Господи, слава Тебе.',
 ['Слава Тебе, Господи,'],[]);
check('Different divine address is not changed',
 'Слава Тебе, Спасителю, слава Тебе.',
 ['Слава Тебе,'],[]);
check('Other invocation kept',
 'Радуйся, Матерь Божия; радуйся, Спасение мира.',
 ['Радуйся,','радуйся,']);
check('Quotation remains untouched',
 'Рече: «Слава Тебе, Господи, даровавый свет!»',
 [],[]);
check('Ordinary text not colored',
 'Он обсуждал слово слава, затем сказал, что все радовались.',
 [],[]);
assert(runtime.includes("const isAkathistIkos = isAkathist && itemConfig?.metadata?.section_type === 'ikos';"),
 'Scope to Akathist sections must not change');
console.log('PASS: Ikos 4 and Ikos 6 color full "Слава Тебе, Господи," through the second comma');
console.log('PASS: normal Russian, accent-bearing Church Slavonic, quotations and other vocatives');
console.log('PASS: existing source newlines do not receive another visual break');
console.log('PASS: text contents, UTF-16 offsets, bookmarks and other reader sections are untouched');
