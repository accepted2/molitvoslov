#!/usr/bin/env node
// Patch only local akathist heading color; preserve user CSS edits.
const fs = require('node:fs');
const path = require('node:path');
const cssPath = path.resolve(__dirname, '../src/components/reader/selectableDocumentReader/styles.js');
const before = fs.readFileSync(cssPath, 'utf8');
const selector = 'body:not(.book-mode) .rule-item.akathist-section .section-header .prayer-title';
const rule = /(body:not\(\.book-mode\)\s+\.rule-item\.akathist-section\s+\.section-header\s+\.prayer-title\s*\{[^}]*?\bcolor:\s*)[^;]+;/g;
const matches = [...before.matchAll(rule)];
if (matches.length > 1) throw new Error('Multiple heading rules found; CSS unchanged.');
let after;
if (matches.length === 1) {
  after = before.replace(rule, (_match, prefix) => prefix + '#765238 !important;');
} else {
  const tail = /\s*`;\s*$/;
  if (!tail.test(before) || !before.includes('export const READER_STYLES')) {
    throw new Error('Cannot find reader stylesheet template end; CSS unchanged.');
  }
  const extra = '\n    ' + selector + ' {\n      color: #765238 !important;\n    }\n  `;\n';
  after = before.replace(tail, extra);
}
if (after === before) { console.log('Already brown: #765238 !important'); process.exit(0); }
const backupDir = path.resolve(__dirname, '../../build-backups');
fs.mkdirSync(backupDir, {recursive:true});
const backup = path.join(backupDir, 'reader-styles-before-akathist-brown-' + Date.now() + '.js');
fs.copyFileSync(cssPath, backup);
fs.writeFileSync(cssPath, after, 'utf8');
console.log('Akathist headers: #765238 !important');
console.log('Other local styles preserved; backup:', backup);
console.log('Press r in Metro to reload.');
