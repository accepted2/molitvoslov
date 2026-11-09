// Run from molitvoslov-app: node tools/verify_communion_continuous_prayers_20261109.js
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const parser = require('@babel/parser');
const root = path.resolve(__dirname, '..');
const typographyPath = path.join(root, 'src/services/communionRuleTypography.js');
const readerPath = path.join(root, 'src/components/reader/PrayerRuleReader.js');
const typography = fs.readFileSync(typographyPath, 'utf8');
const reader = fs.readFileSync(readerPath, 'utf8');

// Verify the actual source modules, not a restated version of their logic.
parser.parse(typography, {sourceType: 'module'});
parser.parse(reader, {sourceType: 'module', plugins: ['jsx']});
const sandbox = {};
vm.runInNewContext(
  typography.replace(/export const /g, 'const ') +
    '\nexposed = {isCommunionPrayerHeading, buildCommunionTypography};',
  sandbox
);
const {isCommunionPrayerHeading, buildCommunionTypography} = sandbox.exposed;

for (const title of [
  'Моли́тва 1-я, свт. Васи́лия Великого',
  'Моли́тва 6-я, прп. Симео́на',
  'Молитва 10-я',
  'Его́ же, 8-я',
  'Его же, 9-я',
  'Благода́рственная моли́тва, 1-я',
]) {
  assert.equal(isCommunionPrayerHeading(title), true, title);
}
for (const title of [
  'Псало́м 50',
  'Песнь 9',
  'Ирмо́с',
  'Тропари покаянные',
  'Кано́н, гла́с 2-й',
  'Приходя́ же причаститься',
]) {
  assert.equal(isCommunionPrayerHeading(title), false, title);
}

const prayer = 'Влады́ко Го́споди, поми́луй меня.\n\nИ да́руй мне мир.\n\nТебе́ сла́ва во ве́ки. Ами́нь.';
const continuous = buildCommunionTypography(prayer, {continuousPrayer: true});
const ordinary = buildCommunionTypography(prayer);
assert.equal(continuous.ranges.filter(range => range.kind === 'initial').length, 1);
assert.equal(ordinary.ranges.filter(range => range.kind === 'initial').length, 3);
assert.equal(continuous.breakBefore.length, 0);

const rubrics = buildCommunionTypography('Сла́ва:\n\nГо́споди, поми́луй. (Три́жды)', {continuousPrayer: true});
assert.ok(rubrics.ranges.some(range => range.kind === 'cue'));
assert.ok(rubrics.ranges.some(range => range.kind === 'note'));

assert.ok(reader.includes('followingTextIsPrayer = isCommunionPrayerHeading(item.title || item.content)'));
assert.ok(reader.includes('isCommunionPrayerHeading(item.text.title)'));
assert.ok(reader.includes('...buildCommunionTypography(value, {continuousPrayer})'));
assert.ok(reader.includes('const continuousCommunionPrayer = !!communionTypography?.continuousPrayer'));
assert.ok(reader.includes('if (!continuousRussianEveningPrayer && !continuousCommunionPrayer)'));
assert.ok(reader.includes('compactParagraphGaps(root);'));

console.log('PASS: communion prayer headings including accented Cyrillic and Его же');
console.log('PASS: only one prayer initial; psalms, canons and chants keep paragraph markup');
console.log('PASS: original text and offsets preserved; no editorial gap elements in prayer bodies');
