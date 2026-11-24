#!/usr/bin/env node
'use strict';

// Apply only the November 20 quote-card follow-up to a divergent local checkout.
// Never switch Git branches or replace the entire MenuScreen.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const dry = process.argv.includes('--dry-run');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const edits = [];
const addEdit = (relative, before, after) => {
  if (before !== after) edits.push({relative, before, after});
};
const replaceUnique = (s, before, after, label) => {
  if (s.includes(after)) return s;
  const n = s.split(before).length - 1;
  if (n !== 1) throw Error(label + ': expected one existing anchor, got ' + n + '. NO FILES MODIFIED.');
  return s.replace(before, after);
};

const menuPath = 'src/screens/MenuScreen.js';
const menuOriginal = read(menuPath);
let menu = menuOriginal.replace(/\r\n/g, '\n');

const strongH = `                  colors={[
                    'rgba(27, 18, 12, 0.08)',
                    'rgba(27, 18, 12, 0.66)',
                    'rgba(27, 18, 12, 0.78)',
                    'rgba(27, 18, 12, 0.66)',
                    'rgba(27, 18, 12, 0.08)',
                  ]}`;
const oldH = `                  colors={[
                    'rgba(52, 30, 17, 0)',
                    'rgba(52, 30, 17, 0.48)',
                    'rgba(52, 30, 17, 0.66)',
                    'rgba(52, 30, 17, 0.48)',
                    'rgba(52, 30, 17, 0)',
                  ]}`;
const strongV = `                  colors={[
                    'rgba(27, 18, 12, 0.08)',
                    'rgba(27, 18, 12, 0.52)',
                    'rgba(27, 18, 12, 0.70)',
                    'rgba(27, 18, 12, 0.55)',
                    'rgba(27, 18, 12, 0.12)',
                  ]}`;
const oldV = `                  colors={[
                    'rgba(52, 30, 17, 0)',
                    'rgba(52, 30, 17, 0.18)',
                    'rgba(52, 30, 17, 0.28)',
                    'rgba(52, 30, 17, 0.18)',
                    'rgba(52, 30, 17, 0)',
                  ]}`;
menu = replaceUnique(menu, strongH, oldH, 'Restore original horizontal gradient');
menu = replaceUnique(menu, strongV, oldV, 'Restore original vertical gradient');
menu = replaceUnique(
  menu,
  '<View style={styles.heroQuoteContent}>',
  '<View style={[styles.heroQuoteContent, {top: Math.max(insets.top + 48, 76)}]}>',
  'Expand quote region upward'
);
const heading = `                <View style={styles.heroQuoteHeading}>
                  {/*<Text style={styles.heroQuoteMark}>❧</Text>*/}
                  {/*<Text style={styles.heroQuoteLabel}>Цитата дня</Text>*/}
                </View>

`;
if (menu.includes(heading)) menu = menu.replace(heading, '');
menu = replaceUnique(
  menu,
  `                    <Text style={styles.heroQuoteText} numberOfLines={5}
                      adjustsFontSizeToFit minimumFontScale={0.84}>`,
  `                    <Text
                      style={styles.heroQuoteText}
                      numberOfLines={7}
                      adjustsFontSizeToFit
                      minimumFontScale={0.78}
                      ellipsizeMode="tail"
                    >`,
  'Allow seven lines of text'
);
menu = replaceUnique(
  menu,
  `  heroQuoteContent: {
    position: 'absolute',`,
  `  heroQuoteContent: {
    position: 'absolute',
    // Short quotations stay near the bottom; long quotations expand upward.
    justifyContent: 'flex-end',`,
  'Keep short quotes bottom-aligned'
);
if (menuOriginal.includes('\r\n')) menu = menu.replace(/\n/g, '\r\n');
addEdit(menuPath, menuOriginal, menu);

