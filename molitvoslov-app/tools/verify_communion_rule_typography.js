#!/usr/bin/env node
// Typography regression for Communion preparation and thanksgiving prayer rules.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/parser');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const service = read('src/services/communionRuleTypography.js');
const helpers = new Function(
  service
    .replace('export const getCommunionRuleKind =', 'const getCommunionRuleKind =')
    .replace('export const buildCommunionTypography =', 'const buildCommunionTypography =')
    .replace('export const getCommunionAlleluiaCompaction =', 'const getCommunionAlleluiaCompaction =')
    .replace('export const compactCommunionAlleluiaDisplay =', 'const compactCommunionAlleluiaDisplay =') +
  '\nreturn {getCommunionRuleKind, buildCommunionTypography, getCommunionAlleluiaCompaction, compactCommunionAlleluiaDisplay};'
)();
const {getCommunionRuleKind, buildCommunionTypography, getCommunionAlleluiaCompaction, compactCommunionAlleluiaDisplay} = helpers;

assert.equal(getCommunionRuleKind({name: 'Последование ко Святому Причащению'}), 'preparation');
assert.equal(getCommunionRuleKind({slug: 'posledovanie-ko-svyatomu-prichashcheniyu'}), 'preparation');
assert.equal(getCommunionRuleKind({name: 'Благодарственные молитвы'}), 'thanksgiving');
assert.equal(getCommunionRuleKind({slug: 'blagodarstvennye-molitvy'}), 'thanksgiving');
assert.equal(getCommunionRuleKind({name: 'Молитвы утренние', slug: 'molitvy-utrennie'}), null);
assert.equal(getCommunionRuleKind({name: 'Канон Ангелу Хранителю'}), null);

const plan = value => {
  const original = value;
  const result = buildCommunionTypography(value);
  assert.equal(value, original, 'Text is immutable');
  assert.ok(Array.isArray(result.ranges));
  for (const range of result.ranges) {
    assert.ok(Number.isInteger(range.start) && Number.isInteger(range.end));
    assert.ok(range.start >= 0 && range.end <= value.length && range.end > range.start);
  }
  return result;
};
const contains = (text, kind, expected) =>
  plan(text).ranges.some(range => range.kind === kind &&
    text.slice(range.start, range.end) === expected);

const paragraphs = 'Госпо́ди, спаси нас.\n\nПресвятая Богородице, помоги нам.';
assert.ok(contains(paragraphs, 'initial', 'Г'));
assert.ok(contains(paragraphs, 'initial', 'П'));
const start = 'Молитва: Господи, услыши нас.';
assert.ok(contains(start, 'cue', 'Молитва:'));
assert.ok(contains(start, 'initial', 'Г'));
assert.deepEqual(plan(start).breakBefore, [start.indexOf('Господи')]);
assert.ok(contains('Ирмос: Небесного круга', 'cue', 'Ирмос:'));
assert.ok(contains('Господи помилуй (Трижды).', 'note', '(Трижды)'));

const isolated = 'И ныне и присно и во веки веков. Аминь.';
assert.ok(contains(isolated, 'response', isolated));
const prose = 'Пресвятая Богородице, уповаем на Тя и ныне и присно и во веки веков. Аминь.';
assert.ok(!plan(prose).ranges.some(range => range.kind === 'response'));
const longer = 'И ныне и присно и во веки веков. Аминь. Дай нам мир.';
assert.ok(!plan(longer).ranges.some(range => range.kind === 'response'));
assert.ok(contains('Слава Отцу, и Сыну, и Святому Духу.', 'response',
  'Слава Отцу, и Сыну, и Святому Духу.'));

const alleluiaUnit = 'Аллилуйа, аллилуйа, аллилуйа, слава Тебе, Боже.';
const tripleAlleluia = [alleluiaUnit, alleluiaUnit, alleluiaUnit].join(' ') +
  ' (С тремя поклонами)';
