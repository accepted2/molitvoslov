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

if (!fs.existsSync(path.dirname(dest))) {
  console.log('Android assets directory absent; search seed validated but not copied.');
} else {
  fs.copyFileSync(src, dest);
  if (fs.statSync(src).size !== fs.statSync(dest).size) throw new Error('Copied seed has wrong length.');
  console.log('Verified search_seed.db copied to Android assets.');
}
