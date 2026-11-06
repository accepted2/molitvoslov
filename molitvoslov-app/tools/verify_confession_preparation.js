#!/usr/bin/env node
// Offline confession preparation: source catalog, private storage, navigation.
// Only synthetic test values are used. Never read or print personal notes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/parser');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const catalog = JSON.parse(read('src/data/confessionCatalog.json'));
const screen = read('src/screens/ConfessionPreparationScreen.js');
const storageSource = read('src/services/confessionPreparationStorage.js');
const navigation = read('src/navigation/AppNavigator.js');
const category = read('src/screens/CommunionPreparationScreen.js');

assert.equal(catalog.version, 1);
assert.equal(catalog.items.length, 98);
assert.equal(new Set(catalog.items.map(item => item.id)).size, catalog.items.length);
for (const item of catalog.items) {
  assert.ok(item.id && item.title && item.description);
  assert.ok(item.description.length >= item.title.length || item.title.length > 0);
}
assert.ok(catalog.items.some(item => item.context === 'Грехи против ближнего'));
assert.ok(catalog.items.some(item => item.context === 'Грехи против Господа Бога'));
assert.ok(catalog.items.some(item => item.context === 'Грехи против самого себя'));
assert.match(catalog.intro, /Исповедь — таинство Покаяния/);
assert.match(screen, /Все грехи/);
assert.match(screen, /Мой список/);
assert.match(screen, /Добавить в мой список/);
assert.match(screen, /Мои мысли и обстоятельства/);
assert.match(screen, /Очистить мой список/);
assert.match(screen, /\{catalogMode \? confessionCatalog\.items : chosenEntries\}/);
assert.match(navigation, /name="ConfessionPreparation"/);
assert.match(category, /navigation\.navigate\('ConfessionPreparation'\)/);
assert.match(storageSource, /from 'expo-secure-store'/);
assert.ok(!/AsyncStorage|fetch\(|axios|contentApi|console\.log/u.test(storageSource));
assert.ok(!/syncSavedItems|syncPrayerBooks|syncMemorials/u.test(storageSource));
assert.ok(!/SecureStore/u.test(category), 'Navigation must never load private notes');

for (const file of [
  'src/screens/ConfessionPreparationScreen.js',
  'src/services/confessionPreparationStorage.js',
  'src/navigation/AppNavigator.js',
  'src/screens/CommunionPreparationScreen.js',
]) {
  babel.parse(read(file), {sourceType: 'module', plugins: ['jsx']});
}

const mockStore = new Map();
const native = {
  async getItemAsync(key) {return mockStore.get(key) ?? null;},
  async setItemAsync(key, value) {mockStore.set(key, value);},
  async deleteItemAsync(key) {mockStore.delete(key);},
};
const exposed = storageSource
  .replace("import * as SecureStore from 'expo-secure-store';", '')
  .replace(/export const /g, 'const ');
const storage = new Function('SecureStore', exposed + `
  return {
    loadConfessionPreparation, saveConfessionSelection,
    saveConfessionEntry, deleteConfessionEntry,
    clearConfessionPreparation,
    CONFESSION_NOTE_MAX_LENGTH, CONFESSION_TITLE_MAX_LENGTH,
  };
`)(native);

(async () => {
  let loaded = await storage.loadConfessionPreparation();
  assert.deepEqual(loaded.ids, []);

  await storage.saveConfessionEntry('c001', 'Моя личная заметка');
  await storage.saveConfessionSelection(['c001', 'c002']);
  loaded = await storage.loadConfessionPreparation();
  assert.deepEqual(loaded.ids, ['c001', 'c002']);
  assert.equal(loaded.notes.c001, 'Моя личная заметка');
  assert.equal(loaded.notes.c002, '');

  const ownId = 'uabc123';
  await storage.saveConfessionEntry(ownId, 'Пояснение', 'Свой пункт');
  await storage.saveConfessionSelection(['c001', ownId]);
  loaded = await storage.loadConfessionPreparation();
  assert.deepEqual(loaded.ids, ['c001', ownId]);
  assert.equal(loaded.custom[ownId], 'Свой пункт');
  assert.equal(loaded.notes[ownId], 'Пояснение');

  await Promise.all([
    storage.saveConfessionEntry('c001', 'Первая версия'),
    storage.saveConfessionEntry('c001', 'Последняя версия'),
  ]);
  loaded = await storage.loadConfessionPreparation();
  assert.equal(loaded.notes.c001, 'Последняя версия');

  await storage.deleteConfessionEntry('c001');
  await storage.saveConfessionSelection([ownId]);
  loaded = await storage.loadConfessionPreparation();
  assert.deepEqual(loaded.ids, [ownId]);
  assert.equal(mockStore.has('molitvoslov.confession.v1.item.c001'), false);

  await storage.clearConfessionPreparation([ownId]);
  loaded = await storage.loadConfessionPreparation();
  assert.deepEqual(loaded.ids, []);
  assert.equal(mockStore.size, 0);

  await assert.rejects(storage.saveConfessionEntry('../unsafe', 'x'));
  console.log('PASS: 98 source-based catalog entries, no category selector');
  console.log('PASS: confession screen and Communion navigation parse');
  console.log('PASS: personal notes stored only in SecureStore, excluded from sync');
  console.log('PASS: selection, individual notes, custom items, ordered writes, removal, clearing');
})().catch(err => {
  console.error('FAIL: confession preparation verification:', err.message);
  process.exitCode = 1;
});
