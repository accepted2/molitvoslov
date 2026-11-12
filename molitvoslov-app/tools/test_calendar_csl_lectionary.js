#!/usr/bin/env node
'use strict';
// Run from molitvoslov-app:
//   node tools/test_calendar_csl_lectionary.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

(async () => {
  const {cleanCalendarTraditionalBibleVerse: clean} = await import(
    pathToFileURL(path.join(__dirname, '../src/services/calendarBibleVersePresentation.js')).href
  );

  const examples = [
    ['З°°(ачало 1)°° Во о́но вре́мя', 'Во о́но вре́мя'],
    ['**(Заⷱ҇ 2)**  Бл҃же́ни', 'Бл҃же́ни'],
    ['◦◦ (Зачало 12) ○○ Слово', 'Слово'],
    ['**(Зач. 3)** благословенъ', 'благословенъ'],
    ['Прежде а́ще **(Заⷱ҇ 2)** прїи́детъ', 'Прежде а́ще прїи́детъ'],
    ['Слово (чтение 2) не удалять', 'Слово (чтение 2) не удалять'],
    ['Гдⷭ҇ь небо́ и҆ зе́млю', 'Гдⷭ҇ь небо́ и҆ зе́млю'],
    ['Слово **жирное** сохраняем', 'Слово **жирное** сохраняем'],
  ];
  for (const [source, expected] of examples) {
    assert.equal(clean(source), expected);
  }

  const calendarService = fs.readFileSync(
    path.join(__dirname, '../src/services/churchCalendar.js'), 'utf8'
  );
  const calendarScreen = fs.readFileSync(
    path.join(__dirname, '../src/screens/ChurchCalendarScreen.js'), 'utf8'
  );

  assert.match(calendarService, /translationCode === 'csl_traditional'\s*\?\s*cleanCalendarTraditionalBibleVerse\(verse\.text\)/);
  assert.match(calendarService, /: String\(verse\.text \|\| ''\)\.trim\(\)/);
  assert.match(calendarScreen, /isTraditionalBible\(activeTranslationCode\) && styles\.readingVerseTextCsl/);
  assert.match(calendarScreen, /isTraditionalBible\(activeTranslationCode\) && styles\.readingVerseNumberCsl/);
  assert.match(calendarScreen, /isTraditionalBible\(activeTranslationCode\) && styles\.readingChapterCsl/);
  assert.match(calendarScreen, /readingVerseTextCsl: \{\s*fontSize: 18,\s*lineHeight: 32/);

  console.log('PASS: CSL calendar lectionary rubrics/circles removed; Russian verses untouched; CSL text enlarged');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
