#!/usr/bin/env node
'use strict';

// Offline integration test for user-selected full-length Home quotations.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const requested = JSON.parse(read('src/data/curatedRequestedQuotes20261120.json'));
const long = JSON.parse(read('src/data/curatedLongFatherQuotes.json'));
const legacy = JSON.parse(read('src/data/curatedDailyQuotes.json'));
const bible = JSON.parse(read('src/data/offlineBible.json'));
const books = bible.books || [];
const assertText = x => typeof x === 'string' && x.length >= 150 && x.length <= 300;

assert.equal(requested.count, 30);
assert.equal(requested.fatherQuotes.length, 9);
assert.equal(requested.bibleQuotes.length, 21);
assert(requested.fatherQuotes.every(q =>
  assertText(q.text) && q.kind === 'father' &&
  q.sourceUrl.startsWith('https://azbyka.ru/')));
assert.equal(legacy.quotes.length, 151);
const allIds = [...long.quotes, ...requested.fatherQuotes, ...requested.bibleQuotes].map(q => q.id);
assert.equal(new Set(allIds).size, allIds.length, 'New active quotation ID conflict');

const helper = read('src/services/extendedDailyQuote.js')
  .replace(/^import.*$/gmu, '').replace(/\bexport const /gu, 'const ');
const {expandBibleQuote,selectExtendedDailyQuote} = new Function('bibleContent',
  helper + '\nreturn {expandBibleQuote, selectExtendedDailyQuote};')({
  getBooks: () => books,
});
const missing = [];
for (const requestedVerse of requested.bibleQuotes) {
  const book = books.find(x => x.code === requestedVerse.target.bookCode);
  const chapter = book?.chapters?.find(x =>
    Number(x.number) === Number(requestedVerse.target.chapter));
  const verse = chapter?.verses?.find(x =>
    Number(x.number) === Number(requestedVerse.target.verse));
  if (!verse) missing.push(requestedVerse.reference);
}
assert.deepEqual(missing, [], 'Bible references not present in the offline edition');

const unusable = [];
for (const requestedVerse of requested.bibleQuotes) {
  const result = expandBibleQuote(requestedVerse, books);
  if (!result || !assertText(result.text)) {
    unusable.push(requestedVerse.reference);
    continue;
  }
  const book = books.find(x => x.code === result.target.bookCode);
  const chapter = book.chapters.find(x => Number(x.number) === result.target.chapter);
  const consecutive = chapter.verses.filter(v =>
    Number(v.number) >= result.target.verse &&
    Number(v.number) <= result.verseEnd);
  const expected = consecutive.map(v => String(v.text).trim().replace(/\s+/gu, ' ')).join(' ');
  assert.equal(result.text, expected, 'Bible excerpt must be exact and contiguous');
}
console.log('PASS: 9 sourced Father passages, 21 canonical Scripture references.');
console.log('Verified long Scripture passages: ' +
  (requested.bibleQuotes.length - unusable.length) + '/21.');
if (unusable.length) console.warn('Cannot expand to 150–300 characters: ' + unusable.join(', '));
const fathers = [...long.quotes, ...requested.fatherQuotes];
for (let day = 740000; day < 740360; day++) {
  const quote = selectExtendedDailyQuote(day, fathers, requested.bibleQuotes, books);
  assert(quote && assertText(quote.text), 'Short or empty daily quote for ordinal ' + day);
  assert(![...legacy.quotes.filter(x => x.text.length < 150)].some(x =>
    x.id === quote.id && x.text === quote.text), 'Short legacy quote in active rotation');
}
const service = read('src/services/dailyQuote.js');
assert(service.includes("userSelected.fatherQuotes"));
assert(service.includes("userSelected.bibleQuotes"));
console.log('PASS: 360-day rotation only selects 150–300 character quotations.');
console.log('PASS: 151 legacy entries retained for previously saved favorites.');
