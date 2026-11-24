'use strict';

// Safe local package.json patch. Preserves installed dependencies, versions,
// unrelated npm scripts and any uncommitted changes in other project files.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const packagePath = path.join(root, 'package.json');
const helperPath = path.join(root, 'scripts', 'prepare-search-index.js');
if (!fs.existsSync(helperPath)) {
  throw Error('Missing scripts/prepare-search-index.js; restore it from the fix branch first.');
}
const before = fs.readFileSync(packagePath, 'utf8');
const pkg = JSON.parse(before);
if (!pkg.scripts || typeof pkg.scripts.postinstall !== 'string' ||
    typeof pkg.scripts.android !== 'string' ||
    typeof pkg.scripts.prebuild !== 'string') {
  throw Error('package.json scripts do not match the expected structure; no changes made.');
}
const postSegments = pkg.scripts.postinstall.split(/\s*&&\s*/).map(s => s.trim());
const searchInstall = /^node(?:\.exe)?\s+scripts[/\\]copy-search-seed\.js$/;
const kept = postSegments.filter(s => !searchInstall.test(s));
if (!kept.length || !kept.includes('patch-package')) {
  throw Error('Postinstall cannot safely preserve patch-package; no changes made.');
}
pkg.scripts.postinstall = kept.join(' && ');

const prepare = 'node scripts/prepare-search-index.js';
const copy = 'node scripts/copy-search-seed.js';

function ensurePrefix(script, label, command) {
  if (!script.includes(command)) {
    throw Error('Unrecognized ' + label + ' npm command; no changes made.');
  }
  return script.includes(prepare) ? script : prepare + ' && ' + script;
}
pkg.scripts.android = ensurePrefix(pkg.scripts.android, 'android', 'expo run:android');
if (!pkg.scripts.android.includes(copy)) {
  pkg.scripts.android = pkg.scripts.android.replace(' && expo run:android',
    ' && ' + copy + ' && expo run:android');
  if (!pkg.scripts.android.includes(copy)) {
    throw Error('Cannot safely place search verification before Android build.');
  }
}
pkg.scripts.prebuild = ensurePrefix(pkg.scripts.prebuild, 'prebuild', 'expo prebuild');
if (!pkg.scripts.prebuild.includes(copy)) {
  pkg.scripts.prebuild += ' && ' + copy;
}
if (pkg.scripts['search:prepare'] && pkg.scripts['search:prepare'] !== prepare) {
  throw Error('Existing search:prepare script conflicts; no changes made.');
}
if (pkg.scripts['search:verify'] && pkg.scripts['search:verify'] !==
    prepare + ' --verify-only && ' + copy) {
  throw Error('Existing search:verify script conflicts; no changes made.');
}
pkg.scripts['search:prepare'] = prepare;
pkg.scripts['search:verify'] = prepare + ' --verify-only && ' + copy;

const eol = before.includes('\r\n') ? '\r\n' : '\n';
const after = (JSON.stringify(pkg, null, 2) + '\n').replace(/\n/g, eol);
if (before === after) {
  console.log('OK: safe search build gates already configured.');
  process.exit(0);
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.resolve(root, '..', 'build-backups', 'search-build-gates-' + stamp);
fs.mkdirSync(backupDir, {recursive: true});
const backup = path.join(backupDir, 'package.json');
fs.copyFileSync(packagePath, backup);
const temp = packagePath + '.search-gates.tmp';
try {
  fs.writeFileSync(temp, after, 'utf8');
  fs.renameSync(temp, packagePath);
} catch (error) {
  if (fs.existsSync(temp)) fs.unlinkSync(temp);
  throw error;
}
console.log('OK: npm install only applies dependency patches; no search-index check.');
console.log('OK: npm run android rebuilds and verifies search before Android compilation.');
console.log('OK: npm run prebuild and npm run search:verify use the same checked index.');
console.log('Backed up package.json:', backup);
