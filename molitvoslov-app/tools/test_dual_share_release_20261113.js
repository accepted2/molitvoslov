#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const contains=(file,regex)=>assert.match(read(file),regex, file+' must match '+regex);

// List screens: two independently tappable controls on published texts.
const akathists=read('src/screens/AkathistListScreen.js');
assert.doesNotMatch(akathists,/LinearGradient/);
assert.match(akathists,/rightContent=\{/);
assert.match(akathists,/\bcompact\b/);
assert.match(akathists,/onHeaderHeightChange=\{setHeaderHeight\}/);
assert.match(akathists,/name="share-social-outline"/);
assert.match(akathists,/SaveHeartIcon active=\{saved\}/);
const canons=read('src/screens/CanonListScreen.js');
assert.match(canons,/name="share-social-outline"/);
assert.match(canons,/SaveHeartIcon active=\{saved\}/);
const misc=read('src/screens/MiscPrayersScreen.js');
assert.match(misc,/name="share-social-outline"/);
assert.match(misc,/SaveHeartIcon active=\{/);
assert.match(misc,/!item\.row\.text\?\.is_placeholder/);
assert.match(misc,/toggleTextFavorite/);

// General WebView reader: hearts and share buttons remain distinct.
// Compile the embedded runtime to catch syntax errors inside String.raw.
const source=read('src/components/reader/selectableDocumentReader/runtime.js');
const runtime=new Function(source.replace('export const READER_RUNTIME',
  'const READER_RUNTIME')+'\nreturn READER_RUNTIME;')();
new vm.Script(runtime,{filename:'selectable-reader-runtime.js'});
assert.match(runtime,/share-section/);
assert.match(runtime,/createShareButton\('section',sectionIndex\)/);
assert.match(runtime,/hours-accordion-save/);
const css=read('src/components/reader/selectableDocumentReader/styles.js');
assert.match(css,/inline-share-action/);
assert.match(css,/section-header\.has-share-action/);
assert.match(css,/hours-accordion-save/);
const reader=read('src/components/reader/SelectableDocumentReader.js');
assert.match(reader,/message\.type === 'share-section'/);
assert.match(reader,/resolveSelectedShareTarget\(first\)/);
assert.match(reader,/await shareContent\(\{title,text/);

// Prayer rules have separate heart/share actions per prayer.
const rules=read('src/components/reader/PrayerRuleReader.js');
assert.match(rules,/makePrayerShareButton\(item\.id\)/);
assert.match(rules,/type:'share-prayer'/);
assert.match(rules,/message\.type === 'share-prayer'/);
assert.match(rules,/screen:'PrayerRule',params:\{slug:rule\.slug\}/);
assert.doesNotMatch(rules,/shareImportableContent/);

// Hours favorites use a supported SavedItem type and are reopenable.
const hours=read('src/screens/HoursReadingScreen.js');
assert.match(hours,/save_type:'section',source_type:'hours'/);
assert.match(hours,/onAction=\{handleSectionAction\}/);
assert.match(hours,/anchor_type:'hours_section'/);
contains('src/screens/FavoritesScreen.js',/item\.source_type === 'hours'/);
contains('src/services/contentSharing.js',/entryId:meta\.entry_id\|\|meta\.entryId/);

// Smaller three-dot actions for saints and favorites.
contains('src/components/reader/CalendarSaveText.js',/saveButtonCompact:\{width:30,height:30/);
contains('src/screens/FavoritesScreen.js',/minWidth:32,minHeight:32/);

// Build code is incremented, and the Windows build helper is present.
const config=JSON.parse(read('app.json'));
assert.equal(config.expo.version,'1.0.27');
assert.equal(config.expo.android.versionCode,28);
assert.ok(fs.existsSync(path.join(__dirname,'build-release-and-smoke-20261113.ps1')));
console.log('PASS: paired save/share controls, akathist header, hours favorites, runtime syntax, APK build preparation');
