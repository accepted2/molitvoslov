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
const document = JSON.parse(read('src/data/confessionDocument.json'));
const screen = read('src/screens/ConfessionPreparationScreen.js');
const storageSource = read('src/services/confessionPreparationStorage.js');
const navigation = read('src/navigation/AppNavigator.js');
const category = read('src/screens/CommunionPreparationScreen.js');
const header = read('src/components/navigation/FixedSectionHeader.js');
const readingChrome = read('src/hooks/useReadingChrome.js');

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
assert.equal(document.version, 1);
assert.ok(document.blocks.length >= 115);
assert.ok(document.entries.length >= 400);
const atomIds = new Set(document.entries.map(item => item.id));
assert.equal(atomIds.size, document.entries.length);
assert.ok([...atomIds].every(id => /^s\d{4}$/u.test(id)));
assert.ok(document.blocks.some(block => block.type === 'heading' &&
  /Первая заповедь/u.test(block.text)));
assert.ok(document.blocks.some(block => block.type === 'heading' &&
  /Грехи против ближнего/u.test(block.text)));
const paragraphs = document.blocks.filter(block => block.type === 'paragraph');
assert.ok(paragraphs.length >= 98);
for (const paragraph of paragraphs) {
  assert.ok(paragraph.segments.length >= 1);
  assert.ok(paragraph.segments.every(segment => atomIds.has(segment.id)));
}
const opening = paragraphs[0].segments;
assert.equal(opening[0].text.trim(), 'маловерием,');
assert.equal(opening[1].text.trim(), 'неверием,');
assert.notEqual(opening[0].id, opening[1].id,
  'An individual sin must be selectable without adding the whole paragraph');
assert.ok(document.entries.every(item => !item.description),
  'Individual selected sins should not import unrelated sins in their explanation');
