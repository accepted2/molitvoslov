#!/usr/bin/env node
'use strict';
// Run exact WebView source, not an independent approximation of matching.
// Synthetic liturgical examples cover ordinary, mixed and special hymns.
// No source prayer JSON is modified by these tests.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {parse}=require('@babel/parser');
const file=path.resolve(__dirname,'../src/components/reader/selectableDocumentReader/runtime.js');
const runtime=fs.readFileSync(file,'utf8');
parse(runtime,{sourceType:'module',plugins:['jsx']});
assert(runtime.includes('MOLITVOSLOV_AKATHIST_FIRST_WORD_RESPONSE_V1'),
  'Apply apply_akathist_first_word_layout_20261120.js first.');
const take=(a,b)=>{
  const start=runtime.indexOf(a),end=runtime.indexOf(b,start);
  assert(start>=0 && end>start,'WebView helper anchor moved: '+a);
  return runtime.slice(start,end);
};
const r=new Function(
  take('const normalizedAkathistTextWithIndex = value =>','const HIGHLIGHT_COMBINING')+
  '\n'+take('const collectAkathistWordRanges = (value, pattern',
             'const collectPsalterPrayerAccentRanges = value =>')+
  '\nreturn {ranges:collectAkathistRefrainRanges,breaks:collectAkathistJoyBreaks,'+
  'initials:collectAkathistInitialRanges,repeated:collectAkathistRepeatedOpeningRanges};'
)();
const verify=(name,source,expected,expectedBreakCount,ikos=true)=>{
  const before=source;
  const ranges=r.ranges(source,ikos);
  assert.deepEqual(ranges.map(p=>source.slice(p.start,p.end)),expected,
    name+' red first word');
  assert.deepEqual(r.initials(source,true,ikos).map(p=>source.slice(p.start,p.end)),
    expected,name+' decorated ranges');
  const breaks=[...r.breaks(source,ikos)];
  assert.equal(breaks.length,expectedBreakCount,name+' visual breaks');
  for(const offset of breaks){
    assert(ranges.some(p=>p.start===offset),name+' break before a non-response');
    assert(!/[\r\n][ \t]*$/u.test(source.slice(0,offset)),
      name+' duplicate source newline');
  }
  for(const span of ranges){
    assert(span.start>=0 && span.start<span.end && span.end<=source.length,
      name+' UTF-16 offsets');
    assert(!/\s|[,;:!?]/u.test(source.slice(span.start,span.end)),
      name+' colored punctuation or a second word');
  }
  assert.equal(source,before,name+' original source text altered');
};
verify('Jesus Sweetest - one line with four invocations',
 'Вопием: Иисусе Пречудный, Ангелов удивление; Иисусе Пресильный, мир исцеляющий; '+
 'Иисусе Сладчайший, утешение наше; Иисусе Милостивый, подаждь нам благодать.',
 ['Иисусе','Иисусе','Иисусе','Иисусе'],4);
verify('Jesus Sweetest - source already has line breaks',
 'Возопием:\nИисусе Пречудный, Ангелов удивление;\nИисусе Пресильный, '+
 'сильных укрепление;\nИисусе Сладчайший, спасение наше.',
 ['Иисусе','Иисусе','Иисусе'],0);
verify('First Kontakion - responses are also separated',
 'Молимся: Радуйся, всечестне; радуйся, всеблаженне.',
 ['Радуйся','радуйся'],2,false);
verify('Raduyusya - only first word, never comma',
 'И воспеваем: Ра́дуйся, Покрове наш; Радꙋ́йсѧ, Невесто Неневестная.',
 ['Ра́дуйся','Радꙋ́йсѧ'],2);
verify('Full doxology - first word only',
 'Воспеваем:\nСла́ва Тебе́ Господи, дивный во святых;\n'+
 'Сла́ва Тебе́ Господи, исцеляющий болящих;\n'+
 'Сла́ва Тебе́ Господи, свет миру подаваяй.',
 ['Сла́ва','Сла́ва','Сла́ва'],0);
verify('Premudrost Ikos 4 - narrative Jesus untouched',
 'Сего ради мы чтуще Твое, Пребожественный\nИису́се, во плоти к нам пришествие. '+
 'Взываем: Слава Тебе Господи, свет возсиявый; Слава Тебе Господи, любовь; '+
 'Слава Тебе Господи, радость; Слава Тебе Господи, мир.',
 ['Слава','Слава','Слава','Слава'],4);
verify('Premudrost Ikos 6 - narrative Jesus untouched',
 'Людей Твоих,\nИису́се, благовествуя нищим, исцеляя немощных. '+
 'Вопием: Слава Тебе Господи, исцеление; Слава Тебе Господи, милость; '+
 'Слава Тебе Господи, спасение; Слава Тебе Господи, жизнь.',
 ['Слава','Слава','Слава','Слава'],4);
verify('Pascha - recurring special phrase',
 'Воспеваем: Христос воскресе, смерть разрушив; Христос воскресе, свет возсия; '+
 'Христос воскресе, нам жизнь дарова; Христос воскресе, ад низложи.',
 ['Христос','Христос','Христос','Христос'],4);
verify('Sretenie - recurring special phrase',
 'Воспоем: Гряди́, Христе; гряди́, Богородице; гряди́, Царю.',
 ['Гряди́','гряди́','гряди́'],3);
verify('Entrance into Jerusalem - recurring special phrase',
 'Поем: Благослове́н еси́, Господи; Благослове́н еси́, Свете; '+
 'Благослове́н еси́, Царю.',
 ['Благослове́н','Благослове́н','Благослове́н'],3);
verify('Holy Trinity - threefold response, but first word red',
 'Воспеваем: Свят, Свят, Свят еси Господи Боже наш, Свете; '+
 'Свят, Свят, Свят еси Господи Боже наш, Творче; '+
 'Свят, Свят, Свят еси Господи Боже наш, Боже.',
 ['Свят','Свят','Свят'],3);
verify('Isolated phrase after colon is NOT automatically a response',
 'Пророк сказал: Христос воскресе из мертвых. Повесть продолжается.',[],0);
verify('No arbitrary red word in narrative',
 'Старец произнёс: Иисусе, Господи мой, услыши меня. '+ 
 'Это пересказ молитвенного рассказа.',[],0);
verify('Narrative quotation is not an acclamation',
 'Пророк произнёс: «Радуйся, Благодатная». Повествование идёт далее.',[],0);
verify('Preserve conventional first initial for prayers outside hymns',
 'Господи, помилуй меня, грешного.',[],0);
assert.deepEqual(
 r.initials('Господи, помилуй меня, грешного.',false,false)
 .map(p=>'Господи, помилуй меня, грешного.'.slice(p.start,p.end)),
 ['Г'],'ordinary Akathist prayer introductory initial was lost');
console.log('PASS: one entire first word red, no comma, no second word');
console.log('PASS: one new visual line per response in Ikos and Kontakion 1');
console.log('PASS: source newlines, accent marks, text offsets and prayer data untouched');
console.log('PASS: Jesus Sweetest, Raduyusya and five exceptional hymn profiles');
console.log('PASS: narrative Иисусе, quotes, incidental colons remain plain');
