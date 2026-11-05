#!/usr/bin/env node
// Read-only regression. No changes to personal SQLite or bundled prayer JSON.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/parser');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
for (const f of [
  'src/services/personalPrayerPresentation.js',
  'src/services/personalPrayerReadingDocument.js',
  'src/services/prayerBooks.js',
  'src/screens/PersonalPrayerEditorScreen.js',
  'src/screens/PrayerBookScreen.js',
  'src/screens/PrayerBookReaderScreen.js',
]) babel.parse(read(f), {sourceType: 'module', plugins: ['jsx']});
console.log('PASS: changed personal prayer files parse as JavaScript/JSX');

const helper = read('src/services/personalPrayerPresentation.js')
  .replace(/export const /g, 'const ');
const lib = new Function(helper +
 '\nreturn {presentPersonalPrayer,personalPrayerLanguage};')();
const {presentPersonalPrayer, personalPrayerLanguage} = lib;

const ru = 'Отче наш, Который на небесах! Да святится имя Твоё.';
const cs = 'Отче наш, Иже еси на небесех! Да святится имя Твое.';
const legacy = {
  title: 'Отче наш, Который на небесах! Да святится имя Твоё.',
  text: cs + '\n\nРусский перевод\n' + ru,
  origin_type: 'library',
  origin_data: {search_source: 'global_prayer_search'},
};
const cleaned = presentPersonalPrayer(legacy);
assert.equal(cleaned.title, '');
assert.equal(cleaned.text, ru);
assert.equal(cleaned.language, 'russian');
assert.equal(personalPrayerLanguage({origin_data: {language: 'church'}}, ru), 'church');
assert.equal(personalPrayerLanguage({origin_data: {}}, cs), 'church');
assert.equal(personalPrayerLanguage({origin_data: {}}, 'Смѣ́реніе и радость'), 'church');
assert.equal(personalPrayerLanguage({origin_data: {}}, ru), 'russian');
console.log('PASS: old merged imports open in the editor as ONE selected language');

const builder = read('src/services/personalPrayerReadingDocument.js')
  .replace(/^import .*$/gm, '').replace(/export const /g, 'const ');
const makeDoc = new Function('presentPersonalPrayer', builder +
 '\nreturn buildPersonalPrayerReadingDocument;')(presentPersonalPrayer);
const doc = makeDoc({
  book: {title: 'Личный молитвослов'}, bookSyncId: 'b1',
  items: [
    {prayer: {...legacy, sync_id: 'r1'}},
    {prayer: {sync_id: 'r2', title: 'Псалом', text: cs,
      origin_type: 'saved', origin_data: {language: 'church'}}},
  ],
  sourceIdForSync: id => id === 'r1' ? 12 : 13,
});
assert.equal(doc.title, '');
assert.equal(doc.sections.length, 2);
assert.equal(doc.sections[0].rows[0].blocks[0].text, ru);
assert.equal(doc.sections[0].rows[0].blocks[0].metadata.language, 'russian');
assert.equal(doc.sections[1].rows[0].blocks[0].metadata.language, 'traditional');
console.log('PASS: Church Slavonic personal WebView selects Ponomar; Russian remains civil');

const editor = read('src/screens/PersonalPrayerEditorScreen.js');
const storage = read('src/services/prayerBooks.js');
const list = read('src/screens/PrayerBookScreen.js');
const psalter = read('src/screens/PrayerBookReaderScreen.js');
assert.match(editor, /const visible = presentPersonalPrayer\(current\)/);
assert.match(editor, /setText\(visible\.text\)/);
assert.match(editor, /setTitle\(visible\.title\)/);
assert.match(editor, /updateBookPersonalPrayer\(bookSyncId, current\.sync_id/);
assert.match(editor, /origin_data: changedOrigin/);
assert.match(editor, /styles\.churchText/);
assert.match(editor, /spellCheck=\{false\}/);
assert.match(storage, /export const updateBookPersonalPrayer = async/);
assert.match(storage, /return updatePersonalPrayer\(prayerSyncId, patch\)/);
assert.match(storage, /UPDATE personal_prayers/);
assert.doesNotMatch(editor, /contentApi\.(?:post|put|patch)/);
assert.match(list, /backgroundColor: 'transparent'/);
assert.match(list, /styles\.churchPreview/);
assert.match(psalter, /fontFamily: 'Ponomar'/);
assert.match(psalter, /language=\{language\}/);
console.log('PASS: editing updates personal copy, Ponomar covers previews and Psalter, footer transparent');
