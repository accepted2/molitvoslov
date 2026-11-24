#!/usr/bin/env node
'use strict';
// Release gate for Continue Reading localization; no source mutations.
const fs=require('node:fs');
const path=require('node:path');
const {parse}=require('@babel/parser');
const root=path.resolve(__dirname,'..');
const names=[
 'src/screens/MenuScreen.js',
 'src/screens/ContinueReadingScreen.js',
 'src/i18n/translations.js',
 'src/i18n/traditionalUi.js',
 'src/services/continueReadingDisplay.js',
 'src/services/localizedContent.js',
 'src/services/bibleUi.js',
 'src/services/traditionalUiTypography.js',
];
function assert(condition,message){if(!condition)throw Error(message)}
function requireText(file){
 const full=path.join(root,file);
 assert(fs.existsSync(full),'Missing '+file);
 const content=fs.readFileSync(full,'utf8');
 parse(content,{sourceType:'module',plugins:['jsx']});
 return content;
}
try{
 const entries=Object.fromEntries(names.map(name=>[name,requireText(name)]));
 const home=entries['src/screens/MenuScreen.js'];
 const screen=entries['src/screens/ContinueReadingScreen.js'];
 const lang=entries['src/i18n/translations.js'];
 const trad=entries['src/i18n/traditionalUi.js'];
 const helper=entries['src/services/continueReadingDisplay.js'];
 assert(home.includes('getCslBibleBookName(book)') &&
  home.includes('formatBibleNumber(calendarLanguage, chapterNumber)'),
  'Home Bible title / chapter numerals not localized');
 assert(home.includes("getProgressEntityTitle(rule, 'name', calendarLanguage, t)"),
  'Home prayer rule title not localized');
 assert(home.includes("traditionalUiTextStyle(calendarLanguage, 17 * uiScale"),
  'Home Continue Reading heading not styled for Ponomar');
 assert(screen.includes("title={t('continueReading.title')}"),
  'Continue Reading screen header not translated');
 assert(screen.includes("type: t('reading.prayerRule')") &&
  screen.includes("getCslBibleBookName(book)") &&
  screen.includes("getProgressEntityTitle(rule, 'name', language, t)") &&
  screen.includes("t('continueReading.emptyText')"),
  'Continue Reading screen contains old localization logic');
 assert(lang.includes("emptyTitle: 'Начатых чтений пока нет'") &&
  lang.includes("emptyTitle: 'Розпочатих читань поки немає'") &&
  trad.includes("emptyTitle:'Нача́тыхъ чте́нїй ещѐ нѣ́сть'"),
  'Empty-state translation missing in RU / UK / CS');
 assert(helper.includes("posledovanie-ko-svyatomu-prichashcheniyu") &&
  helper.includes("t('communion.sequence')"),
  'Explicit Church Slavonic Communion title mapping missing');
 assert(home.includes('getReadingProgress()') &&
  screen.includes('getReadingProgress()') &&
  screen.includes("navigation.navigate('PrayerRule', {slug: rule.slug})"),
  'Existing progress or resume routing changed');
 console.log('PASS: 8 JS modules parsed; RU, UK, CS titles and all reading types localized.');
 console.log('PASS: Communion name, Ponomar, stored progress and navigation intact.');
}catch(error){
 console.error('STOP:',error.message);
 process.exit(1);
}
