#!/usr/bin/env node
'use strict';
// Safe compatibility patch for locally modified contentStore.js.
// No app data is purged. If the runtime's cache activation differs semantically,
// stop rather than overwriting any locally edited file.
const fs = require('node:fs');
const path = require('node:path');
const {parse} = require('@babel/parser');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'src/services/contentStore.js');
const source = fs.readFileSync(file, 'utf8');
const bom = source.startsWith('\uFEFF') ? '\uFEFF' : '';
const normalize = s => s.replace(/\r\n/g, '\n');
const plain = normalize(source.slice(bom.length));
const marker = 'MOLITVOSLOV_BUNDLED_PUBLIC_CONTENT_VERSION_GUARD_V1';

if (plain.includes(marker)) {
  console.log('PASS: bundled-content cache version guard already installed.');
  process.exit(0);
}
// Newer offline-only builds already make bundled content authoritative,
// and update only the PUBLIC SQLite cache without touching personal data.
// For these builds no compatibility patch is necessary.
if (plain.includes('PUBLIC_CONTENT_BUNDLED_ONLY_V1') &&
    /activateContent\s*\(\s*bundledContent\s*,\s*bundledVersion\s*,\s*\{\s*notify\s*:\s*false\s*\}\s*\)/.test(plain) &&
    !/activateContent\s*\(\s*parsed\s*,\s*row\.version/.test(plain)) {
  console.log('PASS: bundled-only contentStore.js already protects new offline prayers. NO FILES MODIFIED.');
  process.exit(0);
}
if (!/\bbundledContent\b/.test(plain) ||
    !/\bactivateContent\b/.test(plain) ||
    !/\brow\.version\b/.test(plain) ||
    !/\bparsed\b/.test(plain)) {
  console.error('This local contentStore.js has a different data flow.');
  console.error('NO FILES MODIFIED. Please show the hydration block instead of resetting the file.');
  process.exit(2);
}
// Support whitespace variations and comments inserted around the original
// activation call, but ONLY the single known expression and argument names.
// Do not patch unrelated activateContent calls.
const pattern = /\bif\s*\(\s*activateContent\s*\(\s*parsed\s*,\s*row\.version\s*,\s*\{\s*notify\s*:\s*false\s*\}\s*\)\s*\)\s*\{/g;
const matches = [...plain.matchAll(pattern)];
if (matches.length !== 1) {
  console.error('Unable to identify a unique SQLite cache activation point (' + matches.length + ' matches).');
  console.error('Relevant code (no secrets):');
  plain.split('\n').forEach((line, i) => {
    if (/activateContent\s*\(|row\?\.payload|row\.payload|JSON\.parse\(row\.payload\)/.test(line))
      console.error('  ' + (i + 1) + ': ' + line.trim().slice(0, 180));
  });
  console.error('NO FILES MODIFIED. Do not overwrite or restore contentStore.js.');
  process.exit(2);
}
const replacement = [
  '// ' + marker,
  '// Use cached data only if it matches the public content bundled in this APK.',
  '// Older caches must not mask newly imported offline prayers.',
  "if ((!bundledContent?.content_version ||",
  "     String(row.version || parsed?.content_version || '') ===",
  "       String(bundledContent.content_version)) &&",
  "    activateContent(parsed, row.version, {notify: false})) {",
].join('\n');
const next = plain.replace(pattern, replacement);
try {
  parse(next, {sourceType: 'module', plugins: ['jsx']});
} catch (error) {
  throw new Error('Patched contentStore.js failed syntax check; NO FILES MODIFIED: ' + error.message);
}
if (process.argv.includes('--dry-run')) {
  console.log('DRY RUN PASS: compatible cache guard prepared; NO FILES MODIFIED.');
  process.exit(0);
}
const updated = bom + (source.includes('\r\n') ? next.replace(/\n/g, '\r\n') : next);
const backupDir = path.resolve(root, '..', 'build-backups',
  'bundled-prayers-cache-before-' + new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(backupDir, {recursive:true});
fs.copyFileSync(file, path.join(backupDir, 'contentStore.js'));
fs.writeFileSync(file, updated, 'utf8');
console.log('PASS: cache guard installed while retaining local contentStore.js changes.');
console.log('Backup: ' + backupDir);
