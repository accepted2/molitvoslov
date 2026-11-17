'use strict';

// Add a guarded content-version finalize step to the two targeted local canon
// import scripts without replacing unrelated local edits or requiring Git checkout.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const names = [
  'import_guardian_angel_canon_offline_20261117.js',
  'import_theotokos_paraklesis_offline_20261117.js',
];
const MARK = 'OFFLINE_CANON_IMPORT_VERSION_GUARD_20261117';
const hook = "  require('./finalize_offline_canon_import_20261117')({offlinePath, backup});";
const needle = "fs.writeFileSync(offlinePath,patched,'utf8');";

if (!fs.existsSync(path.join(__dirname, 'finalize_offline_canon_import_20261117.js')) ||
    !fs.existsSync(path.join(__dirname, 'reconcile_offline_content_version_20261117.py'))) {
  throw Error('Missing import guard dependencies; restore files from fix branch first.');
}
const items = names.map(name => {
  const filename = path.join(__dirname, name);
  if (!fs.existsSync(filename)) throw Error('Importer not found: ' + filename);
  const original = fs.readFileSync(filename, 'utf8');
  const normalized = original.replace(/\r\n/g, '\n');
  if (normalized.includes(MARK)) {
    if (!normalized.includes(hook)) throw Error('Partial patch in ' + name);
    return {name, filename, original, updated: original, already: true};
  }
  if (normalized.split(needle).length !== 2 ||
      normalized.split('fs.copyFileSync(offlinePath,backup);').length !== 2 ||
      !normalized.includes('const backup=')) {
    throw Error('Unsafe or changed importer structure: ' + name + '; no files modified.');
  }
  const replacement = needle + '\n  // ' + MARK + '\n' + hook;
  const updated = normalized.replace(needle, replacement)
    .replace(/\n/g, original.includes('\r\n') ? '\r\n' : '\n');
  new Function('require', '__dirname', 'process', 'console', updated);
  return {name, filename, original, updated, already: false};
});
const changed = items.filter(item => !item.already);
if (!changed.length) {
  console.log('OK: both targeted canon importers already validate content_version.');
  process.exit(0);
}
const backupDir = path.resolve(root, '..', 'build-backups',
  'canon-import-guards-' + new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(backupDir, {recursive: true});
const written = [];
try {
  for (const item of changed) {
    fs.writeFileSync(path.join(backupDir, item.name), item.original, 'utf8');
  }
  for (const item of changed) {
    fs.writeFileSync(item.filename, item.updated, 'utf8');
    written.push(item);
  }
} catch (error) {
  for (const item of written) fs.writeFileSync(item.filename, item.original, 'utf8');
  throw error;
}
console.log('OK: imports now revalidate the new content_version after applying canon translations.');
console.log('OK: if the validation fails, the importer rolls back its JSON update.');
console.log('Scripts patched:', changed.map(item => item.name).join(', '));
console.log('Original scripts backed up:', backupDir);
