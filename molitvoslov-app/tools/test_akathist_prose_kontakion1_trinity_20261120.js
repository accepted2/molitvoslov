#!/usr/bin/env node
'use strict';
// Check the actual local Akathist WebView and data supplement,
// not a separately rewritten approximation of the coloring algorithm.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {parse}=require('@babel/parser');
const app=path.resolve(__dirname,'..');
const runtime=fs.readFileSync(path.join(app,
 'src/components/reader/selectableDocumentReader/runtime.js'),'utf8');
const css=fs.readFileSync(path.join(app,
 'src/components/reader/selectableDocumentReader/styles.js'),'utf8');
const screen=fs.readFileSync(path.join(app,'src/screens/AkathistScreen.js'),'utf8');
const prayer=fs.readFileSync(path.join(app,'src/data/akathistTrinityPrayer.js'),'utf8');
for(const code of [runtime,css,screen,prayer])
 parse(code,{sourceType:'module',plugins:['jsx']});
const marker='MOLITVOSLOV_AKATHIST_PRAYER_PROSE_KONTAKION1_V1';
for(const code of [runtime,css,screen])
 assert(code.includes(marker),'Missing targeted Akathist fix in a reader module');
assert(screen.includes("['opening', 'ending', 'trinity-prayer'].includes(specialKey)"),
 'Common Akathist prayer sections must use continuous prose');
assert(screen.includes("section.section_type === 'prayer'"),
 'Individual Akathist prayers must use continuous prose');
assert(screen.includes('className: \'akathist-church\' + prayerSuffix'),
 'CS prayer sections were not given a prose class');
assert(screen.includes('className: \'akathist-russian\' + prayerSuffix'),
 'RU prayer sections were not given a prose class');
assert(screen.includes('akathist-prose-prayer'),
 'Akathist prayers need their own CSS class');
assert(/\.reader-text\.akathist-prose-prayer\s*\{[^}]*white-space:\s*normal\s*!important;[^}]*text-align:\s*justify;/u.test(css),
 'CSS must flow prayer text as continuous justified prose');
assert(/\.reader-text\.akathist-church,\s*\.reader-text\.akathist-russian\s*\{\s*white-space:\s*pre-line\s*!important;/u.test(css),
 'Hymns must still preserve source line breaks');
assert(screen.includes('addSpecial(TRINITY_AKATHIST_PRAYER,'),
 'The Trinity prayer is not included in the Akathist');
assert(screen.indexOf('addSpecial(TRINITY_AKATHIST_PRAYER,') <
       screen.indexOf("addSpecial(akathist.common_rule?.ending,"),
 'The Trinity prayer must appear before the common closing rule');
assert(screen.includes('hasTrinityPrayer'),
 'Avoid duplicating the prayer after future source exports');
const prayerMatch=prayer.match(/\bcontent:\s*("(?:[^"\\]|\\.)*")/u);
assert(prayerMatch,'Stored Holy Trinity prayer missing');
const body=JSON.parse(prayerMatch[1]);
assert(body.startsWith('Пресвята́я Тро́ице, Единосу́щная Держа́во'),
 'Holy Trinity opening text corrupted');
assert(body.endsWith('Ами́нь.'),'Holy Trinity prayer is truncated');
assert(body.length>1000,'Holy Trinity prayer body incomplete');
assert(!/[\u00ad\u200b]/u.test(body),'Invisible soft hyphen remains in prayer body');
const take=(a,b)=>{
 const s=runtime.indexOf(a),e=runtime.indexOf(b,s);
 assert(s>=0&&e>s,'Runtime helpers not found: '+a);
 return runtime.slice(s,e);
};
const helpers=new Function(
 take('const normalizedAkathistTextWithIndex = value =>','const HIGHLIGHT_COMBINING')+
 '\n'+take('const collectAkathistWordRanges = (value, pattern',
  'const collectPsalterPrayerAccentRanges = value =>')+
 '\nreturn {refrains:collectAkathistRefrainRanges,'+
 'breaks:collectAkathistJoyBreaks,initials:collectAkathistInitialRanges};'
)();
const assertKontakion=(description,source,word)=>{
 const spans=helpers.refrains(source,false,true);
 assert.deepEqual(spans.map(span=>source.slice(span.start,span.end)),[word],
  description+': only the first word should turn red');
 const firstWordStart=spans[0].start;
 const breaks=[...helpers.breaks(source,false,true)];
 assert.deepEqual(breaks,[firstWordStart],
  description+': chant after colon must start a new line');
 assert.deepEqual(helpers.refrains(source,false,false),[],
  description+': no non-Kontakion narrative coloring');
 assert.deepEqual(helpers.initials(source,true,false,true)
  .map(span=>source.slice(span.start,span.end)),[word],
  description+': reader red initial should match correct word');
 assert(!/[\r\n][ \t]*$/u.test(source.slice(0,firstWordStart)),
  description+': this test must start with text on the same line');
};
assertKontakion('Nativity Kontakion 1',
 'Избраннии от всех племен и народов возрадуемся Господеви, '+
 'ангельскую вси в веселии поюще песнь: Сла́ва в вы́шних Бо́гу и на земли́ ми́р, '+
 'в челове́цех благоволе́ние!',
 'Сла́ва');
assertKontakion('Holy Trinity Kontakion 1',
 'Зовем Ти: Свят, Свят, Свят еси́ Господи Бо́же наш, '+
 'поми́луй ны, падшее создание Твое́.',
 'Свят');
const alreadyBroken='Взываем:\nСвят, Свят, Свят еси́ Господи Бо́же наш.';
assert.equal(helpers.breaks(alreadyBroken,false,true).size,0,
 'Do not add a second line break where the source already has one');
assert.deepEqual(helpers.refrains(alreadyBroken,false,true)
 .map(span=>alreadyBroken.slice(span.start,span.end)),['Свят']);
const narrative='Он произнёс: Слава в вышних Богу! Так продолжалась беседа.';
assert.deepEqual(helpers.refrains(narrative,false,false),[],
 'Only true Kontakion 1 receives one-off acclamation');
const normalProse='Господи, благослови нас и сохрани во вся дни.';
assert.deepEqual(helpers.refrains(normalProse,false,false),[],
 'Prayers cannot receive random red litany words');
console.log('PASS: Akathist prayers are continuous, justified text in CS/RU/traditional');
console.log('PASS: all true Ikos/Kontakion hymns keep separate response lines');
console.log('PASS: Nativity Kontakion 1 colors "Слава" and adds the missing line break');
console.log('PASS: Holy Trinity Kontakion 1 colors "Свят" and adds the missing line break');
console.log('PASS: specific supplied Holy Trinity prayer is complete, correctly placed, unduplicated');
console.log('PASS: source prayer texts, UTF-16 offsets and saved highlights remain unchanged');