assert.ok(document.blocks.every(block => block.type !== 'paragraph' ||
  block.segments.every(segment => !/^[#]{3}\s/u.test(segment.text))),
  'Themed headings must be rendered as headings, never selectable sins');
assert.ok(document.blocks.filter(block => block.type === 'heading').length >= 20);
assert.ok(document.entries.some(item =>
  item.title === 'Посещением гуляний, театра, кино под великие праздники'));
assert.ok(document.entries.some(item => item.title === 'чтение порнографических книг, журналов'));

assert.match(screen, /Все грехи/);
assert.match(screen, /Мой список/);
assert.match(screen, /Добавить в мой список/);
assert.match(screen, /Мои мысли и обстоятельства/);
assert.match(screen, /Очистить мой список/);
assert.match(screen, /const source = catalogMode \? confessionDocument\.blocks : chosenEntries/);
// Reading mode: keep the source as one text, left-aligned headings and
// justified paragraphs, while preserving the original tappable phrases.
assert.match(screen, /documentHeading:\s*\{[^}]*textAlign: 'left'/s);
assert.match(screen, /documentParagraph:\s*\{[^}]*textAlign: 'justify'/s);
assert.match(screen, /android_hyphenationFrequency="normal"/);
assert.match(screen, /textBreakStrategy="highQuality"/);
assert.ok(!screen.includes("Текст читается одним целым"));
assert.ok(!screen.includes("+ Свой пункт"));
assert.match(screen, /addingCustom \? 'Отмена' : '\+ Добавить'/);
// Explicit persistent native scrollbar on Android, both screens continue
// using the same FlatList. No extra scroll-to-top is required to switch.
assert.match(screen, /showsVerticalScrollIndicator=\{true\}/);
assert.match(screen, /persistentScrollbar=\{catalogMode\}/);
assert.match(screen, /scrollEventThrottle=\{16\}/);
assert.match(screen, /onScroll=\{handleNativeReadingScroll\}/);
assert.match(screen, /useReadingChrome\(\)/);
assert.match(screen, /handleReadingScroll\('top'\)/);
assert.match(screen, /readingHidden=\{readingChromeHidden\}/);
assert.match(screen, /headerAction=\{\{[\s\S]*?label: catalogMode \? 'Мой список' : 'Все грехи'/);
assert.match(screen, /onPress: \(\) => switchView\(catalogMode \? 'mine' : 'catalog'\)/);
assert.match(header, /headerAction = null/);
assert.match(header, /accessibilityLabel=\{headerAction\.accessibilityLabel \|\| headerAction\.label\}/);
assert.match(header, /onPress=\{headerAction\.onPress\}/);
assert.match(header, /styles\.headerActionButton/);
assert.match(readingChrome, /direction === 'down'/);
assert.match(readingChrome, /direction === 'up'/);
// Confession notes must be legible on solid cream paper, never on the home
// illustration; header and status bar also use the reader's light scheme.
assert.ok(!screen.includes("import {AppBackground}"));
assert.ok(!screen.includes("<AppBackground"));
assert.ok(!screen.includes("imageOpacity="));
assert.match(screen, /page:\s*\{flex: 1, backgroundColor: '#FFF4DE'\}/);
assert.match(screen, /screen:\s*\{flex: 1, backgroundColor: '#FFF4DE'\}/);
assert.match(screen, /gradientColor="#FFF4DE"/);
assert.match(screen, /<StatusBar style="dark" translucent backgroundColor="transparent"/);
assert.match(screen, /onPress=\{\(\) => openSinMenu\(segment\.id\)\}/);
// Selecting one phrase must open the styled in-app dialog, never the
// platform's default white/teal Android Alert box.
assert.match(screen, /import \{[\s\S]*?Modal,[\s\S]*?\} from 'react-native'/);
assert.match(screen, /const \[menuSinId, setMenuSinId\] = useState\(null\)/);
assert.match(screen, /const openSinMenu = useCallback\(id => \{\s*if \(CATALOG_BY_ID\[id\]\) setMenuSinId\(id\)/);
assert.ok(!/Alert\.alert\(\s*item\.title/u.test(screen));
assert.match(screen, /visible=\{!!menuSin\}/);
assert.match(screen, /animationType="fade"/);
assert.match(screen, /onRequestClose=\{closeSinMenu\}/);
assert.match(screen, /onPress=\{closeSinMenu\}/);
assert.match(screen, /onPress=\{confirmSinMenu\}/);
assert.match(screen, /selectedRef\.current\.includes\(menuSinId\)/);
assert.match(screen, /menuAlreadySelected \? 'Убрать из моего списка' : 'Добавить в мой список'/);
assert.match(screen, /sinMenuCard:\s*\{[^}]*backgroundColor: '#FFF4DE'/s);
assert.match(screen, /sinMenuOverlay:\s*\{[^}]*backgroundColor: 'rgba\(32, 21, 13, 0\.52\)'/s);
assert.match(screen, /sinMenuConfirm:\s*\{[^}]*backgroundColor: '#795036'/s);
assert.match(screen, /keyExtractor=\{\(item, index\) => item\.id \|\| 'doc-' \+ index\}/);
assert.match(screen, /\.\.\.confessionCatalog\.items/);
assert.match(screen, /\.\.\.confessionDocument\.entries/);
assert.ok(!screen.includes('renderCatalogItem'));
assert.match(navigation, /name="ConfessionPreparation"/);
assert.match(category, /navigation\.navigate\('ConfessionPreparation'\)/);
assert.match(storageSource, /from 'expo-secure-store'/);
assert.ok(!/AsyncStorage|fetch\(|axios|contentApi|console\.log/u.test(storageSource));
assert.ok(!/syncSavedItems|syncPrayerBooks|syncMemorials/u.test(storageSource));
assert.ok(!/SecureStore/u.test(category), 'Navigation must never load private notes');

for (const file of [
  'src/screens/ConfessionPreparationScreen.js',
  'src/components/navigation/FixedSectionHeader.js',
  'src/hooks/useReadingChrome.js',
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

  // Old grouped selections remain loadable, new individual phrases use s****.
  await storage.saveConfessionEntry('c001', 'Моя личная заметка');
  await storage.saveConfessionEntry('s0002', 'Конкретный грех');
  await storage.saveConfessionSelection(['c001', 'c002', 's0002']);
  loaded = await storage.loadConfessionPreparation();
  assert.deepEqual(loaded.ids, ['c001', 'c002', 's0002']);
  assert.equal(loaded.notes.s0002, 'Конкретный грех');
  assert.equal(loaded.notes.c001, 'Моя личная заметка');
  assert.equal(loaded.notes.c002, '');

  const ownId = 'uabc123';
  await storage.saveConfessionEntry(ownId, 'Пояснение', 'Свой пункт');
  await storage.saveConfessionSelection(['c001', 's0002', ownId]);
  loaded = await storage.loadConfessionPreparation();
  assert.deepEqual(loaded.ids, ['c001', 's0002', ownId]);
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

  await storage.clearConfessionPreparation([ownId, 's0002']);
  loaded = await storage.loadConfessionPreparation();
  assert.deepEqual(loaded.ids, []);
  assert.equal(mockStore.size, 0);

  await assert.rejects(storage.saveConfessionEntry('../unsafe', 'x'));
  console.log('PASS: source text is continuous, ' + document.entries.length + ' individual selectable phrases');
  console.log('PASS: existing grouped selections retained without losing prior notes');
  console.log('PASS: confession screen and Communion navigation parse');
  console.log('PASS: plain cream background and legible reader-style header, no home artwork');
  console.log('PASS: themed cream in-app confession dialog, native alert removed for sin selection');
  console.log('PASS: persistent scrollbar, justified confession text, left-aligned headings');
  console.log('PASS: auto-hiding reading header/bottom navigation and direct My List shortcut');
  console.log('PASS: personal notes stored only in SecureStore, excluded from sync');
  console.log('PASS: selection, individual notes, custom items, ordered writes, removal, clearing');
})().catch(err => {
  console.error('FAIL: confession preparation verification:', err.message);
  process.exitCode = 1;
});
