// Run from molitvoslov-app: node tools/verify_reader_header_chrome_20261109.js
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const parser = require('@babel/parser');
const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const files = [
  'src/services/readerHeaderChrome.js',
  'src/components/navigation/FixedSectionHeader.js',
  'src/screens/ReaderScreen.js',
  'src/screens/PrayerRuleScreen.js',
  'src/screens/CanonScreen.js',
  'src/screens/AkathistScreen.js',
];
for (const file of files) {
  parser.parse(read(file), {sourceType: 'module', plugins: ['jsx']});
}

// Run the real color-derivation code in isolation from React Native dependencies.
const hexRgb = color => [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
const withOpacity = (hex, alpha) => 'rgba(' + hexRgb(hex).join(',') + ',' + alpha + ')';
const isDarkReaderBackground = hex => {
  const [r, g, b] = hexRgb(hex).map(v => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.48;
};
const source = read(files[0]).replace(/^import .*\n/m, '').replace(/export const /g, 'const ');
const moduleContext = {
  withOpacity, isDarkReaderBackground, output: {},
};
vm.runInNewContext(
  source + '\noutput.build = buildReaderHeaderChrome; output.mix = mixReaderHeaderColor;',
  moduleContext
);
const {build, mix} = moduleContext.output;
assert.equal(mix('#000000', '#FFFFFF', 0), '#000000');
assert.equal(mix('#000000', '#FFFFFF', 1), '#FFFFFF');
assert.equal(mix('#000000', '#FFFFFF', 0.5), '#808080');
const dark = build('#29231F');
const parchment = build('#FFF4DE');
const custom = build('#733F68');
assert.equal(dark.dark, true);
assert.equal(parchment.dark, false);
for (const chrome of [dark, parchment, custom]) {
  assert.equal(chrome.gradient.length, 4);
  assert.ok(chrome.gradient.every(color => /^rgba\(\d+,\d+,\d+,(?:0|0?\.\d+|1)\)$/.test(color)));
  assert.ok(chrome.gradient.at(-1).endsWith(',0)'));
  assert.notEqual(chrome.frost, parchment.frost || '', 'light and dark surfaces should differ');
  assert.ok(/^#[0-9A-F]{6}$/.test(chrome.pill));
}
assert.notEqual(dark.gradient[0], parchment.gradient[0]);
assert.notEqual(custom.gradient[0], parchment.gradient[0]);

const header = read(files[1]);
assert.ok(header.includes('const safeTop = compactReading ? Math.max(insets.top, topInset, 0) : topInset;'));
assert.ok(header.includes('paddingTop: contentTop'));
assert.ok(header.includes('const gradientHeight = Math.max(headerHeight + 14, safeTop + 74);'));
assert.ok(header.includes('colors={chrome.gradient}'));
assert.ok(header.includes('backgroundColor: chrome.frost'));
assert.ok(header.includes('backgroundColor: chrome.dropdown'));
assert.ok(!header.includes("backgroundColor: 'rgba(255, 244, 222, 0.78)'"));
for (const file of files.slice(2)) {
  const content = read(file);
  assert.ok(content.includes('backgroundColor: readerBackground'), file);
  assert.ok(content.includes("style={isDarkReaderBackground(readerBackground) ? 'light' : 'dark'}"), file);
  assert.ok(content.includes('gradientColor={readerBackground}'), file);
}
console.log('PASS: parsed 6 JS/JSX modules');
console.log('PASS: dark/light/custom gradients, adaptive frost and safe-area header geometry');
console.log('PASS: status-bar and root backgrounds follow the reader theme');
