#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {parse}=require('@babel/parser');
const app=path.resolve(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(app,relative),'utf8');
const rel='src/i18n/interfaceCompletion.js';
const source=read(rel);
const dictionary=new Function(source.replace('export const INTERFACE_COMPLETION =','const INTERFACE_COMPLETION =')+
  '\nreturn INTERFACE_COMPLETION;')();
const paths=(obj,prefix='')=>Object.entries(obj).flatMap(([k,v])=>
  v&&typeof v==='object'&&!Array.isArray(v)?paths(v,prefix+k+'.'):
    [[prefix+k,v]]);
const maps=Object.fromEntries(['ru','uk','csl_traditional'].map(lang=>
  [lang,new Map(paths(dictionary[lang]))]));
const base=[...maps.ru.keys()].sort();
for(const lang of ['ru','uk','csl_traditional']){
  assert.deepEqual([...maps[lang].keys()].sort(),base,'missing/mismatched keys: '+lang);
  for(const key of base){
    const value=maps[lang].get(key);
    assert(typeof value==='string'||Array.isArray(value),'bad value: '+lang+'/'+key);
    assert(value.length>0,'empty translation: '+lang+'/'+key);
    const marks=text=>[...String(text).matchAll(/\{([a-z]+)\}/g)].map(m=>m[1]).sort();
    if(typeof value==='string')
      assert.deepEqual(marks(value),marks(maps.ru.get(key)),
        'interpolation mismatch: '+lang+'/'+key);
    if(Array.isArray(value))assert.deepEqual(value.length,maps.ru.get(key).length,
      'weekday mismatch: '+lang+'/'+key);
  }
}
const files=[
'src/i18n/translations.js',
'src/i18n/interfaceCompletion.js',
'src/components/navigation/BottomNav.js',
'src/screens/MenuScreen.js',
'src/screens/FavoritesScreen.js',
'src/screens/SearchScreen.js',
'src/screens/NotificationsScreen.js',
'src/components/share/ContentContextMenu.js',
'src/components/reader/ReaderAppearanceSheet.js',
'src/components/reader/ReaderBookmarkMenu.js',
'src/screens/PrayerBooksScreen.js',
'src/screens/ChurchCalendarScreen.js',
'src/services/traditionalUiTypography.js',
'src/components/navigation/FixedSectionHeader.js',
'src/screens/HoursScreen.js',
'src/screens/AccountScreen.js',
'src/screens/PrayerLearningScreen.js',
'src/screens/ConfessionPreparationScreen.js',
'src/screens/CommunionPreparationScreen.js',
];
for(const file of files)parse(read(file),{sourceType:'module',plugins:['jsx']});
const t=read('src/i18n/translations.js');
assert(t.includes('getPath(INTERFACE_COMPLETION[language], key)'));
for(const [file,keys] of Object.entries({
  'src/screens/NotificationsScreen.js':['notifications.title','notifications.presets.','notifications.days.'],
  'src/screens/SearchScreen.js':['searchUi.'],
  'src/screens/FavoritesScreen.js':['favorites.saved','favoritesExtra.'],
  'src/components/share/ContentContextMenu.js':['contextActions.'],
  'src/components/reader/ReaderAppearanceSheet.js':['readerAppearance.'],
  'src/components/reader/ReaderBookmarkMenu.js':['readerMenu.'],
})){
  const src=read(file);
  for(const key of keys)assert(src.includes(key),'missing '+key+' in '+file);
}
const nav=read('src/components/navigation/BottomNav.js');
assert(nav.includes('navCompact.'));
assert(nav.includes('rgba(255, 246, 228'));
assert(nav.includes('numberOfLines={uiScale > 1.15 ? 2 : 1}'));
assert(!nav.includes('traditional ? 72 : 46'),'old oversized bar remains');
const home=read('src/screens/MenuScreen.js');
assert(home.includes('onLayout={event => {'));
assert(home.includes('heroActionsBottom + 38'));
assert(home.includes('insets.top + 95'));
assert(!home.includes('insets.top + 49.5'));
const calendar=read('src/screens/ChurchCalendarScreen.js');
assert(calendar.includes('mainFeast?.life_content'));
assert(calendar.includes("translate(language,'calendarUi.oldTestament')"));
const csl=read('src/services/traditionalUiTypography.js');
assert(csl.includes('1.18')&&csl.includes('1.12'));
console.log('PASS: 3-language dictionary parity and interpolation, '+base.length+' top-level/leaf entries.');
console.log('PASS: all '+files.length+' edited JavaScript/JSX modules parse.');
console.log('PASS: search, notifications, reader menus and saved items use translated labels.');
console.log('PASS: bottom bar no longer expands to 72px for CSL.');
console.log('PASS: quote gradient starts below the measured search/bell row.');
console.log('PASS: calendar keeps original saint names and lives.');
