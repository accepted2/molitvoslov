#!/usr/bin/env node
'use strict';
// Run from molitvoslov-app:
// node tools/test_bible_calendar_search_focus.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

const routeSource = source('src/services/search/openRoute.js');
const loadRoute = new Function('bibleContent', routeSource
  .replace(/^import\s+.*?;\s*$/gm, '')
  .replace(/export const resolveSearchOpenRoute/, 'const resolveSearchOpenRoute') +
  '\nreturn resolveSearchOpenRoute;');

const mockBible = {
  getBook(id) {
    return id === 'luke'
      ? {id: 99, slug: 'luke', code: 'LUK'}
      : id === 12
        ? {id: 12, slug: 'other-book', code: 'MAT'}
        : null;
  },
  getChapter(id, number) {
    if (id !== 99 || Number(number) !== 11) return null;
    return {number: 11, verses: [
      {id: 9008, number: 8}, {id: 9009, number: 9},
      {id: 9010, number: 10}, {id: 9013, number: 13},
    ]};
  },
};
const resolve = loadRoute(mockBible);
const stale = {
  name: 'BibleChapter',
  params: {
    bookId: 12,
    chapterNumber: 11,
    focusTarget: {
      save_type: 'fragment',
      anchor_type: 'bible_verse',
      anchor_id: 123456,
      start_offset: null,
      end_offset: null,
      highlightQuery: 'просите',
      metadata: {book_slug: 'luke', chapter_number: 11, verse_number: 9},
    },
  },
};
const corrected = resolve({route: stale}, {});
assert.equal(corrected.name, 'BibleChapter');
assert.equal(corrected.params.bookId, 99);
assert.equal(corrected.params.chapterNumber, 11);
assert.equal(corrected.params.focusTarget.anchor_id, 9009);
assert.equal(corrected.params.focusTarget.metadata.verse_number, 9);
assert.equal(corrected.params.focusTarget.highlightQuery, 'просите');

const unchanged = {name:'Reader',params:{slug:'akathist'}};
assert.equal(resolve({route: unchanged}, {}), unchanged);

const chapterScreen = source('src/screens/BibleChapterScreen.js');
const calendarService = source('src/services/churchCalendar.js');
const style = source('src/components/reader/selectableDocumentReader/styles.js');
const search = source('src/screens/SearchScreen.js');
assert.match(calendarService, /calendarPassageRanges:\s*target\.ranges/);
assert.match(chapterScreen, /isInCalendarPassage\(chapter\.number, verse\.number\)\s*\?\s*'calendar-passage-verse'/);
assert.match(chapterScreen, /Number\(item\.number\) === Number\(metadata\.verse_number\)/);
assert.match(style, /@keyframes bible-calendar-passage-flash/);
assert.match(style, /100%\s*\{\s*background-color:\s*transparent;/);
assert.match(style, /bible-calendar-passage-flash 2100ms ease-out both/);
assert.match(search, /navigation\.push\(target\.name, target\.params \|\| \{\}\)/);

console.log('PASS: calendar complete passage focus fades; search opens the chosen Bible verse with fresh reader');
