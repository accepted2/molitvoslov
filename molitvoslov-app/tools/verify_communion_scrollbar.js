#!/usr/bin/env node
// Static regression for the Communion menu and slim reader scrollbars.
// Does not alter or read personal confession notes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/parser');
const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const menu = read('src/screens/CommunionPreparationScreen.js');
const confession = read('src/screens/ConfessionPreparationScreen.js');
const indicator = read('src/components/reader/ThinScrollIndicator.js');
const prayerReader = read('src/components/reader/PrayerRuleReader.js');
const documentReader = read('src/components/reader/selectableDocumentReader/styles.js');

assert.match(menu, /<ThinScrollIndicator/);
assert.match(menu, /ref=\{scrollRef\}/);
assert.match(menu, /onScroll=\{handleScroll\}/);
assert.match(menu, /scrollEventThrottle=\{16\}/);
assert.match(menu, /onContentSizeChange=\{\(_width, height\) => setContentHeight\(height\)\}/);
assert.match(menu, /scrollRef\.current\?\.scrollTo\(\{y, animated: false\}\)/);
assert.match(menu, /onLayout=\{event => setViewportHeight\(event\.nativeEvent\.layout\.height\)\}/);
assert.match(menu, /showsVerticalScrollIndicator=\{false\}/);
assert.match(menu, /<ThinScrollIndicator[\s\S]*?topInset=\{headerHeight \+ 8\}/);
assert.match(menu, /bottomInset=\{Math\.max\(insets\.bottom \+ 69, 76\)\}/);

assert.match(menu, /sectionTitle:\s*\{[^}]*backgroundColor: 'rgba\(255, 244, 222, 0\.91\)'/s);
assert.match(menu, /sectionTitle:\s*\{[^}]*color: '#4A2B19'/s);
assert.match(menu, /sectionTitle:\s*\{[^}]*borderColor: 'rgba\(111, 71, 39, 0\.28\)'/s);
for (const label of ['Каноны', 'Последование и молитвы', 'Подготовка к исповеди']) {
  assert.ok(menu.includes(label));
}
assert.match(menu, /navigation\.navigate\('ConfessionPreparation'\)/);
assert.match(menu, /openPrayerRule\('posledovanie-ko-svyatomu-prichashcheniyu'\)/);

assert.match(confession, /<ThinScrollIndicator/);
assert.match(confession, /onScroll=\{handleListScroll\}/);
assert.match(confession, /handleNativeReadingScroll\(event\)/);
assert.match(confession, /showsVerticalScrollIndicator=\{false\}/);
assert.match(confession, /scrollRef\.current\?\.scrollToOffset\(\{offset, animated: false\}\)/);
assert.match(indicator, /export const ThinScrollIndicator/);
assert.match(indicator, /PanResponder\.create\(/);
assert.match(indicator, /thumbTravel/);
assert.match(indicator, /scrollY\.interpolate\(/);
assert.match(indicator, /width: 4/);
assert.match(indicator, /width: 22/);

const cssThumb = (source) => {
  const match = source.match(/#reader-scroll-thumb\s*\{([^}]+)\}/u);
  assert.ok(match, 'Missing scroll thumb CSS');
  return match[1];
};
assert.match(cssThumb(prayerReader), /width: 5px;/u);
assert.match(cssThumb(documentReader), /width: 4px;/u);
assert.match(prayerReader, /#reader-scroll-track\s*\{[^}]*width: 30px;/su);
assert.match(documentReader, /#reader-scroll-track\s*\{[^}]*width: 30px;/su);

for (const source of [
  'src/screens/CommunionPreparationScreen.js',
  'src/screens/ConfessionPreparationScreen.js',
  'src/components/reader/ThinScrollIndicator.js',
]) babel.parse(read(source), {sourceType: 'module', plugins: ['jsx']});

console.log('PASS: Communion menu has a draggable native slim scrollbar');
console.log('PASS: Section headings are readable on warm translucent parchment strips');
console.log('PASS: Confession catalog and selected notes share the slim scrollbar');
console.log('PASS: WebView thumb widths are 5px/4px without narrowing drag tracks');
console.log('PASS: React Native JS/JSX syntax');
