'use strict';

// Invoked only after a validated targeted canon import has written offlineContent.
// On any failed preflight, restore exactly the JSON the importer saved first.
const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');

module.exports = ({offlinePath, backup}) => {
  if (!fs.existsSync(backup) || !fs.existsSync(offlinePath)) {
    throw Error('Offline canon import backup is missing; refusing to finalize.');
  }
  const script = path.join(__dirname, 'reconcile_offline_content_version_20261117.py');
  if (!fs.existsSync(script)) {
    fs.copyFileSync(backup, offlinePath);
    throw Error('Missing offline content version validator; the import was rolled back.');
  }
  const pythonCandidates = [
    process.env.MOLITVOSLOV_PYTHON,
    process.env.VIRTUAL_ENV && path.join(process.env.VIRTUAL_ENV,
      process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'),
    process.platform === 'win32'
      ? 'C:\\m\\repo\\molitvoslov-backend\\venv\\Scripts\\python.exe' : null,
    process.platform === 'win32' ? 'python' : 'python3',
    'python',
  ].filter(Boolean);
  let failure = 'Python interpreter not found';
  let completed = false;
  for (const exe of new Set(pythonCandidates)) {
    const result = spawnSync(exe, ['-X', 'utf8', script, '--apply'], {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'inherit',
      windowsHide: true,
    });
    if (result.error && ['ENOENT', 'EACCES', 'UNKNOWN'].includes(result.error.code)) {
      continue;
    }
    completed = result.status === 0;
    if (!completed) {
      failure = result.error?.message || ('validator returned ' + String(result.status));
    }
    break;
  }
  if (!completed) {
    try {
      fs.copyFileSync(backup, offlinePath);
      console.error('Offline canon import rolled back:', failure);
    } catch (restoreError) {
      throw Error('Offline import validator failed AND backup restoration failed: ' +
        failure + '; backup: ' + backup + '; restore: ' + restoreError.message);
    }
    throw Error('Offline canon import failed safe content-version validation; previous JSON restored. ' +
      failure);
  }
  console.log('Canon import and public content version are consistent.');
};
