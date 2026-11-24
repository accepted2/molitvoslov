#!/usr/bin/env node
'use strict';
// Installs a reversible, temporary before/after cleanup preview into the
// user's EXISTING local SaintDetailScreen. Does not replace the screen from GitHub,
// calendar JSON, SQLite, icons, readings, or manual edits.
const fs = require('node:fs');
const path = require('node:path');
const parser = require('@babel/parser');
const root = path.resolve(__dirname, '..');
const target = path.join(root, 'src/screens/SaintDetailScreen.js');
const cleaner = path.join(root, 'src/services/calendarSourceCleanupPreview.js');
const panel = path.join(root, 'src/components/reader/CalendarCleanupPreviewPanel.js');
const apply = process.argv.includes('--apply');
const restore = process.argv.includes('--restore');
const backup = target + '.before-cleanup-preview-20261123.bak';

if (restore) {
  if (!fs.existsSync(backup)) throw new Error('Preview backup not found: ' + backup);
  const current = fs.readFileSync(target, 'utf8');
  if (!current.includes('cleanupComparisonEnabled')) {
    throw new Error('Preview signature not found in working screen; refusing to overwrite newer edits.');
  }
  fs.copyFileSync(backup, target);
  console.log('RESTORED original SaintDetailScreen from ' + backup);
  process.exit(0);
}

for (const file of [target, cleaner, panel]) {
  if (!fs.existsSync(file)) throw new Error('Missing preview input file: ' + file);
}
const original = fs.readFileSync(target, 'utf8');
const parse = value => parser.parse(value, {sourceType:'module', plugins:['jsx']});
parse(original);
const cleanerImport = "import {previewCleanCalendarFeast, countPreviewChanges} from '../services/calendarSourceCleanupPreview';";
const panelImport = "import {CalendarCleanupPreviewPanel} from '../components/reader/CalendarCleanupPreviewPanel';";
const languageImport = "import {useLanguage} from '../context/LanguageContext';";
const signature = /const resolvedFeast\s*=\s*calendarFeast\s*\|\|\s*feast\s*\|\|\s*\{\s*\}\s*;/;
const stateBlock = [
  "const cleanupComparisonEnabled = process.env.EXPO_PUBLIC_CALENDAR_CLEANUP_PREVIEW === '1';",
  "  const [cleanupPreviewActive, setCleanupPreviewActive] = useState(false);",
  "  const originalFeast = calendarFeast || feast || {};",
  "  const cleanedPreviewFeast = previewCleanCalendarFeast(originalFeast);",
  "  const cleanupPreviewStats = countPreviewChanges(originalFeast, cleanedPreviewFeast, language === 'uk' ? 'uk' : 'ru');",
  "  const resolvedFeast = cleanupComparisonEnabled && cleanupPreviewActive ? cleanedPreviewFeast : originalFeast;",
].join('\n');
const tag = '<View style={[styles.heroCard';
const panelMarkup = [
  '{cleanupComparisonEnabled && (',
  '          <CalendarCleanupPreviewPanel language={language}',
  '            active={cleanupPreviewActive} onChange={setCleanupPreviewActive}',
  '            stats={cleanupPreviewStats} />',
  '        )}',
  '        ',
].join('\n');

let updated = original;
if (updated.includes('cleanupComparisonEnabled')) {
  throw new Error('Preview is already installed. Existing changes preserved.');
}
if (!signature.test(updated)) {
  throw new Error('Expected offline saint card assignment is missing. No files were changed.');
}
if (!updated.includes(languageImport) || !updated.includes(tag)) {
  throw new Error('Cannot locate language import or saint hero card. No changes made.');
}
if (!updated.includes('import React') || !updated.includes('useState')) {
  throw new Error('Saint screen must already import useState. No changes made.');
}
updated = updated.replace(languageImport,
  languageImport + '\n' + cleanerImport + '\n' + panelImport);
updated = updated.replace(signature, stateBlock);
updated = updated.replace(tag, panelMarkup + tag);
parse(updated);
console.log('PREVIEW VALIDATED: local SaintDetailScreen can show before / after.');
console.log('Source bytes before: ' + original.length + ', after: ' + updated.length);
console.log('No calendar data, assets or database files modified.');
if (!apply) {
  console.log('CHECK ONLY: no changes written. Use --apply to install.');
  process.exit(0);
}
if (fs.existsSync(backup)) {
  throw new Error('A preview backup already exists; refusing to replace it.');
}
fs.copyFileSync(target, backup);
fs.writeFileSync(target, updated, 'utf8');
console.log('INSTALLED: temporary in-app saint text preview.');
console.log('Backup: ' + backup);
console.log('Enable in build by setting EXPO_PUBLIC_CALENDAR_CLEANUP_PREVIEW=1.');
