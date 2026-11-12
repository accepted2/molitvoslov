#!/usr/bin/env node
'use strict';
// Run from molitvoslov-app: node tools/test_bible_csl_catalog.js
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const path = require('node:path');

(async () => {
  const loadModule = (relative) =>
    import(pathToFileURL(path.join(__dirname, '..', relative)).href);
  const {withSeparateCslManasseh} = await loadModule('src/services/bibleManasseh.js');
  const {getCslBibleBookName, bibleUiText} = await loadModule('src/services/bibleUi.js');
  const csl = require('../src/data/offlineBibleCslTraditional.json');
  const russian = require('../src/data/offlineBible.json');
  const originalCount = csl.books.length;
  const derived = withSeparateCslManasseh(csl);
  assert.equal(originalCount, 77, 'Unexpected CSL source count');
  assert.equal(derived.books.length, 78, 'CSL must expose 78 books');
  assert.equal(derived.books.filter((book) => book.testament === 'old').length, 51);
  assert.equal(russian.books.filter((book) => book.testament === 'old').length, 51);
  assert.equal(derived.books.filter((book) => book.testament === 'new').length, 27);
  assert.equal(derived.books.filter((book) => book.code === 'MAN').length, 1);
  assert.equal(derived.books[derived.books.findIndex((book) => book.code === '2CH') + 1].code, 'MAN');

  const man = derived.books.find((book) => book.code === 'MAN');
  assert.equal(man.chapters.length, 1);
  assert.equal(man.chapters[0].verses.length, 11, 'Elizabethan CSL appendix has eleven divisions');
  assert.ok(man.chapters[0].verses[0].text.startsWith('Гдⷭ҇и'));
  assert.ok(man.chapters[0].verses[10].text.includes('А҆ми́нь'));
  assert.equal(new Set(derived.books.map((book) => book.id)).size, 78);
  const allChapterIds = derived.books.flatMap((book) => book.chapters.map((ch) => ch.id));
  const allVerseIds = derived.books.flatMap((book) =>
    book.chapters.flatMap((ch) => ch.verses.map((verse) => verse.id)));
  assert.equal(new Set(allChapterIds).size, allChapterIds.length);
  assert.equal(new Set(allVerseIds).size, allVerseIds.length);

  const oldAppendix = csl.books.find((book) => book.code === '2CH')
    .chapters.find((chapter) => chapter.number === 36)
    .verses.find((verse) => verse.number === 24);
  const preservedAppendix = derived.books.find((book) => book.code === '2CH')
    .chapters.find((chapter) => chapter.number === 36)
    .verses.find((verse) => verse.number === 24);
  assert.strictEqual(oldAppendix, preservedAppendix, 'Original lectionary/verse anchor must remain intact');
  assert.strictEqual(withSeparateCslManasseh(derived), derived, 'Helper must be idempotent');

  assert.equal(getCslBibleBookName({code: 'MAT', name: 'Евангелие от Матфея'}),
    'Еѵангеліе ѿ Матѳея');
  assert.equal(getCslBibleBookName({code: 'MAN'}), 'Молитва Манассіи');
  assert.match(bibleUiText('csl_traditional', 'oldTestament', ''), /Завѣ/);
  assert.equal(bibleUiText('rst', 'oldTestament', 'Ветхий Завет'), 'Ветхий Завет');
  console.log('PASS: 51 CSL and 51 RU Old Testament books; authentic 11-division CSL Manasseh; unique IDs and traditional titles');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
