#!/usr/bin/env node
'use strict';
// Surgical repair: the local Home screen may already have only *part* of the
// long-quote migration. Repair the undefined access, not the entire screen.
const fs = require('node:fs');
const path = require('node:path');
const {parse} = require('@babel/parser');
const root = path.resolve(__dirname, '..');
const relative = 'src/screens/MenuScreen.js';
const filename = path.join(root, relative);
const original = fs.readFileSync(filename, 'utf8');
const dryRun = process.argv.includes('--dry-run');
let code = original.replace(/\r\n/g, '\n');

const loadStart = code.indexOf('const loadLibrary =');
const loadEnd = code.indexOf('const loadCalendarDay =', loadStart);
if (loadStart < 0 || loadEnd <= loadStart) {
  throw Error('Could not isolate local loadLibrary; NO FILES MODIFIED.');
}
let section = code.slice(loadStart, loadEnd);
const before = /\bquoteResponse\s*(?:\?\.)?\s*\.\s*data\b/g;
const count = [...section.matchAll(before)].length;
if (count > 1) throw Error('Unexpected multiple quoteResponse.data uses; NO FILES MODIFIED.');
if (count === 0) {
  if (section.includes('getDailyQuote()')) {
    console.log('ALREADY FIXED: Home uses getDailyQuote(). NO FILES MODIFIED.');
    process.exit(0);
  }
  throw Error('Neither quoteResponse.data nor getDailyQuote() found; NO FILES MODIFIED.');
}
section = section.replace(before, 'getDailyQuote()');
// Other legacy quoteResponse bindings are harmless, and can be a one-sided
// partial migration; do not demand that destructuring and API calls match.
code = code.slice(0, loadStart) + section + code.slice(loadEnd);
if (!code.includes("from '../services/dailyQuote'")) {
  throw Error('getDailyQuote import not present. NO FILES MODIFIED.');
}
parse(code, {sourceType: 'module', plugins: ['jsx']});
console.log('PASS: removed undefined quoteResponse.data from Home.');
console.log('PASS: preserved local library loading, extra requests and unrelated UI.');
if (dryRun) {
  console.log('DRY RUN: NO FILES MODIFIED.');
  process.exit(0);
}
const backupDir = path.resolve(root, '..', 'build-backups',
  'quote-response-v2-' + new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(backupDir, {recursive: true});
const backup = path.join(backupDir, 'MenuScreen.js');
fs.copyFileSync(filename, backup);
fs.writeFileSync(filename,
  original.includes('\r\n') ? code.replace(/\n/g, '\r\n') : code, 'utf8');
console.log('UPDATED: ' + relative);
console.log('BACKUP: ' + backup);
