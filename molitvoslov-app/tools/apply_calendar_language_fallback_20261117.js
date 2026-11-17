'use strict';

// Safe, one-anchor installer: updates the locale fallback rule in the search
// corpus writer WITHOUT replacing the user's locally edited Python file.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'tools', 'search_seed_lib.py');
const marker = 'Preserve the old calendar fallback: a feast available';
const anchor = '                    d["lang"] = lang\n' +
  '                    d["title_uk"] = None\n' +
  '                    out.append(d)';
const patch = '                    # Preserve the old calendar fallback: a feast available\n' +
  '                    # only in the Russian index must remain searchable with\n' +
  '                    # the Ukrainian locale. When an entry has a distinct\n' +
  '                    # Ukrainian counterpart under the SAME ext, keep the\n' +
  '                    # localized records separate instead of hiding it.\n' +
  '                    d["lang"] = "" if (lang == "ru" and b is None\n' +
  '                                       and d["grp"] == "calendar") else lang\n' +
  '                    d["title_uk"] = None\n' +
  '                    out.append(d)';

if (!fs.existsSync(source)) throw Error('Cannot locate tools/search_seed_lib.py');
const original = fs.readFileSync(source, 'utf8');
const lf = original.replace(/\r\n/g, '\n');
if (lf.includes(marker)) {
  if (!lf.includes('d["grp"] == "calendar") else lang')) {
    throw Error('Existing calendar fallback patch appears incomplete; no modifications made');
  }
  console.log('OK: calendar search fallback already configured.');
  process.exit(0);
}
if (!lf.includes('def merge_languages(by_lang):') || lf.split(anchor).length !== 2) {
  throw Error('Search merge_languages implementation changed; refusing unsafe patch.');
}
const updated = lf.replace(anchor, patch)
  .replace(/\n/g, original.includes('\r\n') ? '\r\n' : '\n');
const backupDir = path.resolve(root, '..', 'build-backups',
  'search-calendar-fallback-' + new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(backupDir, {recursive: true});
const backup = path.join(backupDir, 'search_seed_lib.py');
fs.copyFileSync(source, backup);
const tmp = source + '.calendar-fallback.tmp';
try {
  fs.writeFileSync(tmp, updated, 'utf8');
  fs.renameSync(tmp, source);
} catch (e) {
  if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  throw e;
}
console.log('OK: calendar results without UK counterparts will remain visible in both locales.');
console.log('OK: all other search document groups and locale rules are unchanged.');
console.log('Backup:', backup);
console.log('NEXT: test_calendar_language_fallback_20261117.py; then rebuild the search index.');
