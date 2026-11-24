#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const original = JSON.parse(read('src/data/curatedDailyQuotes.json')).quotes;
const long = JSON.parse(read('src/data/curatedLongFatherQuotes.json'));
const bible = JSON.parse(read('src/data/offlineBible.json'));
assert.equal(long.quotes.length, 22);
assert.equal(long.count, 22);
assert.equal(new Set(long.quotes.map(q => q.id)).size, 22);
assert(new Set(long.quotes.map(q => q.source)).size >= 7);
assert(long.quotes.every(q =>
  q.kind === 'father' && q.text.length >= 150 && q.text.length <= 300 &&
  q.target === null && q.work && q.sourceUrl?.startsWith('https://azbyka.ru/')));
const originalIds = new Set(original.map(x => x.id));
assert.deepEqual(long.quotes.filter(x => originalIds.has(x.id)).map(x => x.id), [810151],
  'Theophan original quote ID must be reused, never duplicated under a new ID');

const helper = read('src/services/extendedDailyQuote.js')
  .replace(/^import.*$/gmu, '').replace(/\bexport const /gu, 'const ');
const {expandBibleQuote,selectExtendedDailyQuote} =
  new Function('bibleContent', helper +
    '\nreturn {expandBibleQuote, selectExtendedDailyQuote};')({getBooks: () => bible.books});
const biblical = original.filter(x => x.kind === 'bible');
let longFatherDays = 0;
let bibleDays = 0;
let bibleWith150 = 0;
for (let d = 740000; d < 740180; d++) {
  const quote = selectExtendedDailyQuote(d, long.quotes, biblical, bible.books);
  assert(quote?.id && quote?.text);
  if (quote.kind === 'father') {
    longFatherDays++;
    assert(quote.text.length >= 150 && quote.text.length <= 300);
  } else {
    bibleDays++;
    if (quote.text.length >= 150 && quote.text.length <= 300) bibleWith150++;
    const book = bible.books.find(x => x.code === quote.target.bookCode);
    const chapter = book?.chapters.find(x => Number(x.number) === quote.target.chapter);
    const verses = chapter?.verses.filter(x =>
      Number(x.number) >= quote.target.verse &&
      Number(x.number) <= (quote.verseEnd ?? quote.target.verse));
    if (quote.verseEnd) {
      const expected = verses.map(x => String(x.text).trim().replace(/\s+/gu,' ')).join(' ');
      assert.equal(quote.text, expected, 'Bible quote must match the bundled verses precisely');
    }
  }
}
assert.equal(longFatherDays, 120);
assert.equal(bibleDays, 60);
assert(bibleWith150 >= 48, 'At least 80% of tested Bible selections should fill 150-300 characters');
const menu = read('src/screens/MenuScreen.js');
const service = read('src/services/dailyQuote.js');
assert(menu.includes('numberOfLines={9}'));
assert(menu.includes('minHeight: 360'));
assert(service.includes('selectExtendedDailyQuote('));
console.log('PASS: 22 sourced patristic excerpts of 150–300 characters, 7 authors.');
console.log('PASS: 120/180 rotation days Fathers, 60/180 Scripture.');
console.log('PASS: ' + bibleWith150 + '/60 Scripture passages of 150–300 characters, exact Bible verses.');
console.log('PASS: favorite IDs preserved and nine-line banner enabled.');
