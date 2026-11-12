#!/usr/bin/env node
'use strict';
// Run from molitvoslov-app: node tools/test_header_local_halo.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(
  path.join(__dirname, '../src/components/navigation/FixedSectionHeader.js'),
  'utf8'
);

assert.match(source, /useWindowDimensions/);
assert.match(source, /measuredTitleWidth/);
assert.match(source, /onLayout=\{\(event\) => \{/);
assert.match(source, /const headerHaloActive = !minimal && showTitle;/);
assert.match(source, /const haloWidth = Math\.min\(/);
assert.match(source, /width: haloWidth,\s*height: haloHeight/);
assert.match(source, /headerHaloActive && \(\s*<LinearGradient\s+pointerEvents="none"/);
assert.match(source, /style=\{\[styles\.localHeaderHalo,/);
assert.match(source, /localHeaderHalo: \{\s*position: 'absolute'/);
assert.match(source, /titleTextStyle\]\}/);
assert.match(source, /categoryTitleContrast/);
assert.match(source, /categoryArrowContrast/);
assert.match(source, /const uiScale = useInterfaceScale\(\)/);
assert.match(source, /backArrow: \{\s*marginTop: -12,/);
assert.match(source, /const headerHidden = readingHidden && !languageOpen;/);
assert.doesNotMatch(source, /styles\.fixedGradient|styles\.readerHeaderFrost|styles\.categoryContrastGradient/);
assert.doesNotMatch(source, /height: headerHeight \+ 38/);

console.log('PASS: localized header halo, category/akathist parity, local geometry and reading controls retained');
