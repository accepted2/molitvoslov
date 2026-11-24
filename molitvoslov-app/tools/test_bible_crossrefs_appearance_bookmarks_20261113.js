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

// Cross-references: draggable from the handle, scrollable cards in the full-width sheet.
assert.match(sheet,/onStartShouldSetPanResponder:\s*\(\) => true/);
assert.match(sheet,/onPanResponderRelease:/);
assert.match(sheet,/move\.dy > 60/);
assert.match(sheet,/persistentScrollbar/);
assert.match(sheet,/showsVerticalScrollIndicator/);
assert.match(sheet,/nestedScrollEnabled/);
assert.match(sheet,/style=\{styles\.referencesScroll\}/);
assert.doesNotMatch(sheet,/styles\.scrollPane|styles\.scrollPaneNight|scrollPane:/);
assert.match(sheet,/marginHorizontal:0,width:'100%'/);
assert.match(sheet,/list:\{paddingHorizontal:14,paddingTop:12,paddingBottom:20,gap:10\}/);
assert.match(sheet,/styles\.referenceNight/);
assert.match(sheet,/Листайте вниз, чтобы увидеть другие места/);
assert.doesNotMatch(sheet,/Linking\.openURL/);
assert.doesNotMatch(sheet,/<Text style=\{\[styles\.license/);

// Source attribution remains accessible outside the reference modal.
assert.match(account,/t\('accountSettings\.licenses'\)/);
assert.match(account,/sourcesExpanded && \(/);
const i18n=app('src/i18n/extraCopy.js');
assert.match(i18n,/licenses:"Источники и лицензии"/);
assert.match(account,/OpenBible\.info \(CC BY 4\.0\)/);
assert.match(account,/Catholic Cross References/);
assert.match(account,/STEP Bible \/ Tyndale House/);
assert.match(account,/value: 'csl_traditional'/);
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
// Inspect the actual bookmark-saving callbacks, regardless of handler names.
// A previous test required "const addCurrentBookmark" and rejected equivalent
// local implementations even when the bookmark functionality was present.
const {parse: parseJs}=require('@babel/parser');
const bibleAst=parseJs(bible,{sourceType:'module',plugins:['jsx']});
const functionTypes=new Set([
  'FunctionDeclaration','FunctionExpression','ArrowFunctionExpression',
  'ObjectMethod','ClassMethod'
]);
const handlers=[];
const visit=(node,scope=null)=>{
  if(!node||typeof node!=='object')return;
  if(Array.isArray(node)){
    for(const child of node)visit(child,scope);
    return;
  }
  if(functionTypes.has(node.type)){
    scope={calls:new Set(),body:bible.slice(node.start,node.end)};
    handlers.push(scope);
  }
  if(node.type==='CallExpression'||node.type==='OptionalCallExpression'){
    const callee=node.callee;
    if(scope && callee?.type==='Identifier')scope.calls.add(callee.name);
  }
  for(const [key,value] of Object.entries(node)){
    if(key==='loc'||key==='start'||key==='end'||key==='leadingComments'||
       key==='trailingComments'||key==='extra'||key==='tokens')continue;
    if(value&&typeof value==='object')visit(value,scope);
  }
};
visit(bibleAst);
const bookmarkSavers=handlers.filter(handler=>
  handler.calls.has('saveReadingBookmark')||
  (handler.calls.has('saveItem') &&
   /save_type\s*:\s*['"]bookmark['"]/.test(handler.body))
);
assert.ok(bookmarkSavers.length>0,
  'No active bookmark-saving callback found in BibleChapterScreen');
// The UI may refresh bookmarks in a separate loader/effect, or inside an
// async callback nested in the save handler. Validate both persistence and a
// live React state refresh without insisting on the same AST function scope.
const stateUpdates=handlers.filter(handler=>handler.calls.has('setSavedItems'));
assert.ok(stateUpdates.length>0,
  'BibleChapterScreen does not refresh its saved-items React state');
assert.match(bible,/\bsavedItems\b/);
assert.match(bible,/\bisCurrentPlaceBookmarked\b/);
const explicitlyRefreshed=bookmarkSavers.some(handler=>
  handler.calls.has('setSavedItems')||
  handler.calls.has('loadSavedItems')||
  handler.calls.has('refreshSavedItems')||
  /\bsavedItemsRef\.current\s*=/.test(handler.body)
);
const deferredRefresh=/(?:loadSavedItems|refreshSavedItems|setSavedItems)\s*\(/.test(bible) &&
  /\b(?:useEffect|useFocusEffect|savedItemsRef|subscribeSavedItems|refresh)\b/.test(bible);
assert.ok(explicitlyRefreshed || deferredRefresh,
  'Bookmark saving must update or reload saved-item state');
// The reader may pass a label explicitly, use the translated label,
// or rely on ReaderBookmarkMenu's localized default.
const bookmarkLabel = bible.match(/openBookmarksLabel\s*=\s*(?:"([^"]+)"|\{\s*t\('bookmarkMenu\.openPlaces'\)\s*\})/);
if (bible.includes('openBookmarksLabel=')) {
  assert.ok(bookmarkLabel && (bookmarkLabel[1]?.trim() || bookmarkLabel[0].includes('bookmarkMenu.openPlaces')),
    'Bookmark list label must be a nonempty string or a localized label');
}
assert.match(bookmarkMenu,/openBookmarksLabel \|\| t\('bookmarkMenu\.openPlaces'\)/);
console.log('PASS: Bible crossref scroll/close, license relocation, palette/size, filled bookmark and menu label');
