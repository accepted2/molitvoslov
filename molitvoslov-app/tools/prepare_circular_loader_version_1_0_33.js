'use strict';
// Optional safe local APK version bump for testing the circular loader.
// Does not overwrite any other user code or configuration.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const appFile = path.join(root, 'app.json');
const gradleFile = path.join(root, 'android', 'app', 'build.gradle');
const originalApp = fs.readFileSync(appFile, 'utf8');
const originalGradle = fs.readFileSync(gradleFile, 'utf8');
const data = JSON.parse(originalApp);
const version = data.expo?.version, code = data.expo?.android?.versionCode;
if (data.expo?.android?.package !== 'com.accepted2.molitvoslov') {
  throw Error('Unexpected Android package: refusing version change');
}
const gradleCode = /(^[ \t]*versionCode[ \t]+)(\d+)\b/m;
const gradleVersion = /(^[ \t]*versionName[ \t]+["'])([^"']+)(["'])/m;
if (Number(originalGradle.match(gradleCode)?.[2]) !== Number(code) ||
  originalGradle.match(gradleVersion)?.[2] !== version) {
  throw Error('app.json and Gradle version mismatch: no files modified');
}
if (version === '1.0.33' && code === 34) {
  console.log('PASS: test version 1.0.33 (34) is already configured');
  process.exit(0);
}
if (!((version === '1.0.32' && code === 33) ||
  (version === '1.0.31' && code === 32))) {
  throw Error('Expected local 1.0.31 (32) or 1.0.32 (33), got ' +
    version + ' (' + code + '). No files modified.');
}
const appVersionRegex = new RegExp('("version"\\s*:\\s*")' +
  version.replace(/\./g, '\\.') + '(")');
const appCodeRegex = new RegExp('("versionCode"\\s*:\\s*)' + code + '\\b');
const unique = (s, re) =>
  [...s.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))].length === 1;
if (![unique(originalApp,appVersionRegex),unique(originalApp,appCodeRegex),
  unique(originalGradle,gradleCode),unique(originalGradle,gradleVersion)].every(Boolean)) {
  throw Error('Cannot identify all version fields uniquely. No files modified.');
}
const nextApp = originalApp
  .replace(appVersionRegex, (_m,prefix,suffix) => prefix + '1.0.33' + suffix)
  .replace(appCodeRegex, (_m,prefix) => prefix + '34');
const nextGradle = originalGradle
  .replace(gradleCode, (_m,prefix) => prefix + '34')
  .replace(gradleVersion, (_m,prefix,_value,suffix) => prefix + '1.0.33' + suffix);
if (JSON.parse(nextApp).expo.version !== '1.0.33' ||
    JSON.parse(nextApp).expo.android.versionCode !== 34 ||
    !/\bversionCode\s+34\b/.test(nextGradle) ||
    !/\bversionName\s+["']1\.0\.33["']/.test(nextGradle)) {
  throw Error('Invalid version candidate. No files modified.');
}
const backupDir = path.resolve(root, '..', 'build-backups',
  'circular-loader-version-' + new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(backupDir, {recursive:true});
fs.copyFileSync(appFile,path.join(backupDir,'app.json'));
fs.copyFileSync(gradleFile,path.join(backupDir,'build.gradle'));
try {
  fs.writeFileSync(appFile,nextApp,'utf8');
  fs.writeFileSync(gradleFile,nextGradle,'utf8');
} catch (error) {
  fs.writeFileSync(appFile,originalApp,'utf8');
  fs.writeFileSync(gradleFile,originalGradle,'utf8');
  throw error;
}
console.log('PASS: APK test version set to 1.0.33 (34)');
console.log('Backup:',backupDir);
