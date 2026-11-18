#!/usr/bin/env node
'use strict';
// Source-only contract checks: no emulator, timer or network required.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const parser = require('@babel/parser');
const root = path.resolve(__dirname, '..');
const load = p => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');

const loader = load('src/components/feedback/PrayerBeadsLoader.js');
const preview = load('src/components/feedback/PrayerBeadsPreviewScreen.js');
const app = load('App.js');
for (const [name, text] of [['PrayerBeadsLoader.js', loader],
  ['PrayerBeadsPreviewScreen.js', preview], ['App.js', app]]) {
  assert.doesNotThrow(() => parser.parse(text, {
    sourceType: 'module',
    plugins: ['jsx'],
  }), name + ' syntax');
}
assert.match(loader, /const BEAD_COUNT = 24;/);
assert.match(loader, /const COMPACT_BEAD_COUNT = 14;/);
assert.match(loader, /const LARGE_POSITIONS = ellipsePositions\(BEAD_COUNT, 54, 50, 40, 34, 11\);/);
assert.match(loader, /compact && styles\.crossCompact/);
assert.match(loader, /compact && styles\.pendantLineCompact/);
assert.match(loader, /styles\.pendantKnot/);
assert.match(loader, /styles\.pendantLine/);
for (const part of ['crossStem','crossTopBar','crossMiddleBar','crossFootBar']) {
  assert.match(loader, new RegExp('styles\\.' + part));
  assert.match(loader, new RegExp('  ' + part + ': \\{'));
}
assert.match(loader, /accessibilityLabel="Православный крестик"/);
assert.match(loader, /backgroundColor: '#F3D89F'/);
assert.match(loader, /height: 139/);
assert.match(loader, /height: 56/);
assert.match(loader, /top: 98/);
assert.match(loader, /rotate: '14deg'/);
assert.match(loader, /height: 17\.5/);
assert.match(loader, /height: 20/);
assert.match(loader, /overflow: 'visible'/);
assert.match(loader, /useNativeDriver: true/);
assert.match(preview, /<PrayerBeadsLoader/);
assert.match(preview, /Малые овальные чётки с крестиком/);
assert.match(preview, /setCompact\(value => !value\)/);
assert.match(preview, /setLight\(value => !value\)/);
assert.match(preview, /onPress=\{onContinue\}/);
assert.doesNotMatch(preview, /setTimeout\s*\(/);
assert.doesNotMatch(preview, /setInterval\s*\(/);
assert.match(app, /__DEV__ && process\.env\.EXPO_PUBLIC_PRAYER_BEADS_PREVIEW === '1'/);
assert.match(app, /if \(__DEV__ && previewOpen\)/);
assert.match(app, /<PrayerBeadsPreviewScreen onContinue=\{\(\) => setPreviewOpen\(false\)\}/);
const previewPos = app.indexOf('if (__DEV__ && previewOpen)');
const startupPos = app.indexOf('if (!appReady || !minimumStartupElapsed)');
assert.ok(previewPos > 0 && previewPos < startupPos,
  'Preview must appear before the normal loading screen');
const minTimer = app.match(/const MIN_STARTUP_MS = (\d+);/);
assert.equal(Number(minTimer?.[1]), 650,
  'Normal startup timing must be preserved');
console.log('PASS: oval 24-bead loader with shorter suspension and crosses on both sizes');
console.log('PASS: perpetual emulator preview, full/compact and light/dark controls');
console.log('PASS: development-only entry with no change to normal startup timing');
