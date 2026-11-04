/* Regression checks for search deep links, scroll chrome, and live theme preview.
 * Offline, read-only, run with: node tools/verify_reader_customization_20261104.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const routeSource = read('src/services/search/openRoute.js');
assert.match(routeSource, /export const resolveSearchOpenRoute =/);
const sandbox = {module: {exports: {}}};
vm.runInNewContext(
  routeSource.replace(
    'export const resolveSearchOpenRoute =',
    'module.exports.resolveSearchOpenRoute ='
  ),
  sandbox
);
const resolve = sandbox.module.exports.resolveSearchOpenRoute;
const text = {id: 108, slug: 'molitva-svyatogo-pravednogo-ioanna-kronshtadtskogo', title: 'Молитва', is_visible: true};
const input = {route: {name: 'Book', params: {
  categorySlug: 'raznye-molitvy',
  focusTarget: {anchor_type: 'category_text', text_id: 108, highlightQuery: 'Иоанна'},
}}};
const opening = resolve(input, {texts: {[text.slug]: text}});
assert.equal(opening.name, 'Reader');
assert.equal(opening.params.slug, text.slug);
assert.equal(opening.params.focusTarget.highlightQuery, 'Иоанна');
assert.equal(opening.params.focusTarget.anchor_type, 'text');
assert.equal(opening.params.focusTarget.anchor_id, 108);
assert.equal(resolve(input, {texts: {}}).name, 'Book', 'Missing id must preserve old route');
assert.equal(resolve({route:{name:'PrayerRule',params:{slug:'morning'}}}, {}).name, 'PrayerRule');
assert.equal(resolve({route:{name:'Book',params:{}}}, {}).name, 'Book');
const hidden = {texts: {[text.slug]: {...text, is_visible:false}}};
assert.equal(resolve(input, hidden).name, 'Book', 'Never open unpublished texts');
console.log('PASS: search opens exact published prayer while keeping rule/dead-link routes');

const chrome = read('src/hooks/useReadingChrome.js');
assert.match(chrome, /handleNativeReadingScroll/);
assert.match(chrome, /delta > 0 \? 'down' : 'up'/);
assert.match(chrome, /y <= 35/);
for (const file of ['SelectableDocumentReader.js', 'PrayerRuleReader.js']) {
  const source = read('src/components/reader/' + file);
  assert.match(source, /onScroll={onNativeReadingScroll}/);
  assert.ok(source.includes('scrollEventThrottle={16}'), file + ': native WebView throttle missing');
  assert.match(source, /setScopedBackground|setChromeBackground/);
}
assert.match(read('src/components/reader/SelectableDocumentReader.js'), /direction = delta > 0 \? 'down' : 'up'/);
assert.match(read('src/components/reader/PrayerRuleReader.js'), /direction = diff > 0 \? 'down' : 'up'/);
console.log('PASS: correct directions in both WebView readers plus native scroll fallback');

const header = read('src/components/navigation/FixedSectionHeader.js');
assert.match(header, /gradientColor = null/);
assert.match(header, /withOpacity\(chromeBackground, 0\.82\)/);
assert.match(header, /isDarkReaderBackground\(chromeBackground\)/);
assert.match(read('src/components/reader/SelectableDocumentReader.js'), /withOpacity\(pageBackground, 0\.72\)/);
assert.match(read('src/components/reader/PrayerRuleReader.js'), /colors={\['transparent', readerBg \+ 'BB', readerBg\]}/);
console.log('PASS: upper and lower reading fades follow background color');

const sheets = read('src/components/reader/ReaderAppearanceSheet.js');
const picker = read('src/components/settings/ColorPalettePicker.js');
assert.match(sheets, /onGestureStart=\{\(\) => setSliderPreview\(true\)\}/);
assert.match(sheets, /onGestureEnd=\{\(\) => setSliderPreview\(false\)\}/);
assert.match(sheets, /styles\.activeColorPicker/);
assert.match(picker, /onResponderMove={updateSquare}/);
assert.match(picker, /onResponderMove={updateHue}/);
assert.match(picker, /<LinearGradient/);
console.log('PASS: compact continuous color palette with live drag preview');

for (const file of [
  'ReaderScreen.js','BookScreen.js','PrayerRuleScreen.js',
  'AkathistScreen.js','CanonScreen.js','KathismaScreen.js',
]) {
  const source = read('src/screens/' + file);
  assert.match(source, /onNativeReadingScroll={handleNativeReadingScroll}/, file + ' native scroll');
  assert.match(source, /gradientColor={resolveReaderAppearance\(appearance\)\.background}/, file + ' theme');
}
console.log('PASS: all 6 primary readers share new chrome/theme wiring');

const searchScreen = read('src/screens/SearchScreen.js');
assert.match(searchScreen, /resolveSearchOpenRoute\(item, getCurrentContent\(\)\)/);
console.log('PASS: search click path uses dedicated Reader route resolution');

console.log('READER CUSTOMIZATION REGRESSION CHECKS PASSED');
