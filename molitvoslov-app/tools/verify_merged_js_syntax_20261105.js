#!/usr/bin/env node
// Read-only Babel syntax preflight for the merged React Native app.
// Prevents a missing comma in StyleSheet from breaking Metro.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const babel = require('@babel/parser');

const root = path.resolve(__dirname, '..');
const targets = [];
function collect(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const name = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', '.git', 'build', 'dist'].includes(entry.name)) collect(name);
    } else if (entry.isFile() && /\.(?:js|jsx)$/.test(entry.name)) {
      targets.push(name);
    }
  }
}
for (const name of ['App.js', 'index.js']) {
  const file = path.join(root, name);
  if (fs.existsSync(file)) targets.push(file);
}
collect(path.join(root, 'src'));
assert.ok(targets.length >= 10, 'Unexpectedly few JS source files');
const errors = [];
for (const filename of targets.sort()) {
  try {
    babel.parse(fs.readFileSync(filename, 'utf8'), {
      sourceType: 'unambiguous',
      plugins: ['jsx', 'flow'],
      errorRecovery: false,
    });
  } catch (error) {
    const location = error.loc ? (error.loc.line + ':' + (error.loc.column + 1)) : '?';
    errors.push(path.relative(root, filename) + ':' + location + ': ' + error.message);
  }
}
if (errors.length > 0) {
  console.error('FAIL: JavaScript/JSX syntax checks:\n' + errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('PASS: Babel parsed ' + targets.length +
    ' app JS/JSX sources (including ChurchCalendarScreen.js)');
  console.log('No parser errors; this does not replace device runtime tests.');
}
