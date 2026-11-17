'use strict';

// One-shot, idempotent patcher for two existing Python files.
// Keeps unrelated local modifications, checks all anchors BEFORE writing,
// backs up both originals, and rolls back on a write error.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const normalize = s => s.replace(/\r\n/g, '\n');

function replaceOnce(input, before, after, file) {
  const parts = input.split(before);
  if (parts.length !== 2) {
    throw Error('Unexpected source structure in ' + file + ': expected unique anchor.');
  }
  return parts.join(after);
}

function patchSeedLib(original) {
  let s = normalize(original);
  const marker = 'Preserve the old calendar fallback: a feast available';
  if (s.includes(marker)) {
    if (!s.includes('d["grp"] == "calendar") else lang')) {
      throw Error('Incomplete calendar fallback patch in search_seed_lib.py');
    }
    return original;
  }
  if (!s.includes('def merge_languages(by_lang):')) {
    throw Error('Missing merge_languages() in search_seed_lib.py');
  }
  const before = '                    d["lang"] = lang\n' +
    '                    d["title_uk"] = None\n' +
    '                    out.append(d)';
  const after = '                    # Preserve the old calendar fallback: a feast available\n' +
    '                    # only in the Russian index must remain searchable with\n' +
    '                    # the Ukrainian locale. When an entry has a distinct\n' +
    '                    # Ukrainian counterpart under the SAME ext, keep the\n' +
    '                    # localized records separate instead of hiding it.\n' +
    '                    d["lang"] = "" if (lang == "ru" and b is None\n' +
    '                                       and d["grp"] == "calendar") else lang\n' +
    '                    d["title_uk"] = None\n' +
    '                    out.append(d)';
  return replaceOnce(s, before, after, 'search_seed_lib.py')
    .replace(/\n/g, original.includes('\r\n') ? '\r\n' : '\n');
}

function patchPreflight(original) {
  let s = normalize(original);
  const marker = 'def missing_calendar_locale_fallbacks(path):';
  if (s.includes(marker)) {
    if (!s.includes('locale_misses = missing_calendar_locale_fallbacks(SEED_V10)') ||
        !s.includes('locale_misses = missing_calendar_locale_fallbacks(SEED)')) {
      throw Error('Incomplete locale preflight patch in prepare_offline_apk.py');
    }
    return original;
  }
  const beforeFunction = 'def rebuild_seed(public_version, bible_version):\n';
  s = replaceOnce(s, 'import argparse\n', 'import argparse\nfrom contextlib import closing\n', 'contextlib import');
  const functionBlock = [
    'def missing_calendar_locale_fallbacks(path):',
    '    """Count Russian calendar rows hidden from the UK locale despite no UK twin.',
    '',
    '    New translations must not hide the original Russian calendar entry from',
    '    its former shared-language search visibility.',
    '    """',
    '    with closing(sqlite3.connect("file:" + path.resolve().as_posix() + "?mode=ro",',
    '                         uri=True)) as db:',
    '        ru_ids = [row[0] for row in db.execute(',
    '            "SELECT ext FROM doc WHERE grp=\x27calendar\x27 AND lang=\x27ru\x27"',
    '        )]',
    '        uk_ids = {row[0] for row in db.execute(',
    '            "SELECT ext FROM doc WHERE grp=\x27calendar\x27 AND lang=\x27uk\x27"',
    '        )}',
    '    return sum(ext not in uk_ids for ext in ru_ids)',
    '',
    '',
  ].join('\n') + '\n';
  s = replaceOnce(s, beforeFunction, functionBlock + beforeFunction, 'preflight helper');
  s = replaceOnce(s,
    '    count = seed_metadata(SEED, public_version, bible_version)\n' +
    '    if count:\n' +
    '        print("Existing packaged search seed matches source JSON: docs", count)\n' +
    '        return',
    '    count = seed_metadata(SEED, public_version, bible_version)\n' +
    '    locale_misses = missing_calendar_locale_fallbacks(SEED) if count else 0\n' +
    '    if count and not locale_misses:\n' +
    '        print("Existing packaged search seed matches source JSON: docs", count)\n' +
    '        return\n' +
    '    if locale_misses:\n' +
    '        print("Calendar locale fallback needs rebuild:", locale_misses,\n' +
    '              "Russian calendar results hidden from Ukrainian search")',
    'preflight rebuild');
  s = replaceOnce(s,
    '    if not count:\n' +
    '        raise RuntimeError("Regenerated search seed does not match the bundled content")\n' +
    '    if prior_count is not None',
    '    if not count:\n' +
    '        raise RuntimeError("Regenerated search seed does not match the bundled content")\n' +
    '    locale_misses = missing_calendar_locale_fallbacks(SEED_V10)\n' +
    '    if locale_misses:\n' +
    '        raise RuntimeError(\n' +
    '            "SEARCH LOCALE REGRESSION: %d Russian calendar results still hidden "\n' +
    '            "from Ukrainian search. Existing packaged search DB preserved."\n' +
    '            % locale_misses\n' +
    '        )\n' +
    '    if prior_count is not None',
    'candidate guard');
  s = replaceOnce(s,
    '    if not count:\n' +
    '        raise RuntimeError("Packaged search_seed.db missing, stale or corrupted")\n' +
    '    fingerprint = sha256(SEED)',
    '    if not count:\n' +
    '        raise RuntimeError("Packaged search_seed.db missing, stale or corrupted")\n' +
    '    locale_misses = missing_calendar_locale_fallbacks(SEED)\n' +
    '    if locale_misses:\n' +
    '        raise RuntimeError(\n' +
    '            "Packaged search index lacks calendar language fallback (%d entries); "\n' +
    '            "run prepare_offline_apk.py without --verify-only." % locale_misses\n' +
    '        )\n' +
    '    fingerprint = sha256(SEED)',
    'manifest guard');
  return s.replace(/\n/g, original.includes('\r\n') ? '\r\n' : '\n');
}

const targets = [
  {file: 'search_seed_lib.py', patch: patchSeedLib},
  {file: 'prepare_offline_apk.py', patch: patchPreflight},
];
const planned = targets.map(item => {
  const filename = path.join(root, 'tools', item.file);
  const original = fs.readFileSync(filename, 'utf8');
  return {...item, filename, original, updated: item.patch(original)};
});
const changed = planned.filter(p => p.updated !== p.original);
if (!changed.length) {
  console.log('OK: search calendar fallback and build preflight are already patched.');
  process.exit(0);
}
const backupDir = path.resolve(root, '..', 'build-backups',
  'search-calendar-parity-' + new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(backupDir, {recursive: true});
for (const item of changed) {
  fs.copyFileSync(item.filename, path.join(backupDir, item.file));
}
const written = [];
try {
  for (const item of changed) {
    fs.writeFileSync(item.filename, item.updated, 'utf8');
    written.push(item);
  }
} catch (error) {
  for (const item of written) fs.writeFileSync(item.filename, item.original, 'utf8');
  throw error;
}
console.log('OK: calendar fallback restored without changing any prayer or calendar text.');
console.log('OK: Android preflight automatically rebuilds and validates the corrected index.');
console.log('Modified:', changed.map(x => x.file).join(', '));
console.log('Backups:', backupDir);
