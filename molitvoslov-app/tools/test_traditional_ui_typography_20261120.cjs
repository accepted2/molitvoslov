#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {parse}=require('@babel/parser');
const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const render=new Function(read('src/services/traditionalUiTypography.js')
  .replace(/export const traditionalUiTextStyle\s*=/u,'const traditionalUiTextStyle =')+
  '\nreturn traditionalUiTextStyle;')();
assert.equal(render('ru',10,12),null);
assert.equal(render('uk',10,12),null);
const nav=render('csl_traditional',10,12);
const body=render('csl_traditional',16,24);
const large=render('csl_traditional',24,30);
assert.equal(nav.fontFamily,'Ponomar');
assert(nav.fontSize>=16 && nav.lineHeight>=20);
assert(body.fontSize>=21 && body.lineHeight>=28);
assert(large.fontSize>=30 && large.lineHeight>=38);
assert(render('csl_traditional',10*1.25,12*1.25).fontSize>=nav.fontSize);
for(const rel of [
  'src/components/navigation/BottomNav.js',
  'src/components/navigation/FixedSectionHeader.js',
  'src/screens/HoursScreen.js',
  'src/screens/MenuScreen.js',
  'src/screens/PrayerLearningScreen.js',
  'src/screens/AccountScreen.js',
  'src/screens/CommunionPreparationScreen.js',
  'src/screens/ConfessionPreparationScreen.js',
]){
 const source=read(rel);
 assert(source.includes('traditionalUiTextStyle'),
   'Missing explicit typography correction: '+rel);
 parse(source,{sourceType:'module',plugins:['jsx']});
}
const bottom=read('src/components/navigation/BottomNav.js');
assert(bottom.includes('traditional ? 72 : 46'));
assert(bottom.includes('numberOfLines={traditional ? 2'));
assert(bottom.includes('adjustsFontSizeToFit={!traditional'));
const menu=read('src/screens/MenuScreen.js');
assert(menu.includes('(traditional ? 116 : 80) * uiScale'));
assert(menu.includes("calendarLanguage === 'csl_traditional' ? 116 : 80"));
const hours=read('src/screens/HoursScreen.js');
assert(hours.includes('traditionalUiTextStyle(language, size * uiScale'));
const learning=read('src/screens/PrayerLearningScreen.js');
assert(learning.includes('cslText(textSize, textSize * 1.52)'));
const communion=read('src/screens/CommunionPreparationScreen.js');
const pending=communion.slice(communion.indexOf('const PendingItem ='),communion.indexOf('export const CommunionPreparationScreen'));
assert(!pending.includes('traditionalStyle'));
const reader=read('src/services/readerLanguageModes.js');
assert(!reader.includes("if (language === 'csl_traditional'"));
console.log('PASS: traditional CSL labels are larger with proper line height.');
console.log('PASS: RU/UK interface sizes are unchanged; UI scale remains respected.');
console.log('PASS: bottom nav height and cards accommodate larger traditional labels.');
console.log('PASS: prayer content and default reader language modes are unaffected.');
console.log('PASS: 8 modified JS/JSX screens parse.');
