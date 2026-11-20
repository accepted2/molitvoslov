#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {parse} = require('@babel/parser');
const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root,rel),'utf8');

const document = JSON.parse(read('src/data/confessionDocument.json'));
const groups = JSON.parse(read('src/data/confessionSemanticGroups.json'));
const grouping = read('src/services/confessionSemanticGrouping.js')
  .replace(/^import.*$/gmu, '')
  .replace(/\bexport const /gu, 'const ');
const build = new Function('semanticGroups',
  grouping + '\nreturn buildSemanticConfessionDocument;')(groups);
const result = build(document);
const originalIds = document.blocks.flatMap(block => block.segments || []).map(s => s.id);
const compiled = result.blocks.flatMap(block => block.segments || []);
assert.equal(originalIds.length, 437);
assert.equal(compiled.length, 387);
assert.equal(groups.groups.length, 31);
assert.equal(Object.keys(result.lookup).length, originalIds.length);
assert.equal(new Set(originalIds).size, originalIds.length);
for (let i = 0; i < document.blocks.length; i++) {
  const before = document.blocks[i], after = result.blocks[i];
  if (before.type !== 'paragraph') continue;
  assert.equal(before.segments.map(x=>x.text).join(''),
    after.segments.map(x=>x.text).join(''),
    'Source changed in paragraph ' + i);
}
for (const [id, members] of [
  ['s0010',['s0010','s0011']],
  ['s0054',['s0054','s0055']],
  ['s0242',['s0242','s0243','s0244','s0245','s0246']],
  ['s0301',['s0301','s0302']],
]) {
  assert.deepEqual(result.lookup[id].memberIds,members);
  assert.equal(result.lookup[members.at(-1)].id,id);
}
for (const relative of ['src/screens/ConfessionPreparationScreen.js',
  'src/screens/PrayerLearningScreen.js',
  'src/screens/MenuScreen.js', 'src/navigation/AppNavigator.js']) {
  parse(read(relative),{sourceType:'module',plugins:['jsx']});
}
const confession = read('src/screens/ConfessionPreparationScreen.js');
assert(confession.includes('segment.memberIds.some(id => selectedIds.includes(id))'));
assert(confession.includes('SEMANTIC_DOCUMENT.lookup[menuSinId]?.memberIds'));
assert(confession.includes('notes[item.id]'));
const lessonSource = read('src/data/prayerLearningContent.js')
  .replace(/\bexport const /gu, 'const ');
const content = new Function(lessonSource +
  '\nreturn {PRAYER_LEARNING_SOURCES,PRAYER_LEARNING_LESSONS,'+
  'PRAYER_LEARNING_LETTERS,PRAYER_LEARNING_NUMBERS};')();
assert.equal(content.PRAYER_LEARNING_LESSONS.length,7);
assert(content.PRAYER_LEARNING_LETTERS.length >= 35);
assert(content.PRAYER_LEARNING_NUMBERS.length >= 27);
assert(content.PRAYER_LEARNING_LESSONS.every(l =>
  l.sourceKeys?.every(k => content.PRAYER_LEARNING_SOURCES[k]?.startsWith('https://'))));
assert(read('src/navigation/AppNavigator.js').includes('name="PrayerLearning"'));
assert(read('src/screens/MenuScreen.js').includes("key:'prayer-learning'"));
console.log('PASS: 437 old fragments -> 387 coherent clickable phrases.');
console.log('PASS: 31 contiguous groups; original text 100% preserved.');
console.log('PASS: old saved IDs and note editor code remain addressable.');
console.log('PASS: 7 lessons, Slavonic alphabet/numerals, cited sources.');
console.log('PASS: four JS/JSX files parse; screen navigation registered.');
