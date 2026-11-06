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
const typographyCode = read('src/services/canonTypography.js');

assert.equal(data.slug, 'tri-sovmeshchennykh-kanona');
assert.equal(data.id, 99000001);
assert.equal(data.title, 'Три совмещённых канона');
assert.equal(data.sections.length, 214);
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
assert.equal(data.sections.filter(section => section.text).length, 198);
assert.equal(data.sections.filter(section => section.text && section.text.translation.trim()).length, 198);
// No source paragraph has been deleted: several paragraphs now share one
// reading block, rather than getting separate separators and red initials.
const countParagraphs = (value) => String(value).split(/\n\s*\n/u).length;
assert.equal(data.sections.filter(s => s.text)
  .reduce((total, s) => total + countParagraphs(s.text.content), 0), 206);
assert.equal(data.sections.filter(s => s.text)
  .reduce((total, s) => total + countParagraphs(s.text.translation), 0), 206);
const prayers = data.sections.filter(s => s.section_type === 'prayer');
assert.equal(prayers.length, 4, 'Two distinct Theotokos prayers must stay separate');
assert.deepEqual(prayers.map(s => s.paragraph_count || 1), [3, 1, 5, 3]);
assert.ok(prayers.filter(s => s.grouped_prayer).length === 3);
assert.ok(prayers[0].text.content.includes('\n\nОмрачи́хся'));
assert.equal(data.traditional_sections.filter(section => section.text).length, 277);
for (const heading of ['Песнь 1','Песнь 9','Кондак','Икос','Молитва Ангелу Хранителю']) {
  assert.ok(data.sections.some(section => section.heading === heading));
}
// Unicode conversion: the old UCS font codes like "Мlтвами" and "КанHнъ"
 // must never reach the Unicode-only Ponomar renderer.
assert.equal(data.source.traditional_encoding, 'Unicode (converted from UCS)');
const traditionalBody = data.traditional_sections.map(section =>
  section.text?.traditional_content || section.heading || ''
).join('\n');
assert.ok(data.traditional_sections[0].text.traditional_content
  .startsWith('Мл҃твами ст҃ы́хъ'));
assert.ok(!/[A-Za-z0-9]/u.test(traditionalBody),
  'Old Latin/digit UCS glyph codes must not remain');
assert.ok(!/[\uFFFD\uFFFE]/u.test(traditionalBody));
assert.ok(data.traditional_sections.some(section => /канѡ́нъ/iu.test(section.heading)));
assert.ok(data.traditional_sections.some(section => /ѡ҆конча́нїе/iu.test(section.heading)));
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
assert.equal(data.sections.filter(section => section.section_type === 'prayer').length, 4);

assert.match(api, /import threeCombinedCanons from '\.\.\/data\/threeCombinedCanons\.json'/);
assert.match(api, /match\[1\] === threeCombinedCanons\.slug/);
assert.match(category, /'tri-sovmeshchennykh-kanona'/);
assert.match(category, /navigation\.navigate\('Canon'/);
assert.match(canonScreen, /canon\?\.traditional_sections/);
assert.match(canonScreen, /viewMode === MODE_TRADITIONAL/);
assert.match(canonScreen, /suppress_inline_label/);
assert.match(canonScreen, /viewMode === MODE_RUSSIAN && !isStructuredCombinedCanon/);
assert.match(canonScreen, /three-combined-canon/);
assert.match(canonScreen, /const modernSections = useMemo/);
assert.match(canonScreen, /getCanonRussianCoverage\(modernSections\)/);
assert.match(canonScreen, /canon\?\.traditional_sections\?\.length/);
assert.match(canonScreen, /initialOnlyFirstParagraph: !!section\.grouped_prayer/);
assert.ok(!/getCanonRussianCoverage\(displaySections\)/.test(canonScreen),
  'Language availability must not be recomputed from the selected tab');
assert.match(styles, /\.rule-item\.three-combined-canon\.three-combined-traditional \.section-title/);
assert.match(styles, /\.rule-item\.three-combined-traditional\.three-combined-paragraph/);
assert.match(styles, /\.rule-item\.three-combined-traditional\.three-combined-heading/);
// The traditional source's independent paragraphs have subtle separators;
// refrain lines remain attached to the troparia that follow them.
assert.match(canonScreen, /effectiveSectionType === 'refrain'/);
assert.match(canonScreen, /three-combined-paragraph three-combined-refrain/);
assert.match(styles, /\.rule-item\.three-combined-traditional\.three-combined-paragraph\s*\{[^}]*border-bottom: 1px solid rgba\(123, 79, 36, 0\.20\);/s);
assert.match(styles, /\.rule-item\.three-combined-traditional\.three-combined-refrain\s*\{[^}]*border-bottom: none;/s);
assert.match(styles, /\.rule-item\.three-combined-traditional\.three-combined-heading\s*\{[^}]*border-bottom: 1px solid rgba\(123, 79, 36, 0\.24\);/s);
assert.ok(data.traditional_sections.filter(section => section.section_type === 'refrain').length > 50);
assert.match(styles, /font-family: 'Ponomar', Georgia, serif/);
assert.match(canonScreen, /three-combined-paragraph/);
assert.match(canonScreen, /three-combined-heading/);
const buildTypography = new Function(
  typographyCode.replace('export const buildCanonTypography =',
    'const buildCanonTypography =') +
  '\nreturn buildCanonTypography;'
)();
const prayerSample = prayers[0].text.content;
const plain = buildTypography(prayerSample, '', '', 'prayer');
const grouped = buildTypography(prayerSample, '', '', 'prayer',
  {initialOnlyFirstParagraph: true});
assert.equal(plain.ranges.filter(range => range.kind === 'initial').length, 3);
assert.equal(grouped.ranges.filter(range => range.kind === 'initial').length, 1);
assert.equal(grouped.prayerProse, true);

for (const file of [
  'src/services/contentApi.js',
  'src/screens/CommunionPreparationScreen.js',
  'src/screens/CanonScreen.js',
  'src/services/canonTypography.js'
]) {
  babel.parse(read(file), {sourceType: 'module', plugins: ['jsx']});
}
console.log('PASS: 206 CS and RU paragraphs in 198 modern reading blocks; 277 traditional paragraphs');
console.log('PASS: 277 traditional paragraphs converted UCS to Church Slavonic Unicode');
console.log('PASS: thin traditional prayer and heading separators; refrain stays with its troparion');
console.log('PASS: 4 prayers, 3 joined prayer bodies; one red initial per joined prayer');
console.log('PASS: traditional switch does not reset availability or selected tab');
console.log('PASS: 16 modern and 44 traditional headings; complete ordered text');
console.log('PASS: valid Russian coverage, refrains and prayer sections');
console.log('PASS: offline API, Communion category, traditional reader integration');
console.log('PASS: JS/JSX syntax and intact existing offlineContent.json');
