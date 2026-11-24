'use strict';
// Guarded local version bump for a phone APK, no other files overwritten.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const appFile = path.join(root, 'app.json');
const gradleFile = path.join(root, 'android', 'app', 'build.gradle');
const original = [fs.readFileSync(appFile, 'utf8'), fs.readFileSync(gradleFile, 'utf8')];
const cfg = JSON.parse(original[0]);
if (cfg.expo?.android?.package !== 'com.accepted2.molitvoslov') {
  throw new Error('Unexpected Android package; refusing version change.');
}
const ver = String(cfg.expo.version), code = Number(cfg.expo.android.versionCode);
const patternCode = /(^[ \t]*versionCode[ \t]+)([0-9]+)\b/m;
const patternName = /(^[ \t]*versionName[ \t]+["'])([^"']+)(["'])/m;
const oldNativeCode = original[1].match(patternCode)?.[2];
const oldNativeVersion = original[1].match(patternName)?.[2];
if (oldNativeCode !== String(code) || oldNativeVersion !== ver) {
  throw new Error('app.json and Gradle versions differ: app ' + ver + ' (' + code +
    ') vs Gradle ' + oldNativeVersion + ' (' + oldNativeCode + ').');
}
if (ver === '1.0.31' && code === 32) {
  console.log('PASS: version already 1.0.31 (32); no changes made.');
  process.exit(0);
}
if (ver !== '1.0.30' || code !== 31) {
  throw new Error('Expected existing version 1.0.30 (31), got ' + ver + ' (' + code +
    '). Refusing to overwrite release numbering.');
}
const occurrences = (s,re) => s.match(new RegExp(re.source, re.flags.replace('g', '') + 'g'))?.length || 0;
const appVersion = /"version"\s*:\s*"1\.0\.30"/;
const appCode = /"versionCode"\s*:\s*31\b/;
if (occurrences(original[0], appVersion) !== 1 || occurrences(original[0], appCode) !== 1 ||
    occurrences(original[1], patternCode) !== 1 || occurrences(original[1], patternName) !== 1) {
  throw new Error('Version fields are not uniquely identifiable; no changes made.');
}
const changes = [
  original[0].replace(appVersion, '"version": "1.0.31"')
    .replace(appCode, '"versionCode": 32'),
  original[1].replace(patternCode, (_full, prefix) => prefix + '32')
    .replace(patternName, (_full, prefix, _old, suffix) => prefix + '1.0.31' + suffix),
];
if (JSON.parse(changes[0]).expo.android.versionCode !== 32 ||
    JSON.parse(changes[0]).expo.version !== '1.0.31') {
  throw new Error('Invalid app configuration after patch; no changes made.');
}
const backup = path.resolve(root, '..', 'build-backups',
  'notification-apk-version-' + new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(backup, {recursive: true});
fs.copyFileSync(appFile, path.join(backup, 'app.json'));
fs.copyFileSync(gradleFile, path.join(backup, 'build.gradle'));
try {
  fs.writeFileSync(appFile, changes[0], 'utf8');
  fs.writeFileSync(gradleFile, changes[1], 'utf8');
} catch (err) {
  fs.writeFileSync(appFile, original[0], 'utf8');
  fs.writeFileSync(gradleFile, original[1], 'utf8');
  throw err;
}
console.log('PASS: local test APK version updated to 1.0.31 (32).');
console.log('Backups:', backup);
