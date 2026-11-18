#!/usr/bin/env node
'use strict';
// Pure geometry and source-level regression checks. No emulator needed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const parser = require('@babel/parser');

const file = path.resolve(__dirname, '..', 'src/components/feedback/PrayerBeadsLoader.js');
const source = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
parser.parse(source, {sourceType: 'module', plugins: ['jsx']});

const coordinates = source.match(
  /const BEAD_COUNT = 24;[\s\S]*?const SMALL_POSITIONS = circlePositions\(COMPACT_BEAD_COUNT, 22, 22, 16, 7\);/
);
assert.ok(coordinates, 'Missing full/compact circular prayer-rope geometry');
const geometry = new Function(coordinates[0] +
  '\nreturn {BEAD_COUNT, COMPACT_BEAD_COUNT, LARGE_POSITIONS, SMALL_POSITIONS};')();
const {BEAD_COUNT, COMPACT_BEAD_COUNT, LARGE_POSITIONS, SMALL_POSITIONS} = geometry;
assert.equal(BEAD_COUNT, 24);
assert.equal(COMPACT_BEAD_COUNT, 14);

for (const [points, count, centerX, centerY, radius, size] of [
  [LARGE_POSITIONS, 24, 56, 55, 43, 11],
  [SMALL_POSITIONS, 14, 22, 22, 16, 7],
]) {
  assert.equal(points.length, count);
  assert.equal(new Set(points.map(p => p.left.toFixed(3) + ':' + p.top.toFixed(3))).size, count,
    'Beads must occupy distinct points around the circle');
  for (const point of points) {
    const x = point.left + size / 2, y = point.top + size / 2;
    assert.ok(Math.abs(Math.hypot(x - centerX, y - centerY) - radius) < 0.001,
      'Every bead must be on the complete circular thread');
    assert.ok(point.left >= 0 && point.top >= 0,
      'Beads must fit within the loader');
  }
  assert.ok(points.some(p => p.left + size / 2 < centerX - radius * 0.95));
  assert.ok(points.some(p => p.left + size / 2 > centerX + radius * 0.95));
  assert.ok(points.some(p => p.top + size / 2 < centerY - radius * 0.95));
  assert.ok(points.some(p => p.top + size / 2 > centerY + radius * 0.95));
}

assert.match(source, /Animated\.loop\(Animated\.stagger\(/);
assert.match(source, /useNativeDriver:\s*true/);
assert.match(source, /animation\.stop\(\)/);
assert.match(source, /accessibilityRole="progressbar"/);
assert.match(source, /light && styles\.beadLight/);
assert.match(source, /compact && styles\.rosaryCompact/);
assert.match(source, /!compact && \(/);
assert.match(source, /styles\.pendantLine/);
assert.match(source, /styles\.cross/);
assert.match(source, /☦/);
assert.doesNotMatch(source, /const CURVE = \[/);

console.log('PASS: closed 24-bead prayer rope and 14-bead compact ring with full 360° coverage');
console.log('PASS: native-driver traversal, hanging cross, light theme, compact and cleanup');
