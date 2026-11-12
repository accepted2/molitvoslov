#!/usr/bin/env node
'use strict';
// Run from molitvoslov-app: node tools/test_bible_search_chapter_anchor.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

const routesSource = read('src/services/search/routes.js');
const withHighlight = new Function(
  routesSource.replace(/export const /g, 'const ') + '\nreturn withHighlight;'
)();
const mockBible = {
  getBook(id) {
    if (id === 42 || id === 'mark') return {id: 42, slug: 'mark', code: 'MRK'};
    return null;
  },
  getChapter(id, number) {
    if (id !== 42 || Number(number) !== 8) return null;
    return {number: 8, verses: [{id: 8001, number: 1}, {id: 8002, number: 2}]};
  },
};
const openRouteSource = read('src/services/search/openRoute.js');
const resolveSearchOpenRoute = new Function('bibleContent',
  openRouteSource
    .replace(/^import .*?;\r?\n/gm, '')
    .replace(/export const /g, 'const ') +
    '\nreturn resolveSearchOpenRoute;'
)(mockBible);

const chapterRoute = {name: 'BibleChapter', params: {bookId: 42, chapterNumber: 8, resume: false}};
const indexed = withHighlight(chapterRoute, 'марк 8', 'russian', false);
assert.equal(indexed.params.focusTarget.anchor_type, 'bible_chapter');
assert.equal(indexed.params.focusTarget.metadata.chapter_number, 8);
assert.equal(indexed.params.focusTarget.highlightQuery, undefined);

const resolved = resolveSearchOpenRoute({route: indexed}, {});
assert.equal(resolved.name, 'BibleChapter');
assert.equal(resolved.params.chapterNumber, 8);
assert.equal(resolved.params.focusTarget.anchor_type, 'bible_chapter');
assert.equal(resolved.params.focusTarget.metadata.book_slug, 'mark');
assert.equal(resolved.params.highlightQuery, undefined);

// Old, already-built search index rows must open correctly without rebuilding SQLite.
const legacy = {
  name: 'BibleChapter',
  params: {
    bookId: 42, chapterNumber: 8, resume: false,
    highlightQuery: 'марк 8',
    focusTarget: {
      save_type: 'fragment',
      highlightQuery: 'марк 8',
      highlightSectionStart: false,
      preferredLanguage: 'russian',
    },
  },
};
const fixedLegacy = resolveSearchOpenRoute({route: legacy}, {});
assert.equal(fixedLegacy.params.focusTarget.anchor_type, 'bible_chapter');
assert.equal(fixedLegacy.params.focusTarget.metadata.chapter_number, 8);
assert.equal(fixedLegacy.params.focusTarget.highlightQuery, undefined);
assert.equal(fixedLegacy.params.highlightQuery, undefined);
assert.equal(fixedLegacy.params.resume, false);

// Verse result remains a true verse, not a chapter-title target.
const verse = withHighlight({
  name: 'BibleChapter',
  params: {
    bookId: 42, chapterNumber: 8,
    focusTarget: {
      save_type: 'fragment', anchor_type: 'bible_verse', anchor_id: 8002,
      metadata: {chapter_number: 8, verse_number: 2, book_slug: 'mark'},
    },
  },
}, 'Иисус', 'russian');
const openedVerse = resolveSearchOpenRoute({route: verse}, {});
assert.equal(openedVerse.params.focusTarget.anchor_type, 'bible_verse');
assert.equal(openedVerse.params.focusTarget.anchor_id, 8002);
assert.equal(openedVerse.params.focusTarget.highlightQuery, 'Иисус');

// Other categories retain their established text highlighting behavior.
const prayer = withHighlight({name: 'Reader', params: {slug: 'prayer'}}, 'Господи', 'church');
assert.equal(prayer.params.focusTarget.anchor_type, undefined);
assert.equal(prayer.params.focusTarget.highlightQuery, 'Господи');

console.log('PASS: search opens Mark 8 at chapter 8; old index rows fixed; verse and prayer targets preserved');
