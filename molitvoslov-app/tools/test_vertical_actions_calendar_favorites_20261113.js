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
assert.match(sheet, /Удалить из избранного/);
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
assert.match(favorites, /title: 'Удалить из избранного\?'/);
assert.match(favorites, /showShareFeedback\(\{/);
assert.doesNotMatch(favorites, /styles\.pinButton|styles\.deleteButton/);
assert.doesNotMatch(favorites, /onPress=\{\(\) => removeItem\(item\.id\)\}/);
console.log('PASS: vertical menus in calendar and saint, unified favorites actions and confirmation');
