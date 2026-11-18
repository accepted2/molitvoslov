#!/usr/bin/env node
'use strict';
// Simulates a cold Android launch while SQLite/fonts/onboarding are still loading.
// No device/network/React Native runtime required.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');

const normalizeSource = read('src/services/appLinks.js')
  .replace(/\bexport const /g, 'const ');
const normalize = new Function(normalizeSource +
  '\nreturn normalizeIncomingAppLink;')();
const startSource = read('src/services/startupAppLink.js')
  .replace(/^import[^\n]*;\n/gm, '')
  .replace(/^export const /gm, 'const ');
const instantiate = Linking => new Function('Linking', 'normalizeIncomingAppLink',
  'console', startSource + '\nreturn {beginStartupAppLinkCapture, ' +
  'readStartupAppLink, completeStartupAppLinkCapture};'
)(Linking, normalize, console);
const shareUrl = p => 'https://molitvoslov-3o9d.onrender.com/api/share/?path=' +
  encodeURIComponent(p);

async function main() {
  // Case 1: Cold HTTP intent is accessible early, before navigator exists.
  const url = shareUrl('akathist/42');
  let calls = 0, removed = 0;
  const api = instantiate({
    getInitialURL: async () => {calls += 1; return url;},
    addEventListener: (_name, _cb) => ({remove() {removed += 1;}}),
  });
  const initial = api.beginStartupAppLinkCapture();
  assert.equal(await initial, 'molitvoslov://akathist/42');
  // Simulate the multi-second app startup. Navigation reads the same cached URL.
  assert.equal(await api.readStartupAppLink(), 'molitvoslov://akathist/42');
  assert.equal(calls, 1, 'Do not lose URL by re-reading Android after startup');
  api.completeStartupAppLinkCapture();
  assert.equal(removed, 1, 'Early listener must be released when navigation is ready');

  // Case 2: Android sends an event while the initial URL Promise is unresolved.
  let resolveNative;
  let eventCallback;
  const waitForNative = new Promise(resolve => {resolveNative = resolve;});
  const deferred = instantiate({
    getInitialURL: () => waitForNative,
    addEventListener: (_name, cb) => {
      eventCallback = cb;
      return {remove() {}};
    },
  });
  const starting = deferred.beginStartupAppLinkCapture();
  eventCallback({url: shareUrl('canon/abc')});
  resolveNative(null);
  assert.equal(await starting, 'molitvoslov://canon/abc');
  assert.equal(await deferred.readStartupAppLink(), 'molitvoslov://canon/abc');

  // Case 3: Retry once if initial Android intent is briefly absent.
  let n = 0;
  const retry = instantiate({
    getInitialURL: async () => (++n === 1 ? null : shareUrl('psalter')),
    addEventListener: () => ({remove() {}}),
  });
  assert.equal(await retry.beginStartupAppLinkCapture(), null);
  assert.equal(await retry.readStartupAppLink(), 'molitvoslov://psalter');
  assert.equal(n, 2);

  // Case 4: Prevent unsupported or hostile links being replayed.
  const invalid = instantiate({
    getInitialURL: async () => 'https://untrusted.example/path',
    addEventListener: () => ({remove() {}}),
  });
  assert.equal(await invalid.beginStartupAppLinkCapture(), null);
  assert.equal(await invalid.readStartupAppLink(), null);

  for (const route of [
    'akathist/42', 'canon/99', 'prayer/morning', 'reader/Слово_Божие',
    'hours/hour-1', 'kathisma/4/27/traditional', 'psalter',
    'bible/1/22/csl_traditional/3', 'bible-book/1/rst',
    'saint/2026-11-18/troparion/saint-1',
  ]) {
    const expected = 'molitvoslov://' +
      route.split('/').map(encodeURIComponent).join('/');
    const instance = instantiate({
      getInitialURL: async () => shareUrl(route),
      addEventListener: () => ({remove() {}}),
    });
    assert.equal(await instance.readStartupAppLink(), expected, route);
  }
  const app = read('App.js');
  const nav = read('src/navigation/AppNavigator.js');
  assert.match(app, /beginStartupAppLinkCapture\(\)/);
  assert.ok(app.indexOf('beginStartupAppLinkCapture();') <
    app.indexOf('export default function App()'), 'Cold link capture must start before the UI gate');
  assert.match(nav, /readStartupAppLink\(\)/);
  assert.match(nav, /getStateFromPath\(path,\s*linking\.config\)/);
  assert.match(nav, /completeStartupAppLinkCapture/);
  assert.match(nav, /initialRouteName:\s*['"]Menu['"]/);
  assert.match(nav, /Linking\.addEventListener\('url'/);
  console.log('PASS: cold start links buffered across splash screen; warm links preserved');
  console.log('PASS: deep links retained for Akathist/Canon/Prayer/Bible/Psalter/Hours/Saints');
}
main().catch(error => {
  console.error('FAIL:', error);
  process.exitCode = 1;
});
