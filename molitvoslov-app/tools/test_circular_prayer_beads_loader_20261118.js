#!/usr/bin/env node
'use strict';
// Validate oval geometry, both visible crosses and animation without emulator.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const parser = require('@babel/parser');

const file = path.resolve(__dirname, '..', 'src/components/feedback/PrayerBeadsLoader.js');
const source = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
parser.parse(source, {sourceType:'module', plugins:['jsx']});

const geometrySource = source.match(
  /const BEAD_COUNT = 24;[\s\S]*?const SMALL_POSITIONS = ellipsePositions\(COMPACT_BEAD_COUNT, 19, 15, 12, 9\.5, 5\);/
);
assert.ok(geometrySource, 'Missing full and compact ellipse geometry');
const geometry = new Function(geometrySource[0] +
  '\nreturn {BEAD_COUNT, COMPACT_BEAD_COUNT, LARGE_POSITIONS, SMALL_POSITIONS};')();
assert.equal(geometry.BEAD_COUNT, 24);
assert.equal(geometry.COMPACT_BEAD_COUNT, 14);

for (const [name, points, count, cx, cy, rx, ry, diameter, width, height] of [
  ['large', geometry.LARGE_POSITIONS, 24, 54, 50, 40, 34, 11, 108, 139],
  ['compact', geometry.SMALL_POSITIONS, 14, 19, 15, 12, 9.5, 5, 38, 51],
]) {
  assert.equal(points.length, count, name + ': wrong number of beads');
  assert.ok(rx > ry, name + ': must be slightly oval, not round');
  assert.equal(new Set(points.map(p => p.left.toFixed(3)+':'+p.top.toFixed(3))).size, count,
    name + ': each bead must have a distinct coordinate');
  for (const p of points) {
    const x=p.left+diameter/2, y=p.top+diameter/2;
    const equation=((x-cx)/rx)**2+((y-cy)/ry)**2;
    assert.ok(Math.abs(equation-1)<1e-9, name + ': bead misses oval thread');
    assert.ok(p.left>=0 && p.top>=0 && p.left+diameter<=width &&
      p.top+diameter<=height, name + ': bead clipped outside loader');
  }
  assert.ok(points.some(p=>p.top+diameter/2<cy-ry*.95));
  assert.ok(points.some(p=>p.top+diameter/2>cy+ry*.95));
  assert.ok(points.some(p=>p.left+diameter/2<cx-rx*.95));
  assert.ok(points.some(p=>p.left+diameter/2>cx+rx*.95));
}

const section = name => {
  const m=source.match(new RegExp('  '+name+': \\{([\\s\\S]*?)\\n  \\},'));
  assert.ok(m, 'Missing style '+name);
  return m[1];
};
assert.match(section('thread'), /left: 14,[\s\S]*top: 16,[\s\S]*width: 80,[\s\S]*height: 68,/);
assert.match(section('threadCompact'), /left: 7,[\s\S]*top: 5\.5,[\s\S]*width: 24,[\s\S]*height: 19,/);
assert.match(section('pendantLine'), /height: 8,/); // previous 16
assert.match(section('pendantLineCompact'), /height: 4,/);
assert.match(section('cross'), /width: 22,[\s\S]*height: 28,/);
assert.match(section('crossCompact'), /width: 12,[\s\S]*height: 15,/);
assert.match(section('crossFootBar'), /rotate: '20deg'/);
assert.match(section('crossFootBarCompact'), /rotate: '20deg'/);
for(const tag of [
  'pendantKnotCompact','pendantLineCompact','crossCompact',
  'crossStemCompact','crossTopBarCompact','crossMiddleBarCompact','crossFootBarCompact',
]) assert.match(source,new RegExp('styles\\.'+tag));

assert.match(source, /Animated\.loop\(Animated\.stagger\(/);
assert.match(source, /useNativeDriver: true/);
assert.match(source, /animation\.stop\(\)/);
assert.match(source, /accessibilityLabel="Православный крестик"/);
assert.match(source, /light && styles\.beadLight/);
assert.doesNotMatch(source, /\{!compact && \(/);
console.log('PASS: 24-bead and compact 14-bead ovals match the thread and stay in bounds');
console.log('PASS: half-length pendant, smaller Orthodox crosses on BOTH variants, corrected footbar');
console.log('PASS: native-driver animation and accessible progress indicator');
