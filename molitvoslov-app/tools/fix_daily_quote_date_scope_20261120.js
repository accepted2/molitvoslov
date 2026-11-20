#!/usr/bin/env node
'use strict';

// Repair only the exported getDailyQuote function in an otherwise divergent
// working tree. Keep all other local edits; write a backup before changing.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {parse} = require('@babel/parser');

const root = path.resolve(__dirname, '..');
const rel = 'src/services/dailyQuote.js';
const filename = path.join(root, rel);
const original = fs.readFileSync(filename, 'utf8');
const normalized = original.replace(/\r\n/g, '\n');
const dryRun = process.argv.includes('--dry-run');

const corrected = String.raw`export const getDailyQuote = (requestedDate = new Date()) => {
  // Ensure the same local date is used for both rotation and displayed value.
  const currentDate =
    requestedDate instanceof Date && !Number.isNaN(requestedDate.getTime())
      ? requestedDate
      : new Date();
  const today = formatLocalDate(currentDate);
  const calendarQuotes = getCurrentContent()?.daily_quotes;
  const exact = (Array.isArray(calendarQuotes) ? calendarQuotes : [])
    .find(item => item.quote_date === today &&
      typeof item.text === 'string' && item.text.trim());

  if (exact) return {...exact, date: today};

  const chosen = selectExtendedDailyQuote(
    getDateOrdinal(currentDate), longFathers.quotes || [], curated.quotes || []);
  if (chosen) return {...chosen, date: today};

  return {
    id: null,
    text: 'Господи, научи меня молиться.',
    reference: '',
    source: '',
    date: today,
  };
};`;

const required = [
  "from './contentStore'",
  "from '../data/curatedDailyQuotes.json'",
  "from '../data/curatedLongFatherQuotes.json'",
  "from './extendedDailyQuote'",
  'const formatLocalDate',
  'const getDateOrdinal',
];
for (const fragment of required) {
  if (!normalized.includes(fragment)) {
    throw Error('Unexpected local dailyQuote.js: missing ' + fragment +
      '. File not changed; inspect it before merging.');
  }
}

const ast = parse(normalized, {sourceType:'module'});
const nodes = ast.program.body.filter(node =>
  node.type === 'ExportNamedDeclaration' &&
  node.declaration?.type === 'VariableDeclaration' &&
  node.declaration.declarations.some(decl => decl.id?.name === 'getDailyQuote')
);
assert.equal(nodes.length, 1, 'Expected one exported getDailyQuote declaration');
const node = nodes[0];
const updated = normalized.slice(0, node.start) + corrected + normalized.slice(node.end);
parse(updated, {sourceType:'module'});

// Exercise the replacement independently of React Native and Bible imports.
const mocked = new Function(
  'getCurrentContent', 'selectExtendedDailyQuote', 'longFathers', 'curated',
  String.raw`
  const formatLocalDate = value =>
    String(value.getFullYear()) + '-' +
    String(value.getMonth() + 1).padStart(2, '0') + '-' +
    String(value.getDate()).padStart(2, '0');
  const getDateOrdinal = value => Math.floor(
    Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / 86400000
  ) + 719163;
  ${corrected.replace('export const ', 'const ')}
  return getDailyQuote;
  `,
)(
  () => ({daily_quotes:[]}),
  (ordinal) => ({id:99, text:'Проверочная цитата', kind:'father', ordinal}),
  {quotes:[{id:99,text:'Проверочная цитата'}]},
  {quotes:[]}
);
assert.equal(mocked().id, 99);
assert.equal(mocked(new Date(2026, 10, 20)).date, '2026-11-20');
assert.equal(mocked('invalid').id, 99);

const output = original.includes('\r\n') ? updated.replace(/\n/g, '\r\n') : updated;
console.log('PASS: getDailyQuote has an explicit date parameter and a clean initial render.');
console.log('PASS: mocked default date, explicit date, and invalid input.');
if (output === original) {
  console.log('ALREADY FIXED. NO FILES MODIFIED.');
  process.exit(0);
}
if (dryRun) {
  console.log('DRY RUN: only ' + rel + ' would be modified.');
  console.log('NO FILES MODIFIED.');
  process.exit(0);
}

const backupDir = path.resolve(root, '..', 'build-backups',
  'daily-quote-render-date-' + new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(backupDir, {recursive:true});
const backupFile = path.join(backupDir, 'dailyQuote.js');
fs.copyFileSync(filename, backupFile);
fs.writeFileSync(filename, output, 'utf8');
console.log('FIXED: ' + rel);
console.log('BACKUP: ' + backupFile);
