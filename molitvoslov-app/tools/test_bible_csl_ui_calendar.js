#!/usr/bin/env node
'use strict';
// Run from molitvoslov-app: node tools/test_bible_csl_ui_calendar.js
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {pathToFileURL} = require('node:url');
const path = require('node:path');

(async () => {
  const src = (file) => readFileSync(path.join(__dirname, '..', file), 'utf8');
  const {formatBibleNumber, bibleUiText, getCslBibleBookName} =
    await import(pathToFileURL(path.join(__dirname, '..', 'src/services/bibleUi.js')).href);

  const samples = {
    1: 'а҃', 2: 'в҃', 5: 'є҃', 8: 'и҃', 9: 'ѳ҃',
    10: 'і҃', 11: 'а҃і', 12: 'в҃і', 19: 'ѳ҃і',
    20: 'к҃', 21: 'к҃а', 32: 'л҃в', 50: 'н҃', 51: 'н҃а',
    100: 'р҃', 101: 'р҃а', 150: 'р҃н', 176: 'рѻ҃ѕ', 1000: '҂а҃',
  };
  for (const [arabic, csl] of Object.entries(samples)) {
    assert.equal(formatBibleNumber('csl_traditional', Number(arabic)), csl, arabic);
    assert.equal(formatBibleNumber('rst', Number(arabic)), arabic);
  }

  assert.equal(bibleUiText('csl_traditional', 'chapter', '', {number: 21}),
    'Глава́ к҃а');
  assert.equal(bibleUiText('csl_traditional', 'chapters', '', {count: 51}),
    'н҃а гла́въ');
  assert.match(getCslBibleBookName({code: '1MA'}), /Пе́рваѧ.*Маккаве́йскаѧ/);

  const russian = require('../src/data/offlineBible.json');
  const traditional = require('../src/data/offlineBibleCslTraditional.json');
  const book = (data, code) => data.books.find((item) => item.code === code);
  for (const code of ['GEN', 'PSA', '1MA', 'MAT', 'JHN', 'ROM']) {
    assert.ok(book(russian, code), 'RU book missing: ' + code);
    assert.ok(book(traditional, code), 'CSL book missing: ' + code);
    assert.ok(book(russian, code).chapters.length);
    assert.ok(book(traditional, code).chapters.length);
  }
  const cslMatthew = book(traditional, 'MAT').chapters[4].verses[2].text;
  const ruMatthew = book(russian, 'MAT').chapters[4].verses[2].text;
  assert.notEqual(cslMatthew, ruMatthew, 'CSL reader must use a distinct source text');

  const calendar = src('src/services/churchCalendar.js');
  const account = src('src/screens/AccountScreen.js');
  const reader = src('src/screens/BibleChapterScreen.js');
  const calendarScreen = src('src/screens/ChurchCalendarScreen.js');
  assert.match(calendar, /getBibleReadingVerses = \(title, translationCode = 'rst'\)/);
  assert.match(calendar, /getChapter\(target\.book\.id, chapterNumber, translationCode\)/);
  assert.match(calendar, /openCalendarBibleReference = \(navigation, title, translationCode = 'rst'\)/);
  assert.match(reader, /translation_code: translationCode/);
  assert.match(account, /Текст Библии в церковном календаре/);
  assert.match(calendarScreen, /getCalendarBibleTranslation\(\)/);
  console.log('PASS: CSL numerals, books, resume metadata and independent calendar translation plumbing');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
