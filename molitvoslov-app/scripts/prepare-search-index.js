'use strict';

// CHECKED SEARCH BUILD GATE
// Rebuilds the immutable bundled search index only when its metadata is stale.
// The Python preflight verifies all offline content, does not touch
// personal app databases, and preserves the previous search DB before replacing it.
// Usage: node scripts/prepare-search-index.js [--verify-only]
const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');

const root = path.resolve(__dirname, '..');
const script = path.join(root, 'tools', 'prepare_offline_apk.py');
const verify = process.argv.slice(2);
if (verify.some(arg => arg !== '--verify-only')) {
  console.error('Usage: node scripts/prepare-search-index.js [--verify-only]');
  process.exit(2);
}
if (!fs.existsSync(script)) {
  console.error('Offline content preflight is missing:', script);
  process.exit(2);
}

const candidates = [
  process.env.MOLITVOSLOV_PYTHON,
  process.env.VIRTUAL_ENV && path.join(
    process.env.VIRTUAL_ENV, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
  ),
  process.platform === 'win32' ? 'C:\\m\\repo\\molitvoslov-backend\\venv\\Scripts\\python.exe' : null,
  process.platform === 'win32' ? 'python' : 'python3',
  process.platform === 'win32' ? 'python3' : 'python',
].filter(Boolean);

for (const exe of new Set(candidates)) {
  const result = spawnSync(
    exe, ['-X', 'utf8', script, ...verify],
    {cwd: root, stdio: 'inherit', windowsHide: true},
  );
  if (result.error && ['ENOENT', 'EACCES', 'UNKNOWN'].includes(result.error.code)) {
    continue;
  }
  if (result.error) {
    console.error('Search index preflight could not run:', result.error.message);
    process.exit(1);
  }
  if (result.signal) {
    console.error('Search index preflight interrupted:', result.signal);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error('Search index preflight failed; Android build stopped to protect the search database.');
    process.exit(result.status || 1);
  }
  console.log('Search index build gate: PASS');
  process.exit(0);
}
console.error('Python interpreter not found; set MOLITVOSLOV_PYTHON to python.exe.');
process.exit(1);
