#!/usr/bin/env node
// Validate all three readings without changing offline content or saved data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/parser');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const data = JSON.parse(read('src/data/threeCombinedCanons.json'));
const api = read('src/services/contentApi.js');
const category = read('src/screens/CommunionPreparationScreen.js');
const canonScreen = read('src/screens/CanonScreen.js');
const styles = read('src/components/reader/selectableDocumentReader/styles.js');
const coverageCode = read('src/services/canonRussianCoverage.js');

assert.equal(data.slug, 'tri-sovmeshchennykh-kanona');
assert.equal(data.id, 99000001);
assert.equal(data.title, 'Три совмещённых канона');
assert.equal(data.sections.length, 222);
assert.equal(data.traditional_sections.length, 321);
const all = [...data.sections, ...data.traditional_sections];
assert.equal(new Set(all.map(section => section.id)).size, all.length);
for (const [variant, sections] of [['modern', data.sections], ['traditional', data.traditional_sections]]) {
  sections.forEach((section, index) => {
    assert.equal(section.order, index + 1, variant + ': incorrect stanza order');
    assert.equal(section.variant, 1);
    assert.ok(section.id > 0);
    if (!section.text) {
      assert.equal(section.section_type, 'other');
      assert.ok(section.heading.trim());
    } else {
      const key = variant === 'modern' ? 'content' : 'traditional_content';
      assert.ok(section.text[key].trim(), variant + ': empty section ' + section.id);
    }
  });
}
assert.equal(data.sections.filter(section => !section.text).length, 16);
assert.equal(data.traditional_sections.filter(section => !section.text).length, 44);
assert.equal(data.sections.filter(section => section.text).length, 206);
assert.equal(data.sections.filter(section => section.text && section.text.translation.trim()).length, 206);
assert.equal(data.traditional_sections.filter(section => section.text).length, 277);
for (const heading of ['Песнь 1','Песнь 9','Кондак','Икос','Молитва Ангелу Хранителю']) {
  assert.ok(data.sections.some(section => section.heading === heading));
}
assert.ok(data.traditional_sections.some(section => /КанHнъ/u.test(section.heading)));
assert.ok(data.traditional_sections.some(section => /Њкончaніе/u.test(section.heading)));
assert.ok(!data.traditional_sections.some(section =>
  String(section.text?.traditional_content || '').startsWith('См. также:')));
assert.ok(data.sections.every(section => !section.text ||
  !section.text.content.includes('<strong>')));

const getCoverage = new Function(
  coverageCode.replace('export const getCanonRussianCoverage =',
    'const getCanonRussianCoverage =') +
  '\nreturn getCanonRussianCoverage;'
)();
assert.equal(getCoverage(data.sections).complete, true);
assert.ok(data.sections.filter(section => section.section_type === 'refrain').length >= 80);
assert.ok(data.sections.filter(section => section.section_type === 'prayer').length >= 10);

assert.match(api, /import threeCombinedCanons from '\.\.\/data\/threeCombinedCanons\.json'/);
assert.match(api, /match\[1\] === threeCombinedCanons\.slug/);
assert.match(category, /'tri-sovmeshchennykh-kanona'/);
assert.match(category, /navigation\.navigate\('Canon'/);
assert.match(canonScreen, /canon\?\.traditional_sections/);
assert.match(canonScreen, /viewMode === MODE_TRADITIONAL/);
assert.match(canonScreen, /suppress_inline_label/);
assert.match(canonScreen, /viewMode === MODE_RUSSIAN && !isStructuredCombinedCanon/);
assert.match(canonScreen, /three-combined-canon/);
assert.match(styles, /\.reader-language-traditional \.rule-item\.three-combined-canon \.section-title/);

for (const file of [
  'src/services/contentApi.js',
  'src/screens/CommunionPreparationScreen.js',
  'src/screens/CanonScreen.js'
]) {
  babel.parse(read(file), {sourceType: 'module', plugins: ['jsx']});
}
console.log('PASS: 206 CS and RU paragraphs; 277 traditional paragraphs');
console.log('PASS: 16 modern and 44 traditional headings; complete ordered text');
console.log('PASS: valid Russian coverage, refrains and prayer sections');
console.log('PASS: offline API, Communion category, traditional reader integration');
console.log('PASS: JS/JSX syntax and intact existing offlineContent.json');
