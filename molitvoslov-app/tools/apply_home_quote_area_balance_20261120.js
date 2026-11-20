#!/usr/bin/env node
'use strict';

// Safe quote layout refinement for a local checkout with uncommitted work.
// No branch switches and no whole-file replacement from another branch.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const target = path.join(root, 'src/screens/MenuScreen.js');
const original = fs.readFileSync(target, 'utf8');
let source = original.replace(/\r\n/g, '\n');
const dryRun = process.argv.includes('--dry-run');

const change = (before, after, label) => {
  if (source.includes(after)) return;
  const count = source.split(before).length - 1;
  if (count !== 1) throw Error(label + ': expected one anchor, found ' + count + '. NO FILES MODIFIED.');
  source = source.replace(before, after);
};
change(
  "  const dailyQuoteBibleTarget = resolveDailyQuoteSource(dailyQuote);",
  "  const dailyQuoteBibleTarget = resolveDailyQuoteSource(dailyQuote);\n  const dailyQuoteText = String(getLocalizedField(dailyQuote, 'text', calendarLanguage) || '');",
  'Derive quote length'
);
change(
  `  quoteStaircase: {
    width: '100%',
    alignItems: 'flex-start',
  },`,
  `  quoteStaircase: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    alignItems: 'flex-start',
    // Keep the quotation centered in the available upper banner area.
    justifyContent: 'center',
  },`,
  'Use full quote banner height'
);
change(
  `    paddingVertical: 7,
    left: 18,
    right: 18,
    bottom: 32,`,
  `    paddingVertical: 9,
    left: 18,
    right: 18,
    bottom: 32,`,
  'Increase vertical padding by two pixels'
);
change(
  `                  {!!getLocalizedField(dailyQuote, 'text', calendarLanguage) && (
                    <Text
                      style={styles.heroQuoteText}`,
  `                  {!!dailyQuoteText && (
                    <Text
                      style={[
                        styles.heroQuoteText,
                        dailyQuoteText.length <= 65
                          ? styles.heroQuoteTextShort
                          : dailyQuoteText.length <= 105
                            ? styles.heroQuoteTextMedium
                            : null,
                      ]}`,
  'Adapt font size to quote length'
);
change(
  "                      {getLocalizedField(dailyQuote, 'text', calendarLanguage)}\n                    </Text>",
  "                      {dailyQuoteText}\n                    </Text>",
  'Render already localized quotation'
);
change(
  `    textShadowRadius: 2,
  },

  heroQuoteInitial: {`,
  `    textShadowRadius: 2,
  },

  heroQuoteTextShort: {
    fontSize: 22,
    lineHeight: 28,
  },

  heroQuoteTextMedium: {
    fontSize: 20,
    lineHeight: 26,
  },

  heroQuoteInitial: {`,
  'Add adaptive quote typography'
);

for (const expected of [
  "'rgba(52, 30, 17, 0.48)'",
  "'rgba(52, 30, 17, 0.28)'",
  'numberOfLines={7}',
  "paddingVertical: 9,\n    left: 18,\n    right: 18,\n    bottom: 32,",
  "quoteStaircase: {\n    flex: 1",
]) {
  if (!source.includes(expected)) throw Error('Quote UI preflight failed: ' + expected);
}
try {
  require('@babel/parser').parse(source, {sourceType: 'module',plugins: ['jsx']});
} catch (error) {
  if (error.code === 'MODULE_NOT_FOUND') {
    console.warn('WARN: Babel parser unavailable; static syntax test skipped.');
  } else {
    throw error;
  }
}
if (original.includes('\r\n')) source = source.replace(/\n/g, '\r\n');
if (source === original) {
  console.log('PASS: quote card layout already updated; no changes needed.');
  process.exit(0);
}
console.log('PASS: original gradients unchanged; quote centered; vertical padding 7 -> 9; adaptive text.');
if (dryRun) {
  console.log('DRY RUN: NO FILES MODIFIED.');
  process.exit(0);
}
const backup = path.resolve(root, '..', 'build-backups', 'quote-area-' + new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(backup, {recursive: true});
fs.copyFileSync(target, path.join(backup, 'MenuScreen.js'));
fs.writeFileSync(target, source, 'utf8');
console.log('UPDATED: src/screens/MenuScreen.js');
console.log('BACKUP: ' + backup);
