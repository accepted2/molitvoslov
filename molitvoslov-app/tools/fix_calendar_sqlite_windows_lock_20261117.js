'use strict';

// Patch only two SQLite connection context managers for Python 3.14/Windows.
// Ordinary "with sqlite3.connect" commits/rolls back but DOES NOT close the DB.
// This script preserves unrelated local changes, CRLF, and saves backups.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

function replaceOnce(text, needle, replacement, location) {
  if (text.split(needle).length !== 2) {
    throw new Error('Unexpected structure in ' + location + '; nothing modified.');
  }
  return text.replace(needle, replacement);
}
function prepare(raw) {
  let s = raw.replace(/\r\n/g, '\n');
  const original = [
    '    with sqlite3.connect("file:" + path.resolve().as_posix() + "?mode=ro",',
    '                         uri=True) as db:',
    '        ru_ids = [row[0] for row in db.execute(',
  ].join('\n');
  const closed = [
    '    with closing(sqlite3.connect("file:" + path.resolve().as_posix() + "?mode=ro",',
    '                         uri=True)) as db:',
    '        ru_ids = [row[0] for row in db.execute(',
  ].join('\n');
  if (s.includes(closed)) {
    if (!s.includes('from contextlib import closing')) {
      throw new Error('SQLite closing import absent in prepare_offline_apk.py; nothing modified.');
    }
    return raw;
  }
  if (!s.includes('def missing_calendar_locale_fallbacks(path):')) {
    throw new Error('Missing language fallback check in prepare_offline_apk.py.');
  }
  s = replaceOnce(s, original, closed, 'prepare_offline_apk.py');
  if (!s.includes('from contextlib import closing')) {
    s = replaceOnce(s, 'import argparse\n',
      'import argparse\nfrom contextlib import closing\n', 'preflight imports');
  }
  return s.replace(/\n/g, raw.includes('\r\n') ? '\r\n' : '\n');
}
function test(raw) {
  let s = raw.replace(/\r\n/g, '\n');
  const old = 'with sqlite3.connect(filename) as db:';
  const closed = 'with closing(sqlite3.connect(filename)) as db:';
  const count = s.split(old).length - 1;
  if (count === 0 && s.split(closed).length === 3 &&
      s.includes('from contextlib import closing')) return raw;
  if (count !== 2) {
    throw new Error('Unexpected number of SQLite connections in calendar test: ' + count);
  }
  s = s.replaceAll(old, closed);
  if (!s.includes('from contextlib import closing')) {
    s = replaceOnce(s, 'from pathlib import Path\n',
      'from pathlib import Path\nfrom contextlib import closing\n', 'test imports');
  }
  return s.replace(/\n/g, raw.includes('\r\n') ? '\r\n' : '\n');
}

const paths = [
  {name: 'prepare_offline_apk.py', transform: prepare},
  {name: 'test_calendar_language_fallback_20261117.py', transform: test},
];
const items = paths.map(p => {
  const filename = path.join(root, 'tools', p.name);
  const original = fs.readFileSync(filename, 'utf8');
  return {...p, filename, original, updated: p.transform(original)};
});
const changed = items.filter(x => x.updated !== x.original);
if (!changed.length) {
  console.log('OK: Windows SQLite connections already closed; no changes made.');
  process.exit(0);
}
const backupDir = path.resolve(root, '..', 'build-backups',
  'calendar-sqlite-close-' + new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(backupDir, {recursive: true});
for (const p of changed) {
  fs.copyFileSync(p.filename, path.join(backupDir, p.name));
}
const modified = [];
try {
  for (const p of changed) {
    fs.writeFileSync(p.filename, p.updated, 'utf8');
    modified.push(p);
  }
} catch (error) {
  for (const p of modified) fs.writeFileSync(p.filename, p.original, 'utf8');
  throw error;
}
console.log('OK: SQLite connections are explicitly closed on Python 3.14 / Windows.');
console.log('Modified:', changed.map(p => p.name).join(', '));
console.log('Backups:', backupDir);
