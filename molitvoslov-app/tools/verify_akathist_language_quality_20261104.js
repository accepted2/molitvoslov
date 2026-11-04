#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {auditOne} = require('./audit_akathist_russian_data');

const appRoot = path.resolve(__dirname, '..');
const service = fs.readFileSync(path.join(appRoot, 'src/services/akathistRussianCoverage.js'), 'utf8');
const getCoverage = new Function(
  service.replace('export const getAkathistRussianCoverage =', 'const getAkathistRussianCoverage =') +
  '\nreturn getAkathistRussianCoverage;'
)();

const makeSections = translation => [
  ...Array.from({length: 13}, (_, i) => ({
    section_type: 'kontakion', number: i + 1,
    text: {content: 'Церковнославянский текст', translation},
  })),
  ...Array.from({length: 12}, (_, i) => ({
    section_type: 'ikos', number: i + 1,
    text: {content: 'Церковнославянский текст', translation},
  })),
];

const full = {sections: makeSections('Русский перевод')};
const partial = {sections: makeSections('')};
partial.sections[0].text.translation = 'Случайный второй абзац';
const missingPrayer = {sections: [...makeSections('Русский перевод'),
  {section_type: 'prayer', number: 1, text: {content: 'Молитва', translation: ''}}]};

assert.equal(getCoverage(full).complete, true, 'Complete 25 section translations available');
assert.equal(getCoverage(partial).complete, false, 'One translated paragraph is not an entire Akathist');
assert.equal(getCoverage(partial).translatedMain, 1);
assert.equal(getCoverage(missingPrayer).complete, false, 'Missing concluding prayer translation');
assert.equal(getCoverage({sections: makeSections('Русский перевод').slice(1)}).complete, false);
assert.equal(getCoverage({sections: makeSections('Русский перевод'),
  troparion: {content: 'Тропарь', translation: ''}}).complete, false);
assert.equal(auditOne('partial', partial).category, 'partial_russian_fields');
assert.equal(auditOne('none', {sections: makeSections('')}).category, 'no_russian');
assert.equal(auditOne('full', full).category, 'all_main_fields_filled');

const suspicious = {sections: makeSections('Русский перевод')};
suspicious.sections[0] = {
  ...suspicious.sections[0],
  text: {
    content: 'Длинное древнее церковнославянское повествование. '.repeat(12),
    translation: 'Сие яко Господи и мя спаси, аще воззришь.',
  },
};
const report = auditOne('suspect', suspicious);
assert.equal(report.category, 'suspect_russian_fields');
assert.ok(report.suspicious_sections.some(item => item.section === 'kontakion:1'));
assert.equal(report.suspicious_sections[0].reasons.includes('archaic_words_in_russian_field'), true);

const screen = fs.readFileSync(path.join(appRoot, 'src/screens/AkathistScreen.js'), 'utf8');
assert.match(screen, /getAkathistRussianCoverage\(akathist\)\.complete/);
assert.match(screen, /const showRussian = hasRussianTranslation &&/);
assert.equal((screen.match(/layout: blocks\.length > 1 \? 'parallel' : 'stack'/g) || []).length, 2);
assert.match(screen, /Полный русский перевод этого акафиста отсутствует или ещё не проверен/);
console.log('PASS: Russian tabs reject incomplete translations; full CS+RU uses two synchronized columns');
console.log('PASS: non-destructive quality audit detects partial, missing, and suspicious Russian fields');
