#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {parse} = require('@babel/parser');

const root = path.resolve(__dirname, '..');
const file = path.join(root, 'src/services/dailyQuote.js');
const original = fs.readFileSync(file,'utf8');
let source = original.replace(/\r\n/g, '\n');
const dry = process.argv.includes('--dry-run');

const requiredFiles = [
  'src/data/curatedDailyQuotes.json',
  'src/data/curatedLongFatherQuotes.json',
  'src/data/curatedRequestedQuotes20261120.json',
  'src/services/extendedDailyQuote.js'
];
for (const rel of requiredFiles) {
  assert(fs.existsSync(path.join(root,rel)), 'Missing ' + rel + '; no files changed');
}
const selected = JSON.parse(fs.readFileSync(
  path.join(root,'src/data/curatedRequestedQuotes20261120.json'),'utf8'));
const previous = JSON.parse(fs.readFileSync(
  path.join(root,'src/data/curatedDailyQuotes.json'),'utf8'));
assert(selected.fatherQuotes?.length === 9 && selected.bibleQuotes?.length === 21);
assert(previous.count === 151 && previous.quotes?.length === 151);
assert(selected.fatherQuotes.every(q => q.text?.length >= 150 && q.text.length <= 300));
parse(fs.readFileSync(path.join(root,'src/services/extendedDailyQuote.js'),'utf8'),
  {sourceType:'module'});

const originalAST = parse(source,{sourceType:'module'});
const allImports = originalAST.program.body.filter(node =>
  node.type === 'ImportDeclaration');
const names = new Set(allImports.flatMap(node =>
  node.specifiers.map(spec => spec.local.name)));
for (const name of ['getCurrentContent','longFathers','selectExtendedDailyQuote']) {
  assert(names.has(name), 'Local dailyQuote.js is missing ' + name +
    '; no files changed; share that file for manual merge');
}
const quoteImport = '../data/curatedRequestedQuotes20261120.json';
if (!source.includes(quoteImport)) {
  const last = allImports.at(-1);
  assert(last, 'No imports found, no files changed');
  source = source.slice(0,last.end) +
    "\nimport userSelected from '" + quoteImport + "';" +
    source.slice(last.end);
}

const decl = "export const getDailyQuote = (requestedDate = new Date()) => {\n  const date = requestedDate instanceof Date && !Number.isNaN(requestedDate.getTime())\n    ? requestedDate : new Date();\n  const today = String(date.getFullYear()) + '-' +\n    String(date.getMonth() + 1).padStart(2, '0') + '-' +\n    String(date.getDate()).padStart(2, '0');\n  const ordinal = Math.floor(Date.UTC(\n    date.getFullYear(), date.getMonth(), date.getDate()) / 86400000) + 719163;\n\n  const calendar = getCurrentContent()?.daily_quotes;\n  const exact = (Array.isArray(calendar) ? calendar : [])\n    .find(item => item && item.quote_date === today &&\n      typeof item.text === 'string' &&\n      item.text.length >= 150 && item.text.length <= 300);\n  if (exact) return {...exact, date: today};\n\n  // The 151 old entries remain in curatedDailyQuotes.json for saved hearts,\n  // but the daily rotation uses only long patristic and Scripture passages.\n  const fathers = [...(longFathers.quotes || []), ...(userSelected.fatherQuotes || [])];\n  const chosen = selectExtendedDailyQuote(\n    ordinal, fathers, userSelected.bibleQuotes || []);\n  if (chosen?.text && chosen.text.length >= 150 && chosen.text.length <= 300)\n    return {...chosen, date: today};\n\n  return {\n    id: null, text: 'Господи, научи меня молиться.',\n    reference: '', source: '', date: today,\n  };\n};";
const ast = parse(source,{sourceType:'module'});
const matches = ast.program.body.filter(node =>
  node.type === 'ExportNamedDeclaration' &&
  ((node.declaration?.type === 'VariableDeclaration' &&
    node.declaration.declarations.some(entry => entry.id?.name === 'getDailyQuote')) ||
   (node.declaration?.type === 'FunctionDeclaration' &&
    node.declaration.id?.name === 'getDailyQuote')));
assert(matches.length === 1, 'Expected one exported getDailyQuote, no files changed');
source = source.slice(0,matches[0].start) + decl + source.slice(matches[0].end);
parse(source,{sourceType:'module'});

const mock = new Function('getCurrentContent','selectExtendedDailyQuote',
  'longFathers','userSelected',
  decl.replace('export const ', 'const ') + '\nreturn getDailyQuote;');
const example = mock(
  () => ({daily_quotes:[]}),
  () => ({id:42,kind:'father',text:'д'.repeat(210)}),
  {quotes:[{id:42,kind:'father',text:'д'.repeat(210)}]},
  {fatherQuotes:[],bibleQuotes:[{id:21}]});
assert(example().id === 42);
assert(example(new Date(2026,10,20)).date === '2026-11-20');
assert(example('invalid input').id === 42);

const output = original.includes('\r\n') ?
  source.replace(/\n/g,'\r\n') : source;
console.log('PASS: 9 patristic and 21 Scripture selections are present.');
console.log('PASS: initial render, fixed date and invalid date do not crash.');
if (original === output) {
  console.log('ALREADY INSTALLED');
  process.exit(0);
}
if (dry) {
  console.log('DRY RUN: only src/services/dailyQuote.js will change.');
  console.log('NO FILES MODIFIED.');
  process.exit(0);
}
const backupDir = path.resolve(root,'..','build-backups',
  'daily-quotes-30-' + new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backupDir,{recursive:true});
const backup = path.join(backupDir,'dailyQuote.js');
fs.copyFileSync(file,backup);
fs.writeFileSync(file,output,'utf8');
console.log('UPDATED: src/services/dailyQuote.js');
console.log('BACKUP: ' + backup);