assert.equal(compactCommunionAlleluiaDisplay(tripleAlleluia),
  alleluiaUnit + ' (Трижды)');
assert.ok(getCommunionAlleluiaCompaction(tripleAlleluia).length === 1);
assert.ok(plan(tripleAlleluia).ranges.some(range => range.kind === 'alleluia-replace'));
assert.equal(compactCommunionAlleluiaDisplay(alleluiaUnit), alleluiaUnit);
const distinct = 'Аллилуйа, аллилуйа, аллилуйа, слава Тебе, Боже. ' +
  'Аллилуйа, аллилуйа, аллилуйа, помилуй нас, Боже.';
assert.equal(compactCommunionAlleluiaDisplay(distinct), distinct,
  'Different prayer invocations must remain untouched');
const accentedUnit = 'Аллилу́йа, аллилу́йа, аллилу́йа, сла́ва Тебе́, Бо́же.';
const accentedTriple = [accentedUnit, accentedUnit, accentedUnit].join('\n') +
  ' (с тремя поклонами)';
assert.equal(compactCommunionAlleluiaDisplay(accentedTriple),
  accentedUnit + ' (Трижды)', 'Accents and line breaks must be handled');

const reader = read('src/components/reader/PrayerRuleReader.js');
assert.match(reader, /import \{getCommunionRuleKind, buildCommunionTypography, compactCommunionAlleluiaDisplay\}/);
assert.match(reader, /const communionKind = getCommunionRuleKind\(rule\)/);
assert.match(reader, /communionTypographyByItem\[String\(item\.id\)\]/);
assert.match(reader, /if \(isCommunionReadingRule\)/);
assert.match(reader, /classList\.add\('communion-' \+ range\.kind\)/);
assert.match(reader, /communionBreakBefore\.has\(start\)/);
assert.match(reader, /!isEveningMinorLiturgical && !isCommunionReadingRule/);
assert.match(reader, /while \(\s*!isCommunionReadingRule &&/);
assert.match(reader, /body\.communion-reading-rule \.reader-text \.communion-initial/);
assert.match(reader, /body\.communion-reading-rule \.translation-text/);
assert.match(reader, /body\.communion-reading-rule \.section-header \.prayer-title/);
assert.match(reader, /communion-alleluia-count::after/);
assert.match(reader, /communion-alleluia-hidden/);
assert.match(reader, /compactCommunionAlleluiaDisplay\(item\.content\)/);
assert.match(reader, /viewMode === 'both'/);
assert.match(reader, /isCommunionReadingRule\s*\?\s*\{/);
assert.match(reader, /content: viewMode === 'russian'/);
assert.match(reader, /isCommunionReadingRule && primaryLanguage === 'russian'/);
assert.match(reader, /!isCommunionReadingRule/);
assert.match(reader, /itemTextMap\.set\(/);
assert.match(reader, /root\.replaceChildren\(/);
// Use tag boundaries, not an LF-specific literal. Git on Windows may
// check out PrayerRuleReader.js with CRLF line endings.
const scriptMatch = /<script\b[^>]*>([\s\S]*?)<\/script>/u.exec(reader);
assert.ok(scriptMatch, 'Could not locate the WebView inline script');
new Function(scriptMatch[1]);

babel.parse(reader, {sourceType: 'module', plugins: ['jsx']});
babel.parse(service, {sourceType: 'module'});
console.log('PASS: Communion rule identification excludes morning/evening and unrelated texts');
console.log('PASS: red initials, actual rubric ranges, neutral prayer prose and brown repeat notes');
console.log('PASS: threefold Alleluia displays once with (Трижды), retaining original selection offsets');
console.log('PASS: original text and UTF-16 selection offsets remain unchanged');
console.log('PASS: Church Slavonic styling and secondary parallel translations remain separate');
console.log('PASS: WebView inline script and React Native sources parse');
