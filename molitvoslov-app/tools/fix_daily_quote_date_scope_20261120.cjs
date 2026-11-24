#!/usr/bin/env node
'use strict';

// Repair a divergent local dailyQuote.js without relying on its existing
// date-format helper names. Never change unrelated files or Git branches.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {parse} = require('@babel/parser');

const root = path.resolve(__dirname, '..');
const file = path.join(root, 'src/services/dailyQuote.js');
const original = fs.readFileSync(file, 'utf8');
const source = original.replace(/\r\n/g, '\n');
const dryRun = process.argv.includes('--dry-run');

// This declaration is self-contained with respect to dates; it uses only the
// existing four imported app dependencies listed in the preflight below.
const replacement = String.raw`export const getDailyQuote = (requestedDate = new Date()) => {
  const date =
    requestedDate instanceof Date && !Number.isNaN(requestedDate.getTime())
      ? requestedDate
      : new Date();
  const today =
    String(date.getFullYear()) + '-' +
    String(date.getMonth() + 1).padStart(2, '0') + '-' +
    String(date.getDate()).padStart(2, '0');
  const ordinal =
    Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000) + 719163;

  const calendar = getCurrentContent()?.daily_quotes;
  const exact = (Array.isArray(calendar) ? calendar : []).find(item =>
    item && item.quote_date === today &&
    typeof item.text === 'string' && item.text.trim());
  if (exact) return {...exact, date: today};

  const chosen = selectExtendedDailyQuote(
    ordinal, longFathers.quotes || [], curated.quotes || []);
  if (chosen?.text) return {...chosen, date: today};

  return {
    id: null,
    text: 'Господи, научи меня молиться.',
    reference: '',
    source: '',
    date: today,
  };
};`;

// Inspect the AST instead of assuming a particular local implementation
// of formatLocalDate, getDateOrdinal, or the old quote rotation.
const ast = parse(source, {sourceType: 'module'});
const imports = new Set(ast.program.body
  .filter(node => node.type === 'ImportDeclaration')
  .flatMap(node => node.specifiers.map(specifier => specifier.local.name)));
for (const required of ['getCurrentContent','curated','longFathers','selectExtendedDailyQuote']) {
  assert(imports.has(required),
    'Missing imported dependency ' + required + '; local source was NOT changed');
}

const quoteExports = ast.program.body.filter(node =>
  node.type === 'ExportNamedDeclaration' &&
  ((node.declaration?.type === 'VariableDeclaration' &&
     node.declaration.declarations.some(item => item.id?.name === 'getDailyQuote')) ||
   (node.declaration?.type === 'FunctionDeclaration' &&
     node.declaration.id?.name === 'getDailyQuote')));
assert.equal(quoteExports.length, 1,
  'Expected exactly one exported getDailyQuote; local source was NOT changed');

const target = quoteExports[0];
const newSource =
  source.slice(0, target.start) + replacement + source.slice(target.end);
parse(newSource, {sourceType: 'module'});

// Independently test the replacement, including the default date that was
// crashing MenuScreen's useState initializer.
const callable = new Function(
  'getCurrentContent', 'selectExtendedDailyQuote', 'longFathers', 'curated',
  replacement.replace('export const getDailyQuote', 'const getDailyQuote') +
    '\nreturn getDailyQuote;',
);
const build = calendar => callable(
  () => ({daily_quotes: calendar}),
  () => ({id: 77, text:'Проверка цитаты', kind:'father'}),
  {quotes: [{id:77, text:'Проверка цитаты'}]},
  {quotes: []},
);
assert.equal(build([])().id, 77);
assert.equal(build([])(new Date(2026, 10, 20)).date, '2026-11-20');
assert.equal(build([])('unexpected input').id, 77);
assert.equal(build([{id:88, text:'Из календаря', quote_date:'2026-11-20'}])
  (new Date(2026,10,20)).id, 88);

console.log('PASS: self-contained date handling; date formatting helpers not required.');
console.log('PASS: default date, supplied date, invalid input, calendar priority.');
const output = original.includes('\r\n') ? newSource.replace(/\n/g, '\r\n') : newSource;
if (output === original) {
  console.log('NO CHANGES NEEDED.');
  process.exit(0);
}
if (dryRun) {
  console.log('DRY RUN: only src/services/dailyQuote.js would change.');
  console.log('NO FILES MODIFIED.');
  process.exit(0);
}

const backupDir = path.resolve(root, '..', 'build-backups',
  'fix-daily-quote-date-' + new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(backupDir, {recursive:true});
const backup = path.join(backupDir, 'dailyQuote.js');
fs.copyFileSync(file, backup);
fs.writeFileSync(file, output, 'utf8');
console.log('FIXED: src/services/dailyQuote.js');
console.log('BACKUP: ' + backup);
