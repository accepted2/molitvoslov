#!/usr/bin/env node
// Read-only regression checks for the Akathist reader's presentation layer.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

const sectionSource = read('src/services/akathistPresentation.js');
const sandbox = {module: {exports: {}}};
vm.runInNewContext(
  sectionSource.replace('export const prepareAkathistSections =', 'const prepareAkathistSections =') +
    '\nmodule.exports.prepare = prepareAkathistSections;',
  sandbox,
);
const prepare = sandbox.module.exports.prepare;
const part = (id, type, number) => ({id, section_type:type, number});
const k1 = part(1, 'kontakion', 1);
const i1 = part(2, 'ikos', 1);
const k2 = part(3, 'kontakion', 2);
const k13 = part(4, 'kontakion', 13);
const prayer = part(5, 'prayer', 0);
const original = [k1, i1, k2, k13, prayer];
const sequence = prepare(original);
assert.deepEqual(Array.from(sequence, item => item.section.id), [1,2,3,4,2,1,5]);
assert.deepEqual(Array.from(sequence, item => item.repeated), [false,false,false,false,true,true,false]);
assert.equal(original.length, 5, 'Original source array must not be mutated');
const withRepeat = prepare([k1,i1,k13,i1,k1,prayer]);
assert.deepEqual(Array.from(withRepeat, item => item.section.id), [1,2,4,2,1,5]);
const misplaced = prepare([k1,i1,k13,k1,prayer,i1]);
assert.deepEqual(Array.from(misplaced, item => item.section.id), [1,2,4,2,1,5]);
assert.equal(prepare([k1,i1,prayer]).length, 3);
assert.equal(prepare([k13,prayer]).length, 2, 'Do not invent missing first hymns');
console.log('PASS: Kontakion 13 -> Ikos 1 -> Kontakion 1 -> prayers without extra duplicates');

const screen = read('src/screens/AkathistScreen.js');
assert.match(screen, /prepareAkathistSections\(akathist\.sections\)/);
assert.match(screen, /progressAnchorId: repeated \? 0 : Number\(section\.id\)/);
assert.match(screen, /trackProgress: !repeated/);
assert.match(screen, /className: 'akathist-section'/);

const runtime = read('src/components/reader/selectableDocumentReader/runtime.js');
const n0 = runtime.indexOf('const normalizedAkathistTextWithIndex = value => {');
const n1 = runtime.indexOf('const HIGHLIGHT_COMBINING', n0);
const w0 = runtime.indexOf('const collectAkathistWordRanges', n1);
const w1 = runtime.indexOf('const collectPsalterVerseNumberRanges', w0);
assert.ok(n0 >= 0 && n1 > n0 && w0 > n1 && w1 > w0, 'Runtime helpers not found');
const helperSandbox = {module:{exports:{}}};
vm.runInNewContext(
  runtime.slice(n0,n1) + '\n' + runtime.slice(w0,w1) +
    '\nmodule.exports = {inv:collectAkathistInvocationRanges, alleluia:collectAkathistAlleluiaRanges, breaks:collectAkathistJoyBreaks};',
  helperSandbox,
);
const {inv, alleluia, breaks} = helperSandbox.module.exports;
const praise = 'Радуйся, Мати Божия. Иисусе, Сладчайший! Радуйся, Дево!';
assert.deepEqual(Array.from(inv(praise), range => praise.slice(range.start,range.end)), ['Радуйся','Иисусе','Радуйся']);
assert.deepEqual([...breaks(praise)], [praise.indexOf('Иисусе'), praise.lastIndexOf('Радуйся')]);
const accented = 'Иису́се, Сладчайший! Іисусе!';
assert.deepEqual(Array.from(inv(accented), range => accented.slice(range.start,range.end)), ['Иису́се','Іисусе']);
const response = 'Поем Тебе Аллилуиа! И паки: Аллилуия.';
assert.deepEqual(Array.from(alleluia(response), range => response.slice(range.start,range.end)), ['Аллилуиа!','Аллилуия.']);
assert.equal(inv('НеРадуйся').length, 0, 'Never decorate inside another word');
assert.match(runtime, /akathistAlleluiaWrapper = el\('span', 'akathist-alleluia'\)/);
assert.match(runtime, /akathistJoyBreaks\.has\(end\)/);
console.log('PASS: full Raduisya/Iisuse colored with new lines; Alleluia stays one wrapping unit');

const css = read('src/components/reader/selectableDocumentReader/styles.js');
assert.match(css, /\.rule-item\.akathist-section \.section-header \.prayer-title/);
assert.match(css, /color: var\(--accent-dark\)/);
assert.match(css, /\.reader-text \.akathist-alleluia\s*\{[^}]*display: inline-block;[^}]*white-space: nowrap;/);
assert.match(css, /\.reader-text \.akathist-initial/);
console.log('PASS: Akathist headings use reader theme and response words use rubric red');
console.log('AKATHIST PRESENTATION REGRESSION CHECKS PASSED');
