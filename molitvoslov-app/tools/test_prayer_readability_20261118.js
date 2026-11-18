#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {parse}=require('@babel/parser');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
const helper=read('src/services/prayerTextAvailability.js');
const {getPrayerTextAvailability,isPrayerModeAvailable,resolvePrayerMode,buildPrayerModeOptions}=
 new Function(helper.replace(/export const /g,'const ')+
 '\nreturn {getPrayerTextAvailability,isPrayerModeAvailable,resolvePrayerMode,buildPrayerModeOptions};')();
const ruOnly=getPrayerTextAvailability({content:'',translation:'Русский текст',traditional_content:''});
assert.deepEqual(ruOnly,{hasChurch:false,hasRussian:true,hasTraditional:false});
assert.equal(resolvePrayerMode('church',ruOnly),'russian');
assert.equal(resolvePrayerMode('both',ruOnly),'russian');
assert.equal(resolvePrayerMode('traditional',ruOnly),'russian');
assert.equal(resolvePrayerMode('russian',ruOnly),'russian');
assert.deepEqual(buildPrayerModeOptions(ruOnly).map(({key,disabled})=>[key,disabled]),[
 ['church',true],['russian',false],['both',true],['traditional',true]
]);
const churchOnly=getPrayerTextAvailability({content:'Господи, помилуй',translation:'',traditional_content:''});
assert.equal(resolvePrayerMode('russian',churchOnly),'church');
assert.deepEqual(buildPrayerModeOptions(churchOnly).map(x=>x.disabled),[false,true,true,true]);
const both=getPrayerTextAvailability({content:'ЦС',translation:'RU',traditional_content:''});
assert.equal(isPrayerModeAvailable('both',both),true);
assert.deepEqual(buildPrayerModeOptions(both).map(x=>x.disabled),[false,false,false,true]);
const traditional=getPrayerTextAvailability({content:'',translation:'',traditional_content:'Ст҃ый'});
assert.equal(resolvePrayerMode('church',traditional),'traditional');
assert.deepEqual(buildPrayerModeOptions(traditional).map(x=>x.disabled),[true,true,true,false]);
assert.deepEqual(buildPrayerModeOptions({}).map(x=>x.disabled),[true,true,true,true]);
console.log('PASS: Russian-only, Church-only, parallel, traditional-only and empty tab states');
for(const file of [
 'src/services/prayerTextAvailability.js',
 'src/screens/ReaderScreen.js',
 'src/screens/PrayerRuleScreen.js',
 'src/screens/MiscPrayerPlaceholderScreen.js',
 'src/screens/MiscPrayersScreen.js',
 'src/components/reader/selectableDocumentReader/styles.js',
 'src/components/reader/selectableDocumentReader/runtime.js',
]){
 assert.doesNotThrow(()=>parse(read(file),{sourceType:'module',plugins:['jsx']}),file+' parses');
}
const reader=read('src/screens/ReaderScreen.js');
const rules=read('src/screens/PrayerRuleScreen.js');
const placeholder=read('src/screens/MiscPrayerPlaceholderScreen.js');
const misc=read('src/screens/MiscPrayersScreen.js');
const css=read('src/components/reader/selectableDocumentReader/styles.js');
const runtime=read('src/components/reader/selectableDocumentReader/runtime.js');
assert.match(reader,/buildPrayerModeOptions\(getPrayerTextAvailability\(text\)\)/);
assert.match(reader,/resolvePrayerMode\(savedMode, getPrayerTextAvailability\(text\)\)/);
assert.match(reader,/presentation: 'standalone-prayer'/);
assert.match(rules,/buildPrayerModeOptions\(available\)/);
assert.match(placeholder,/effectiveMode = resolvePrayerMode\(viewMode, availability\)/);
assert.match(misc,/isCategory && styles\.categoryCard/);
assert.match(misc,/flexShrink: 1/);
assert.match(css,/#reader\.standalone-prayer \.document-header\.has-reader-action-menu \.rule-title/);
assert.match(runtime,/reader\.classList\.toggle\('standalone-prayer'/);
console.log('PASS: all modified readers and category styles parse; tab and layout wiring present');
