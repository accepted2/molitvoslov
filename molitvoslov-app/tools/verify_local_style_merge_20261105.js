#!/usr/bin/env node
// Verify that user-local layout and heart color survive the Git merge while
// the Akathist importer retains its no-guessing translation safeguard.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const saint = read('src/screens/SaintDetailScreen.js');
const calendar = read('src/screens/ChurchCalendarScreen.js');
const heart = read('src/components/reader/CalendarSaveText.js');
const parser = read('../molitvoslov-backend/api/management/commands/import_akathist.py');
const tests = read('../molitvoslov-backend/api/test_azbyka_akathist_pipeline.py');

assert.match(saint, /readingContent:\s*\{paddingHorizontal: 10,\s*paddingTop: 2,\s*paddingBottom: 8\}/);
assert.match(saint, /lifeInset:\s*\{[\s\S]*?borderRadius: 0,\s*borderWidth: 1,[^\n]*backgroundColor: '#FFF4DE'/);
assert.match(saint, /colors=\{\['rgba\(255,244,222,0\)', 'rgba\(255,244,222,0\.90\)', '#FFF4DE'\]\}/);

assert.match(calendar, /calendarLifeInset:\s*\{[\s\S]*?borderRadius: 0,\s*borderWidth: 1,[\s\S]*?backgroundColor: '#FFF8EB'/);
assert.match(calendar, /colors=\{\['#FFF8EB', 'rgba\(255,248,235,0\.77\)', 'rgba\(255,248,235,0\)'\]\}/);
assert.match(calendar, /colors=\{\['rgba\(255,248,235,0\)', 'rgba\(255,248,235,0\.86\)', '#FFF8EB'\]\}/);

assert.match(heart, /color=\{saved \? '#765238' : '#765238'\}/);
assert.match(heart, /name=\{saved \? 'heart' : 'heart-o'\}/);

const first = parser.indexOf('    def parse_unclassified_prayer(self, blocks):');
const last = parser.indexOf('\n    def average_church_score', first);
assert.ok(first >= 0 && last > first, 'Must find Akathist fallback parser');
const fallback = parser.slice(first, last);
assert.match(fallback, /return self\.join_parts\(blocks\), ""/);
assert.doesNotMatch(fallback, /church_slavonic_score|best_split|average_church_score/);
for(const method of [
  'test_unmarked_two_paragraph_prayer_is_not_false_russian_translation',
  'test_unmarked_many_paragraph_prayer_never_split_on_language_score',
  'test_explicit_russian_prayer_translation_is_still_separate',
]) assert.ok(tests.includes('def ' + method + '('), 'Missing safeguard: ' + method);

console.log('PASS: local saint padding, square inset, source-colored life fades');
console.log('PASS: local ivory calendar text background and brown saved heart');
console.log('PASS: no inferred Akathist translations and all three safeguards retained');
