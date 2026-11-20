#!/usr/bin/env node
'use strict';

// Patch only the visible quotation and banner background in MenuScreen.
// Works in a diverged local worktree; never resets or switches Git branches.
const fs = require('node:fs');
const path = require('node:path');
const {parse} = require('@babel/parser');
const root = path.resolve(__dirname, '..');
const relative = 'src/screens/MenuScreen.js';
const target = path.join(root, relative);
const original = fs.readFileSync(target, 'utf8');
let source = original.replace(/\r\n/g, '\n');
const dryRun = process.argv.includes('--dry-run');
const changes = [];

function patch(before, after, description) {
  if (source.includes(after)) return;
  const matches = source.split(before).length - 1;
  if (matches !== 1) {
    throw Error(description + ': found ' + matches + ' original anchors. NO FILES MODIFIED.');
  }
  source = source.replace(before, after);
  changes.push(description);
}

const oldFade = [
  "                  'rgba(255, 244, 222, 0)',",
  "                  'rgba(183, 138, 88, 0.18)',",
  "                  'rgba(183, 138, 88, 0.62)',",
  "                  '#D6B07C',",
  "                ]}",
  "                locations={[0, 0.46, 0.76, 1]}",
].join('\n');
const newFade = [
  "                  'rgba(214, 176, 124, 0)',",
  "                  'rgba(214, 176, 124, 0.06)',",
  "                  'rgba(214, 176, 124, 0.16)',",
  "                  'rgba(214, 176, 124, 0.34)',",
  "                  'rgba(214, 176, 124, 0.68)',",
  "                ]}",
  "                locations={[0, 0.35, 0.63, 0.84, 1]}",
].join('\n');
patch(oldFade, newFade, 'Soft bottom fade');

patch(
  "top: Math.max(insets.top + 48, 76)",
  "top: Math.max(insets.top + 49.5, 77.5)",
  'Add 1.5px top inset'
);
patch(
  "  heroImage: {\n    opacity: 1,\n    maxHeight: 320,\n  },",
  "  heroImage: {\n    opacity: 1,\n  },",
  'Remove image 320px height cap'
);
patch(
  "  heroBottomGradient: {\n    position: 'absolute',\n    left: 0,\n    right: 0,\n    bottom: 0,\n    height: 92,",
  "  heroBottomGradient: {\n    position: 'absolute',\n    left: 0,\n    right: 0,\n    bottom: 0,\n    height: 142,",
  'Extend fade height'
);

const oldQuote = "  const dailyQuoteText = String(getLocalizedField(dailyQuote, 'text', calendarLanguage) || '');";
const newQuote = [
  "  const dailyQuoteText = String(getLocalizedField(dailyQuote, 'text', calendarLanguage) || '').trim();",
  "  const dailyQuoteDisplayText = dailyQuoteText",
  "    ? dailyQuoteText.startsWith('«') && dailyQuoteText.endsWith('»')",
  "      ? dailyQuoteText",
  "      : '«' + dailyQuoteText + '»'",
  "    : '';",
].join('\n');
patch(oldQuote, newQuote, 'Use real visible quotation marks');
patch(
  "                      {dailyQuoteText}\n                    </Text>",
  "                      {dailyQuoteDisplayText}\n                    </Text>",
  'Render quotation marks'
);

const newTextStyle = [
  "  heroQuoteText: {",
  "    color: '#FFF5E4',",
  "    fontFamily: 'serif',",
  "    fontStyle: 'italic',",
  "    fontWeight: '500',",
  "    fontSize: 17,",
  "    lineHeight: 21,",
  "    letterSpacing: 0.1,",
  "",
  "    textShadowColor: 'rgba(16, 9, 6, 0.94)',",
  "    textShadowOffset: {",
  "      width: 0,",
  "      height: 1,",
  "    },",
  "    textShadowRadius: 2.7,",
  "  },",
].join('\n');
if (!source.includes(newTextStyle)) {
  const start = source.indexOf('  heroQuoteText: {');
  const end = source.indexOf('\n\n  heroQuoteTextShort:', start);
  if (start < 0 || end < start) {
    throw Error('Unrecognized quotation typography. NO FILES MODIFIED.');
  }
  const oldStyle = source.slice(start, end);
  if (!oldStyle.includes("fontFamily: 'serif'") ||
      !oldStyle.includes('textShadowColor:')) {
    throw Error('Quote font has changed unexpectedly. NO FILES MODIFIED.');
  }
  source = source.slice(0, start) + newTextStyle + source.slice(end);
  changes.push('Italic serif, richer contrast, 21px line height');
}

// Syntax check is compulsory before any filesystem mutation.
parse(source, {sourceType: 'module', plugins: ['jsx']});
if (!source.includes("                'rgba(214, 176, 124, 0.68)',") ||
    !source.includes('dailyQuoteDisplayText') ||
    source.includes("heroImage: {\n    opacity: 1,\n    maxHeight: 320")) {
  throw Error('Visual quote invariants failed. NO FILES MODIFIED.');
}

const output = original.includes('\r\n') ?
  source.replace(/\n/g, '\r\n') : source;
console.log('PASS: smooth lower fade, full background, 1.5px top inset, readable italic quotes.');
console.log('CHANGES: ' + (changes.join('; ') || 'none'));
if (output === original) {
  console.log('ALREADY APPLIED. NO FILES MODIFIED.');
  process.exit(0);
}
if (dryRun) {
  console.log('DRY RUN: only ' + relative + ' would change. NO FILES MODIFIED.');
  process.exit(0);
}

const backupDir = path.resolve(root, '..', 'build-backups',
  'quote-visual-' + new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(backupDir, {recursive: true});
const backup = path.join(backupDir, 'MenuScreen.js');
fs.copyFileSync(target, backup);
fs.writeFileSync(target, output, 'utf8');
console.log('UPDATED: ' + relative);
console.log('BACKUP: ' + backup);
