#!/usr/bin/env node
'use strict';
// Run in molitvoslov-app: node tools/test_calendar_inline_translation_switch.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const file = fs.readFileSync(
  path.join(__dirname, '../src/screens/ChurchCalendarScreen.js'), 'utf8'
);
const start = file.indexOf('const ReadingLink =');
const end = file.indexOf('const ReadingGroup =', start);
assert.ok(start >= 0 && end > start, 'Calendar ReadingLink component missing');
const reading = file.slice(start, end);

assert.match(file, /\{code: 'rst', label: 'RU'/);
assert.match(file, /\{code: 'csl_traditional', label: 'ЦС'/);
assert.match(reading, /\[activeTranslationCode, setActiveTranslationCode\] = useState\(translationCode\)/);
assert.match(reading, /setActiveTranslationCode\(translationCode\);\s*\}, \[translationCode, title\]\)/);
assert.match(reading, /onPress=\{\(\) => setActiveTranslationCode\(option\.code\)\}/);
assert.match(reading, /activeTranslationCode === option\.code && styles\.readingTranslationButtonSelected/);
assert.match(reading, /<View style=\{styles\.readingExpandRow\}>/);
assert.match(reading, /\{expanded && \(\s*<View style=\{styles\.readingTranslationToggle\}>/);
assert.match(reading, /getBibleReadingVerses\(title, activeTranslationCode\)/);
assert.match(reading, /openCalendarBibleReference\(navigation, title, activeTranslationCode\)/);
assert.match(reading, /bibleUiText\(activeTranslationCode, 'chapter'/);
assert.match(reading, /formatBibleNumber\(activeTranslationCode, verse\.verseNumber\)/);
assert.match(reading, /isTraditionalBible\(activeTranslationCode\) && styles\.readingVerseTextCsl/);
assert.match(file, /readingTranslationToggle: \{\s*flexDirection: 'row'/);
assert.match(file, /readingExpandChevron: \{/);

const togglePos = reading.indexOf('<View style={styles.readingTranslationToggle}>');
const chevronPos = reading.indexOf('style={({pressed}) => [styles.readingExpandChevron');
assert.ok(togglePos > 0 && chevronPos > togglePos,
  'RU/ЦС switch must be before the accordion chevron');

console.log('PASS: RU/ЦС control beside calendar expand arrow; local translation switches displayed verses');
