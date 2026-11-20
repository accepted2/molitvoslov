#!/usr/bin/env node
'use strict';
// Targeted verification of the revised prayer learning UI and Android buttons.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {parse} = require('@babel/parser');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const content = new Function(read('src/data/prayerLearningContent.js')
  .replace(/\bexport const /gu,'const ') +
  '\nreturn {PRAYER_LEARNING_LESSONS,PRAYER_LEARNING_LETTERS,PRAYER_LEARNING_NUMBERS};')();
const {PRAYER_LEARNING_LESSONS: lessons,PRAYER_LEARNING_LETTERS: letters,
  PRAYER_LEARNING_NUMBERS: numbers} = content;
assert.deepEqual(lessons.map(x=>x.id),
  ['start','attention','repentance','alphabet','numbers','marks']);
assert(lessons.slice(0,3).every(x=>x.teachings?.length));
assert(lessons.some(x=>x.quotations?.length));
assert(!lessons.some(x=>x.id==='practice'));
assert.equal(letters.length,39);
assert.equal(numbers.length,27);
assert(letters.every(x=>x.upper && x.lower && x.name));
assert(numbers.every(x=>x.glyph.includes('҃')));
assert(!read('src/data/prayerLearningContent.js').includes('http'));

const screen = read('src/screens/PrayerLearningScreen.js');
assert(!screen.includes('Linking'));
assert(!screen.includes('SourceLinks'));
assert(screen.includes('useScopedReaderAppearance'));
assert(screen.includes("fontFamily: 'Ponomar'"));
assert(screen.includes('COLUMNS = 5'));
assert(screen.includes('setLetter(item.upper)'));
assert(screen.includes('{item.upper}'));
assert(!screen.includes('>{item.lower}</Text>'));
for (const file of [
  'App.js',
  'src/screens/PrayerLearningScreen.js',
  'src/components/navigation/SystemNavigationBackdrop.js',
]) parse(read(file), {sourceType:'module',plugins:['jsx']});
assert(read('App.js').includes('<SystemNavigationBackdrop />'));
const xml = read('android/app/src/main/res/values/styles.xml');
for (const fragment of [
  '<item name="android:navigationBarColor">#4D3020</item>',
  '<item name="android:windowLightNavigationBar">false</item>',
  '<item name="android:enforceNavigationBarContrast">false</item>',
]) assert(xml.includes(fragment),'Missing native theme item: '+fragment);
console.log('PASS: six offline lessons, patristic teaching, no website links or exercises.');
console.log('PASS: fixed five-column Ponomar alphabet/numeral grid and reader-style text.');
console.log('PASS: brown native navigation area with light Android system button preference.');
