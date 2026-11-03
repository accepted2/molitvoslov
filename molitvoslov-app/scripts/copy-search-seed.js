const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');

const root = path.join(__dirname, '..');
const src = path.join(root, 'src', 'data', 'search_seed.db');
const dest = path.join(root, 'android', 'app', 'src', 'main', 'assets', 'search_seed.db');
const checker = path.join(root, 'tools', 'verify_search_seed_v10.py');

if (!fs.existsSync(src)) throw new Error('Missing search_seed.db. Generate it with tools/build_search_seed.py');
if (!fs.existsSync(checker)) throw new Error('Missing tools/verify_search_seed.py');

const candidates = [
  process.env.MOLITVOSLOV_PYTHON,
  process.env.VIRTUAL_ENV && path.join(process.env.VIRTUAL_ENV, 'Scripts', 'python.exe'),
  process.platform === 'win32' ? 'C:\\m\\repo\\molitvoslov-backend\\venv\\Scripts\\python.exe' : null,
  'python3',
  'python',
].filter(Boolean);

let checked = false;
for (const exe of candidates) {
  const result = spawnSync(exe, [checker], {cwd: root, encoding: 'utf8'});
  if (result.error?.code === 'ENOENT' || result.error?.code === 'EACCES' || result.error?.code === 'UNKNOWN') continue;
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error || result.status !== 0) {
    // Try a different Python interpreter if this executable cannot start.
    if (result.error) continue;
    throw new Error('Search seed validation failed; inspect the error above.');
  }
  checked = true;
  break;
}
if (!checked) throw new Error('Python executable not found. Set MOLITVOSLOV_PYTHON to the full path to python.exe.');

// SEARCH_SEED_METRO_ONLY_V1
// Run this final cleanup after any legacy seed-copy logic. The search index is
// already bundled by Metro via assetSource. Never delete a DIFFERENT native DB.
;(() => {
  const cleanupFs = require('fs');
  const cleanupPath = require('path');
  const crypto = require('crypto');
  const rootDir = cleanupPath.join(__dirname, '..');
  const sourceSeed = cleanupPath.join(rootDir, 'src', 'data', 'search_seed.db');
  const nativeSeed = cleanupPath.join(rootDir, 'android', 'app', 'src', 'main', 'assets', 'search_seed.db');
  if (!cleanupFs.existsSync(nativeSeed)) return;
  const hash = (file) => crypto.createHash('sha256').update(cleanupFs.readFileSync(file)).digest('hex');
  if (hash(sourceSeed) !== hash(nativeSeed)) {
    throw new Error('Conflicting native search database: ' + nativeSeed +
      '. Existing file preserved. Review it before building a release APK.');
  }
  cleanupFs.unlinkSync(nativeSeed);
  console.log('Removed redundant identical native search DB; Metro bundles the versioned seed.');
})();
console.log('Verified Metro-bundled search seed without a duplicate native DB.');
