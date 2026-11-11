#!/usr/bin/env node
'use strict';

// No network or Metro needed. Run: node tools/test_bible_psalm_versification.js
const assert = require('node:assert/strict');
const mapping = require('../src/data/biblePsalmVersification.json');

const convert = (direction, chapter, verse) => {
  const table = mapping[direction];
  const key = chapter + '.' + verse;
  if (!Object.prototype.hasOwnProperty.call(table, key)) return [chapter, verse];
  return table[key];
};

const examples = [
  [[51, 1], [50, 3]],   // "Помилуй мя, Боже"
  [[23, 1], [22, 1]],   // "Господь пасет мя"
  [[10, 1], [9, 22]],   // two Hebrew Psalms become one in LXX
  [[115, 1], [113, 9]], // two Hebrew Psalms become one in LXX
  [[119, 1], [118, 1]],
  [[147, 12], [147, 1]],
];
for (const [english, lxx] of examples) {
  assert.deepEqual(convert('englishToLxx', ...english), lxx);
  assert.deepEqual(convert('lxxToEnglish', ...lxx), english);
}

// Psalm headings in LXX may have no separately numbered English verse.
// Returning null is required; never link a heading to unrelated content.
assert.equal(convert('lxxToEnglish', 3, 1), null);
assert.ok(Object.keys(mapping.englishToLxx).length > 2000);
assert.ok(Object.keys(mapping.lxxToEnglish).length > 2000);

console.log('PASS: Psalm KJV <-> LXX verse mapping and unmapped headings');
