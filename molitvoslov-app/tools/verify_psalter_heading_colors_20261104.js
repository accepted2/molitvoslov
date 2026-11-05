#!/usr/bin/env node
// Regression guard: scoped reader appearance must not paint all Psalm headers
// and the parallel Russian column in the ordinary body text color.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const source = read('src/services/scopedReaderAppearance.js');
const opening = source.slice(
  source.indexOf('export const READER_PALETTES'),
  source.indexOf('const ownerScope'),
);
const ending = source.slice(source.indexOf('export const applyReaderAppearance'));
assert.ok(opening && ending.includes('psalterHeading'));
const sandbox = {module: {exports: {}}};
vm.runInNewContext(
  (opening + '\n' + ending)
    .replace(/export const /g, 'const ') +
  '\nmodule.exports.apply = applyReaderAppearance;',
  sandbox,
);
const apply = sandbox.module.exports.apply;
const screen = read('src/screens/KathismaScreen.js');
assert.match(screen, /className: 'psalter-psalm-section'/);
assert.match(screen, /className: 'psalter secondary'/);

function inspectAppearance(appearance) {
  let injected;
  apply({injectJavaScript(js) {injected = js;}}, appearance);
  assert.ok(injected, 'Appearance updater must inject CSS');
  const vars = {};
  let currentStyle = null;
  const fakeDocument = {
    documentElement: {style: {setProperty(k, v) {vars[k] = v;}}},
    getElementById() {return currentStyle;},
    createElement(tag) {currentStyle = {tag, textContent: ''}; return currentStyle;},
    head: {appendChild() {}},
  };
  vm.runInNewContext(injected, {document: fakeDocument});
  assert.ok(currentStyle && currentStyle.textContent, 'Appearance stylesheet missing');
  const css = currentStyle.textContent;
  assert.match(css,
    /\.psalter-kathisma-reader \.rule-item\.psalter-psalm-section \.section-header \.prayer-title\s*\{color:var\(--psalter-heading-color\) !important;/);
  assert.match(css,
    /\.psalter-kathisma-reader \.reader-row-parallel \.reader-text\.psalter\.secondary\s*\{color:var\(--psalter-translation-color\) !important;/);
  assert.ok(css.lastIndexOf('.psalter-kathisma-reader') > css.indexOf('.prayer-title'),
    'Psalter overrides must follow the generic recoloring rules');
  return vars;
}

const parchment = inspectAppearance({palette: 'parchment', fontSize: 17});
assert.equal(parchment['--psalter-heading-color'], '#765238');
assert.equal(parchment['--psalter-translation-color'], '#765238');
const night = inspectAppearance({palette: 'night', fontSize: 17});
assert.equal(night['--psalter-heading-color'], '#D1AE7A');
assert.equal(night['--psalter-translation-color'], '#D8C7AC');
const custom = inspectAppearance({
  palette: 'custom', customBackground: '#202020', customText: '#F0F0F0',
});
assert.equal(custom['--psalter-heading-color'], '#D1AE7A');
assert.equal(custom['--psalter-translation-color'], '#D8C7AC');
const light = inspectAppearance({
  palette: 'custom', customBackground: '#FFF9EE', customText: '#222222',
});
assert.equal(light['--psalter-heading-color'], '#765238');
console.log('PASS: Psalm headers stay brown; parallel RU text stays distinct in light/night/custom themes');
