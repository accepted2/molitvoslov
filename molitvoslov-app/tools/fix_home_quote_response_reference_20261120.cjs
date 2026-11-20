#!/usr/bin/env node
'use strict';
// Fix a stale quoteResponse reference in the locally modified Home screen.
// Do not replace MenuScreen, switch branches, or touch the database.
const fs = require('node:fs');
const path = require('node:path');
const {parse} = require('@babel/parser');
const root = path.resolve(__dirname, '..');
const relative = 'src/screens/MenuScreen.js';
const filename = path.join(root, relative);
const original = fs.readFileSync(filename, 'utf8');
let source = original.replace(/\r\n/g, '\n');
const dry = process.argv.includes('--dry-run');
const start = source.indexOf('  const loadLibrary = useCallback(async () => {');
const end = source.indexOf('\n  const loadCalendarDay = useCallback(', start);
if (start < 0 || end < start) {
  throw Error('loadLibrary section not recognized; NO FILES MODIFIED');
}
if (!source.includes("import {getDailyQuote} from '../services/dailyQuote';") &&
    !source.includes("import {getDailyQuote} from '../services/dailyQuote'")) {
  throw Error('getDailyQuote import not found; NO FILES MODIFIED');
}
let section = source.slice(start, end);
const oldQuote = 'const quote = quoteResponse.data;';
const newQuote = 'const quote = getDailyQuote();';
const instances = section.split(oldQuote).length - 1;
if (instances === 1) {
  section = section.replace(oldQuote, newQuote);
} else if (instances === 0 && section.includes(newQuote) && !section.includes('quoteResponse')) {
  console.log('ALREADY FIXED. NO FILES MODIFIED.');
  process.exit(0);
} else {
  throw Error('Unexpected quoteResponse use (' + instances +
    ' expected assignment). NO FILES MODIFIED');
}
// Legacy local branches sometimes still fetch quoteResponse in Promise.all.
// Remove that extra request only if both matching entries are present.
const hasDestructure = /^\s+quoteResponse,\s*$/mu.test(section);
const hasApiCall = /^\s+api\.get\('daily-quotes\/today\/'\),\s*$/mu.test(section);
if (hasDestructure !== hasApiCall) {
  throw Error('Mismatched legacy quoteResponse request. NO FILES MODIFIED');
}
if (hasDestructure) {
  section = section.replace(/^\s+quoteResponse,\s*\n/mu, '\n');
  section = section.replace(/^\s+api\.get\('daily-quotes\/today\/'\),\s*\n/mu, '\n');
}
if (section.includes('quoteResponse')) {
  throw Error('Other quoteResponse references remain. NO FILES MODIFIED');
}
source = source.slice(0, start) + section + source.slice(end);
parse(source, {sourceType:'module', plugins:['jsx']});
const output = original.includes('\r\n') ? source.replace(/\n/g, '\r\n') : source;
console.log('PASS: Home daily quote uses getDailyQuote() directly; no undefined quoteResponse.');
console.log('PASS: existing cards and unrelated local screen edits preserved.');
if (dry) {
  console.log('DRY RUN: NO FILES MODIFIED.');
  process.exit(0);
}
const backupDir = path.resolve(root, '..', 'build-backups',
  'quote-response-' + new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(backupDir, {recursive:true});
const backup = path.join(backupDir, 'MenuScreen.js');
fs.copyFileSync(filename, backup);
fs.writeFileSync(filename, output, 'utf8');
console.log('FIXED: ' + relative);
console.log('BACKUP: ' + backup);