const quotePath = 'src/data/curatedDailyQuotes.json';
const quoteOriginal = read(quotePath);
const catalog = JSON.parse(quoteOriginal);
assert(Array.isArray(catalog.quotes));
assert(catalog.count === catalog.quotes.length);
const newText = 'Чем проще жизнь, тем лучше. Простота и смирение — два крыла, быстролетность сообщающие.';
const existing = catalog.quotes.find(q => q.id === 810151);
if (!existing) {
  assert.equal(catalog.quotes.length, 150, 'Unexpected quote count: no files modified');
  catalog.quotes.push({
    id: 810151,
    kind: 'father',
    text: newText,
    source: 'свт. Феофан Затворник',
    reference: 'свт. Феофан Затворник',
    work: 'Письма. Выпуск 5. Письмо 771',
    sourceUrl: 'https://azbyka.ru/otechnik/Feofan_Zatvornik/pisma/5',
    target: null,
    quote_date: null,
  });
  catalog.count = catalog.quotes.length;
} else {
  assert.equal(existing.text, newText, 'Quote 810151 has differing content: no files modified');
}
assert.equal(catalog.quotes.length, 151);
assert.equal(new Set(catalog.quotes.map(q => q.id)).size, 151);
const quoted = JSON.stringify(catalog, null, 2) + '\n';
addEdit(quotePath, quoteOriginal, quoted);

const testPath = 'tools/test_home_daily_quotes_20261120.js';
const testOriginal = read(testPath);
let test = testOriginal;
for (const [before, after] of [
  ['assert.equal(catalogue.count,150);', 'assert.equal(catalogue.count,151);'],
  ['assert.equal(q.length,150);', 'assert.equal(q.length,151);'],
  ['assert.equal(new Set(q.map(x=>x.id)).size,150);', 'assert.equal(new Set(q.map(x=>x.id)).size,151);'],
  ['assert.equal(fathers.length,15);', 'assert.equal(fathers.length,16);'],
  ["assert(menu.includes('numberOfLines={5}'));", "assert(menu.includes('numberOfLines={7}'));"],
  ["console.log('PASS: 150 short entries (85 Proverbs, 50 other Scripture, 15 Fathers).');", "console.log('PASS: 151 entries (85 Proverbs, 50 other Scripture, 16 Fathers).');"],
]) test = replaceUnique(test, before, after, 'Refresh quote validation');
addEdit(testPath, testOriginal, test);

const installerPath = 'tools/apply_home_daily_quotes_20261120.js';
if (fs.existsSync(path.join(root, installerPath))) {
  const installerOriginal = read(installerPath);
  const installer = replaceUnique(installerOriginal,
    'check(quotes.count===150&&quotes.quotes.length===150,',
    'check([150,151].includes(quotes.count)&&quotes.quotes.length===quotes.count,',
    'Allow re-running earlier installer after adding quote 151');
  addEdit(installerPath, installerOriginal, installer);
}

try {
  const {parse} = require('@babel/parser');
  parse(menu, {sourceType:'module',plugins:['jsx']});
  parse(test, {sourceType:'script'});
} catch (err) {
  if (err.code !== 'MODULE_NOT_FOUND') throw err;
  console.warn('WARN: Babel parser unavailable; syntax check skipped');
}

console.log('QUOTE FIX PASS: original gradients, upward layout, sourced quote 151.');
console.log('Changes: ' + (edits.map(x=>x.relative).join(', ') || 'none'));
if (dry) {
  console.log('DRY RUN: NO FILES MODIFIED.');
  process.exit(0);
}
if (!edits.length) {
  console.log('No changes needed: patch already applied.');
  process.exit(0);
}

const backup = path.resolve(root, '..', 'build-backups',
  'quote-layout-followup-' + new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backup, {recursive:true});
for (const edit of edits) {
  const target = path.join(backup, edit.relative);
  fs.mkdirSync(path.dirname(target), {recursive:true});
  fs.writeFileSync(target, edit.before, 'utf8');
}
for (const edit of edits) {
  fs.writeFileSync(path.join(root, edit.relative), edit.after, 'utf8');
}
console.log('UPDATED ' + edits.length + ' files.');
console.log('BACKUP: ' + backup);
