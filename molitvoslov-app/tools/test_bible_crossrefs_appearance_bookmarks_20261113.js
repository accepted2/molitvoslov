#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const app=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const bible=app('src/screens/BibleChapterScreen.js');
const sheet=app('src/components/reader/BibleCrossReferencesSheet.js');
const account=app('src/screens/AccountScreen.js');
const bookmarkMenu=app('src/components/reader/ReaderBookmarkMenu.js');
const reader=app('src/components/reader/SelectableDocumentReader.js');
const readerCss=app('src/components/reader/selectableDocumentReader/styles.js');
const runtimeSource=app('src/components/reader/selectableDocumentReader/runtime.js');

// Cross-references: draggable from the handle, scrollable cards in a distinct frame.
assert.match(sheet,/onStartShouldSetPanResponder:\s*\(\) => true/);
assert.match(sheet,/onPanResponderRelease:/);
assert.match(sheet,/move\.dy > 60/);
assert.match(sheet,/persistentScrollbar/);
assert.match(sheet,/showsVerticalScrollIndicator/);
assert.match(sheet,/nestedScrollEnabled/);
assert.match(sheet,/styles\.scrollPane/);
assert.match(sheet,/styles\.referenceNight/);
assert.match(sheet,/Листайте вниз, чтобы увидеть другие места/);
assert.doesNotMatch(sheet,/Linking\.openURL/);
assert.doesNotMatch(sheet,/<Text style=\{\[styles\.license/);

// Source attribution remains accessible outside the reference modal.
assert.match(account,/Источники и лицензии/);
assert.match(account,/OpenBible\.info \(CC BY 4\.0\)/);
assert.match(account,/Catholic Cross References/);
assert.match(account,/STEP Bible \/ Tyndale House/);
assert.match(account,/Церковнославянский'/);
assert.doesNotMatch(account,/Елизаветинская Библия/);
assert.match(account,/privacy-policy\//);
assert.match(account,/account-deletion\//);

// Same independent scoped appearance controls as other reading screens.
assert.match(bible,/useScopedReaderAppearance\('bible'/);
assert.match(bible,/<ReaderAppearanceSheet/);
assert.match(bible,/appearance=\{appearance\}/);
assert.match(bible,/onChange=\{changeAppearance\}/);
assert.match(bible,/onReset=\{resetAppearance\}/);
assert.match(bible,/readerRef\.current\?\.applyBookAppearance\(appearance\)/);
assert.match(bible,/name="color-palette-outline"/);
assert.doesNotMatch(bible,/fontPanelVisible/);
assert.match(reader,/applyBookAppearance: \(appearance\) =>/);
assert.match(reader,/isDarkReaderBackground\(next\.background\)/);
assert.match(readerCss,/var\(--book-paper,#FBF0D9\)/);
assert.match(readerCss,/var\(--book-body-color,#3C2A20\)/);
const runtime=new Function(runtimeSource.replace('export const READER_RUNTIME',
  'const READER_RUNTIME')+'\nreturn READER_RUNTIME;')();
new vm.Script(runtime,{filename:'reader-runtime.js'});
assert.match(runtime,/const setBookAppearance = settings =>/);
assert.match(runtime,/setBookAppearance: settings => setBookAppearance\(settings\)/);
assert.match(runtime,/Math\.min\(28, Number\(rawSize\)/);

// Bookmark turns solid only when saved at the current location.
assert.match(bible,/isCurrentPlaceBookmarked/);
assert.match(bible,/name=\{isCurrentPlaceBookmarked\?'bookmark':'bookmark-outline'\}/);
assert.match(bible,/Number\(item\.anchor_id\)===displayedBookmarkAnchor/);
assert.match(bible,/setSavedItems\(current=>\[saved,\.\.\.current\]\)/);
assert.match(bible,/openBookmarksLabel="Открыть все закладки"/);
assert.match(bookmarkMenu,/openBookmarksLabel \|\| t\('bookmarkMenu\.openPlaces'\)/);
console.log('PASS: Bible crossref scroll/close, license relocation, palette/size, filled bookmark and menu label');
