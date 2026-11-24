#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = file => fs.readFileSync(path.join(__dirname,'..',file),'utf8');

const whole = source('src/components/reader/CalendarSaveText.js');
assert.match(whole, /<Feather name="more-vertical"/);
assert.doesNotMatch(whole, /<Feather name="more-horizontal"/);
assert.match(whole, /menuVariant\?\(\)=>setActionOpen\(true\):toggle/);
assert.match(whole, /onShare=\{onShare\}/);
assert.match(whole, /onSave=\{toggle\}/);

for (const screen of ['src/screens/ChurchCalendarScreen.js',
  'src/screens/SaintDetailScreen.js']) {
  const content = source(screen);
  assert.match(content, /<CalendarSaveWholeButton/);
  assert.match(content, /\bmenuVariant\b/);
  assert.match(content, /onShare=\{/);
  assert.match(content, /actionsRef\.current\?\.openMenu\(\)/);
}

const sheet=source('src/components/share/ContentContextMenu.js');
assert.match(sheet, /onDelete=null/);
// The delete label may be passed directly from t(), or prepared as
// deleteLabel (for context-dependent menu labels). Both retain the same
// deletion callback; don't enforce one implementation detail.
const directDelete=/\{item\(t\('contextActions\.delete'\),'trash-outline',onDelete,true\)\}/.test(sheet);
const namedDelete=/\{item\(deleteLabel,'trash-outline',onDelete,true\)\}/.test(sheet);
assert.ok(directDelete || namedDelete,
  'Delete action must be present with trash icon and onDelete callback');
if (namedDelete) {
  const declaredLocally=/\b(?:const|let)\s+deleteLabel\s*=/.test(sheet);
  const receivedAsProp=/\bdeleteLabel\s*(?:=[^,}]*|,|\})/.test(
    sheet.slice(sheet.indexOf('export const ContentContextMenu ='), sheet.indexOf('=> {'))
  );
  assert.ok(declaredLocally || receivedAsProp,
    'deleteLabel must be declared or received as a prop before use');
}
assert.match(sheet, /trash-outline/);
assert.match(sheet, /onPin/);
assert.match(sheet, /onSave/);
assert.match(sheet, /onShare/);

const favorites=source('src/screens/FavoritesScreen.js');
assert.match(favorites, /name="ellipsis-vertical"/);
assert.match(favorites, /onPress=\{\(\) => setContextItem\(item\)\}/);
assert.match(favorites, /onLongPress=\{\(\) => setContextItem\(item\)\}/);
assert.match(favorites, /onDelete=\{contextItem \? \(\)=>confirmRemoveItem\(contextItem\)/);
assert.match(favorites, /onShare=\{contextItem \? \(\)=>shareSavedItem\(contextItem\)/);
assert.match(favorites, /onPin=\{contextItem \? \(\)=>togglePin\(contextItem\)/);
assert.match(favorites, /title: t\('favoritesExtra\.deleteQuestion'\)/);
assert.match(favorites, /message: t\('favoritesExtra\.deleteDescription'/);
assert.match(favorites, /onConfirm: \(\) => removeItem\(item\.id\)/);
// The visible labels are localized. Verify the real translations, not an
// obsolete Russian string literal in a React component.
const completionSource=source('src/i18n/interfaceCompletion.js');
const completion=new Function(
  completionSource.replace('export const INTERFACE_COMPLETION =','const INTERFACE_COMPLETION =')+
  '\nreturn INTERFACE_COMPLETION;'
)();
assert.equal(completion.ru.contextActions.delete,'Удалить из избранного');
assert.equal(completion.ru.favoritesExtra.deleteQuestion,'Удалить из избранного?');
assert.equal(completion.uk.favoritesExtra.deleteQuestion,'Видалити з обраного?');
for (const lang of ['ru','uk','csl_traditional']) {
  for (const key of ['deleteQuestion','deleteDescription','cancel','delete']) {
    assert.ok(completion[lang]?.favoritesExtra?.[key],
      'Missing '+lang+'.favoritesExtra.'+key);
  }
  assert.ok(completion[lang]?.contextActions?.delete,
    'Missing '+lang+'.contextActions.delete');
}
assert.match(favorites, /showShareFeedback\(\{/);
assert.doesNotMatch(favorites, /styles\.pinButton|styles\.deleteButton/);
assert.doesNotMatch(favorites, /onPress=\{\(\) => removeItem\(item\.id\)\}/);
console.log('PASS: vertical menus in calendar and saint, unified favorites actions and confirmation');
