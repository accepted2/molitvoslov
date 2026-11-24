#!/usr/bin/env node
'use strict';

// Install the long-quote rotation without switching branches or overwriting
// unrelated edits in the existing local working tree.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const dryRun = process.argv.includes('--dry-run');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const proposed = [];
const fail = message => {throw Error(message + ' — NO FILES MODIFIED');};
const plan = (name, before, after) => {
  if (after !== before) proposed.push({name, before, after});
};
const once = (s, before, after, name) => {
  if (s.includes(after)) return s;
  const count = s.split(before).length - 1;
  if (count !== 1) fail(name + ': expected one safe anchor, found ' + count);
  return s.replace(before, after);
};

for (const file of [
  'src/data/curatedLongFatherQuotes.json',
  'src/services/extendedDailyQuote.js',
  'tools/test_extended_daily_quotes_20261120.js',
]) if (!fs.existsSync(path.join(root, file))) fail('Missing source file: ' + file);

const long = JSON.parse(read('src/data/curatedLongFatherQuotes.json'));
const legacy = JSON.parse(read('src/data/curatedDailyQuotes.json'));
if (legacy.count !== 151 || legacy.quotes.length !== 151) fail('Expected preserved 151 legacy quotations');
if (long.count !== 22 || long.quotes.length !== 22 ||
    long.quotes.some(item => item.text.length < 150 || item.text.length > 300)) {
  fail('Invalid 22-entry verified Fathers catalogue');
}

const serviceName = 'src/services/dailyQuote.js';
const serviceOriginal = read(serviceName);
let service = serviceOriginal.replace(/\r\n/g, '\n');
service = once(service,
  "import curated from '../data/curatedDailyQuotes.json';",
  "import curated from '../data/curatedDailyQuotes.json';\n" +
  "import longFathers from '../data/curatedLongFatherQuotes.json';\n" +
  "import {selectExtendedDailyQuote} from './extendedDailyQuote';",
  'Install long-quote imports');
const selection = "  const chosen = selectExtendedDailyQuote(\n" +
  "    getDateOrdinal(date), longFathers.quotes || [], curated.quotes || []);\n" +
  "  if (chosen) return {...chosen, date: today};\n" +
  "  return {id: null, text: 'Господи, научи меня молиться.',\n" +
  "    reference: '', source: '', date: today};";
if (!service.includes(selection)) {
  const markers = [
    '  const rotation = curated.quotes || [];',
    '  const quotes = curated.quotes || [];'
  ];
  const positions = markers.map(marker => service.indexOf(marker)).filter(n => n >= 0);
  if (positions.length !== 1) fail('Local dailyQuote fallback has changed; manual review required');
  const begin = positions[0];
  const end = service.indexOf('\n};', begin);
  if (end < begin) fail('Could not locate quote selector function end');
  service = service.slice(0, begin) + selection + service.slice(end);
}
plan(serviceName, serviceOriginal, serviceOriginal.includes('\r\n') ? service.replace(/\n/g, '\r\n') : service);

const menuName = 'src/screens/MenuScreen.js';
const menuOriginal = read(menuName);
let menu = menuOriginal.replace(/\r\n/g, '\n');
menu = once(menu, "  hero: {\n    minHeight: 330,", "  hero: {\n    minHeight: 360,", 'Give long quotes vertical space');
menu = once(menu, "                      numberOfLines={7}", "                      numberOfLines={9}", 'Allow nine quote lines');
menu = once(menu, "                      minimumFontScale={0.78}", "                      minimumFontScale={0.72}", 'Fit text on narrow screens');
menu = once(menu,
  "    fontSize: 17,\n    lineHeight: 23,\n\n    textShadowColor",
  "    fontSize: 17,\n    lineHeight: 22,\n\n    textShadowColor",
  'Adjust long-quote line height');
if (!menu.includes("'rgba(52, 30, 17, 0.48)'") ||
    !menu.includes("'rgba(52, 30, 17, 0.28)'")) fail('Original quote gradients were modified elsewhere');
plan(menuName, menuOriginal, menuOriginal.includes('\r\n') ? menu.replace(/\n/g, '\r\n') : menu);

const testName = 'tools/test_home_daily_quotes_20261120.js';
const testOriginal = read(testName);
let oldTest = testOriginal;
for (const value of ['5', '7']) {
  const from = "assert(menu.includes('numberOfLines={" + value + "}'));";
  const to = "assert(menu.includes('numberOfLines={9}'));";
  if (oldTest.includes(from)) oldTest = oldTest.replace(from, to);
}
plan(testName, testOriginal, oldTest);

try {
  const {parse} = require('@babel/parser');
  parse(service, {sourceType: 'module'});
  parse(menu, {sourceType: 'module', plugins: ['jsx']});
  parse(read('src/services/extendedDailyQuote.js'), {sourceType: 'module'});
} catch (error) {
  if (error.code === 'MODULE_NOT_FOUND') {
    console.warn('WARN: Babel parser unavailable; static syntax validation skipped.');
  } else throw error;
}

console.log('PREFLIGHT PASS: 22 long Fathers, intact 151 legacy quotes, original gradients.');
console.log('FILES: ' + (proposed.map(x => x.name).join(', ') || 'no changes needed'));
if (dryRun) {
  console.log('DRY RUN: NO FILES MODIFIED.');
  process.exit(0);
}
if (!proposed.length) {
  console.log('ALREADY APPLIED.');
  process.exit(0);
}

const backup = path.resolve(root, '..', 'build-backups',
  'extended-daily-quotes-' + new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(backup, {recursive: true});
for (const change of proposed) {
  const dest = path.join(backup, change.name);
  fs.mkdirSync(path.dirname(dest), {recursive: true});
  fs.writeFileSync(dest, change.before);
}
try {
  for (const change of proposed) fs.writeFileSync(path.join(root, change.name), change.after, 'utf8');
} catch (error) {
  for (const change of proposed) {
    fs.copyFileSync(path.join(backup, change.name), path.join(root, change.name));
  }
  throw error;
}
console.log('UPDATED: ' + proposed.length + ' tracked files.');
console.log('BACKUP: ' + backup);
