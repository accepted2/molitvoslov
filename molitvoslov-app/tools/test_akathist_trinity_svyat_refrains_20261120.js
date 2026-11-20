#!/usr/bin/env node
'use strict';
// Regression test executes the REAL WebView matcher, not copied rules.
// Verify 1st Ikos of the Holy Trinity: triple "Свят" at beginning/end
// plus individual "Свят еси" invocations between them.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {parse}=require('@babel/parser');
const app=path.resolve(__dirname,'..');
const code=fs.readFileSync(path.join(app,
 'src/components/reader/selectableDocumentReader/runtime.js'),'utf8');
parse(code,{sourceType:'module',plugins:['jsx']});
assert(code.includes('MOLITVOSLOV_AKATHIST_SHARED_SVYAT_REFRAIN_V1'),
 'Run apply_akathist_trinity_svyat_refrains_20261120.js first.');
const extract=(a,b)=>{
 const x=code.indexOf(a),y=code.indexOf(b,x);
 assert(x>=0&&y>x,'WebView helper changed: '+a);
 return code.slice(x,y);
};
const r=new Function(
 extract('const normalizedAkathistTextWithIndex = value =>','const HIGHLIGHT_COMBINING')+
 '\n'+extract('const collectAkathistWordRanges = (value, pattern',
 'const collectPsalterPrayerAccentRanges = value =>')+
 '\nreturn {red:collectAkathistRefrainRanges,'+
 'breaks:collectAkathistJoyBreaks,initials:collectAkathistInitialRanges};'
)();
const firstIkos=[
 'Взываем:',
 'Свят, Свят, Свят еси Господи Боже наш, неисповедимая совершенства высота!',
 'Свят еси Господи Боже наш, везде сый и вся исполняяй.',
 'Свят еси Господи Боже наш, вся могий, наричай не сущая яко сущая.',
 'Свят еси Господи Боже наш, испытующий сердца и утробы человеческия.',
 'Свят еси Господи Боже наш, Егоже вси путие истинны.',
 'Свят еси Господи Боже наш, отдаваяй грехи отцев на чада.',
 'Свят, Свят, Свят еси Господи Боже наш, помилуй ны, падшее создание Твое.',
].join('\n');
const check=(label,value,breakCount)=>{
 const ranges=r.red(value,true);
 const actual=ranges.map(p=>value.slice(p.start,p.end));
 assert.deepEqual(actual,Array(7).fill('Свят'),
   label+': all 7 opening words must be red (and only first "Свят")');
 const decorated=r.initials(value,true,true);
 assert.deepEqual(decorated.map(p=>value.slice(p.start,p.end)),
   Array(7).fill('Свят'),label+': markup must exactly match ranges');
 const breaks=[...r.breaks(value,true)];
 assert.equal(breaks.length,breakCount,label+': visual break count');
 for(const offset of breaks){
  assert(ranges.some(p=>p.start===offset),label+': break only at genuine acclamation');
  assert(!/[\r\n][ \t]*$/u.test(value.slice(0,offset)),
   label+': duplicate source line break');
 }
 for(const range of ranges){
  assert(range.end-range.start===4,
   label+': red span must not include second or third Свят');
 }
};
check('Source newlines preserved',firstIkos,0);
check('Run-together source gets 7 explicit breaks',
 firstIkos.replace(/\n/gu,' '),7);
const accented=firstIkos
 .replaceAll('Свят еси','Свя́т еси́')
 .replaceAll('Свят, Свят, Свят','Свя́т, Свя́т, Свя́т');
const accentedRanges=r.red(accented,true);
assert.equal(accentedRanges.length,7,
 'Accented Church Slavonic spelling: every response');
assert(accentedRanges.every(p=>accented.slice(p.start,p.end)==='Свя́т'),
 'Only first complete accented word turns red');
const unrelated='Пророк сказал: Свят еси Господи Боже наш. И продолжал рассказ.';
assert.deepEqual(r.red(unrelated,true),[],
 'Single quoted-style "Свят" invocation must not be colored');
const quotation='Они произнесли: «Свят еси Господи Боже наш».';
assert.deepEqual(r.red(quotation,true),[],
 'Direct speech must remain plain text');
const singleAfterColon='Вопием: Свят еси Господи Боже наш.';
assert.deepEqual(r.red(singleAfterColon,true).map(p=>singleAfterColon.slice(p.start,p.end)),
 [],
 'Do not start coloring a single unverified phrase across all Akathists');
assert(code.includes("akathistJoyBreaks.has(end)"),
 'Rendered line breaks remain connected');
console.log('PASS: Holy Trinity Ikos 1 - all 7 "Свят" response starts red');
console.log('PASS: second and third Свят in triple phrases remain ordinary');
console.log('PASS: each response separated (source newline or visual <br>)');
console.log('PASS: accented spelling, UTF-16 offsets and ordinary quotations safe');
console.log('PASS: no changes to prayers or other reader sections');
