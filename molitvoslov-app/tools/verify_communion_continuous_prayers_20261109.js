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
    '\nexposed = {isCommunionPrayerHeading, buildCommunionTypography, getCommunionLiturgicalSeparators};',
  sandbox
);
const {isCommunionPrayerHeading, buildCommunionTypography, getCommunionLiturgicalSeparators} = sandbox.exposed;

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
assert.ok(rubrics.ranges.some(range => range.kind === 'count-note'));


// Real structure of the Communion preparation items 332 / 333: several short
// invocations are stored in one Text item, separated by blank source lines.
const firstShort = 'Святы́й Бо́же, Святы́й Кре́пкий, Святы́й Безсме́ртный, поми́луй нас. (Tрижды)\n\nСла́ва Отцу, и Сы́ну, и Свято́му Ду́ху, и ны́не и при́сно и во ве́ки веко́в. Ами́нь.';
const secondShort = 'Пресвята́я Тро́ице, поми́луй нас; Го́споди, очи́сти грехи́ на́ша.\n\nГо́споди, поми́луй. (Трижды)\n\nСла́ва Отцу, и Сы́ну, и Свято́му Ду́ху. Ами́нь.';
const firstData = buildCommunionTypography(firstShort, {communionKind: 'preparation'});
const secondData = buildCommunionTypography(secondShort, {communionKind: 'preparation'});
assert.deepEqual(Array.from(firstData.separatorBefore), [firstShort.indexOf('Сла́ва')]);
assert.deepEqual(Array.from(secondData.separatorBefore), [
  secondShort.indexOf('Го́споди, поми́луй.'),
  secondShort.indexOf('Сла́ва'),
]);
const firstThrice = firstData.ranges.find(range => range.kind === 'count-note');
const secondThrice = secondData.ranges.find(range => range.kind === 'count-note');
assert.equal(firstShort.slice(firstThrice.start, firstThrice.end), '(Tрижды)');
assert.equal(secondShort.slice(secondThrice.start, secondThrice.end), '(Трижды)');
assert.equal(getCommunionLiturgicalSeparators('Псало́м 50\n\nСла́ва Отцу.' ).length, 0);
assert.equal(buildCommunionTypography(secondShort, {continuousPrayer: true, communionKind: 'preparation'}).separatorBefore.length, 0);
assert.equal(buildCommunionTypography(secondShort, {communionKind: 'thanksgiving'}).separatorBefore.length, 0);
assert.equal(buildCommunionTypography('Го́споди, поми́луй. (12 раз)\n\nПрииди́те, поклони́мся.', {communionKind: 'preparation'}).separatorBefore.length, 0);

assert.ok(reader.includes('followingTextIsPrayer = isCommunionPrayerHeading(item.title || item.content)'));
assert.ok(reader.includes('isCommunionPrayerHeading(item.text.title)'));
assert.ok(reader.includes('...buildCommunionTypography(value, {continuousPrayer})'));
assert.ok(reader.includes('const continuousCommunionPrayer = !!communionTypography?.continuousPrayer'));
assert.ok(reader.includes('if (!continuousRussianEveningPrayer && !continuousCommunionPrayer)'));
assert.ok(reader.includes('compactParagraphGaps(root);'));
assert.ok(reader.includes('communionSeparatorBefore.forEach(offset => boundaries.add(offset))'));
assert.ok(reader.includes("divider.className = 'communion-short-prayer-divider'"));
assert.ok(reader.includes('.communion-count-note'));
assert.ok(reader.includes('buildCommunionTypography(value, {continuousPrayer, communionKind})'));

console.log('PASS: communion prayer headings including accented Cyrillic and Его же');
console.log('PASS: only one prayer initial; psalms, canons and chants keep paragraph markup');
console.log('PASS: Latin/Cyrillic T in Трижды, text-safe dividers within liturgical blocks');
console.log('PASS: original text and offsets preserved; no editorial gap elements in prayer bodies');
