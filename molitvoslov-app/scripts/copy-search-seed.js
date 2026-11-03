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
// SQLiteProvider assetSource=require(src/data/search_seed.db) already bundles
// the seed via Metro. A second copy in android/app/src/main/assets would
// increase the APK and may accidentally shadow the versioned search DB.
if (fs.existsSync(dest)) {
  const crypto = require('crypto');
  const hash = (name) => crypto.createHash('sha256').update(fs.readFileSync(name)).digest('hex');
  if (hash(src) !== hash(dest)) {
    throw new Error('Conflicting native search_seed.db at ' + dest +
      '. Preserve/inspect that file before a new APK build.');
  }
  fs.unlinkSync(dest);
  console.log('Removed redundant identical native search_seed.db; Metro keeps its copy.');
}
console.log('Verified single Metro-bundled search_seed.db; no duplicate native asset.');
