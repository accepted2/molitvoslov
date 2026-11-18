#!/usr/bin/env node
'use strict';
// Ensure new local bundled prayers take precedence over a stale persisted
// public-content cache from an earlier APK. Only patch the exact source shape;
// never overwrite unrelated reader changes or purge private user data.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'src/services/contentStore.js');
const source = fs.readFileSync(file, 'utf8');
const bom = source.startsWith('\uFEFF') ? '\uFEFF' : '';
const normalize = s => s.replace(/\r\n/g, '\n');
const plain = normalize(source.slice(bom.length));
const old = [
  '      if (row?.payload) {',
  '        const parsed = JSON.parse(row.payload);',
  '',
  '        if (activateContent(parsed, row.version, {notify: false})) {',
].join('\n');
const now = [
  '      if (row?.payload) {',
  '        const parsed = JSON.parse(row.payload);',
  '        // Public texts in this APK are authoritative. Never let an older',
  '        // SQLite cache hide new offline prayers after an application update.',
  "        const bundledVersion = String(bundledContent?.content_version || '');",
  "        const cachedVersion = String(row.version || parsed?.content_version || '');",
  '        if ((!bundledVersion || cachedVersion === bundledVersion) &&',
  '            activateContent(parsed, row.version, {notify: false})) {',
].join('\n');
if (plain.includes(now)) {
  console.log('PASS: bundled-content cache version guard already installed.');
  process.exit(0);
}
if (plain.split(old).length !== 2) {
  throw Error('contentStore.js has a different local implementation; NO FILES MODIFIED. Review this file manually.');
}
let next = plain.replace(old, now);
if (source.includes('\r\n')) next = next.replace(/\n/g, '\r\n');
const updated = bom + next;
if (process.argv.includes('--dry-run')) {
  console.log('DRY RUN PASS; would update src/services/contentStore.js; NO FILES MODIFIED.');
  process.exit(0);
}
const backupDir = path.resolve(root, '..', 'build-backups',
  'bundled-prayers-cache-before-' + new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(backupDir, {recursive:true});
fs.copyFileSync(file, path.join(backupDir, 'contentStore.js'));
fs.writeFileSync(file, updated, 'utf8');
console.log('PASS: bundled offline prayer updates no longer hidden by old SQLite cache.');
console.log('Backup:', backupDir);
