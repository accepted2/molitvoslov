#!/usr/bin/env node
// Canon-only typography regression: assert original text and selection offsets
// remain identical and unrelated prayer/akathist/psalter readers are excluded.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/parser');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const source = read('src/services/canonTypography.js');
const buildCanonTypography = new Function(
  source.replace('export const buildCanonTypography =', 'const buildCanonTypography =') +
    '\nreturn buildCanonTypography;'
)();

const format = (text, label, heading) => {
  const snapshot = text;
  const info = buildCanonTypography(text, label, heading);
  assert.equal(text, snapshot, 'The original text must remain unchanged');
  assert.ok(Array.isArray(info.ranges));
  assert.ok(Array.isArray(info.breakBefore));
  for (const range of info.ranges) {
    assert.ok(range.start >= 0 && range.end <= text.length && range.end > range.start);
  }
  return info;
};
const contains = (text, info, kind, value) =>
  info.ranges.some(range =>
    range.kind === kind && text.slice(range.start, range.end) === value
  );

const example = 'Тропарь Богородице, глас 4-й: К Богородице прилежно ныне притечем.';
const e = format(example);
assert.ok(contains(example, e, 'long-cue', 'Тропарь Богородице, глас 4-й:'));
assert.deepEqual(e.breakBefore, [example.indexOf('К Богородице')]);
assert.ok(contains(example, e, 'initial', 'К'));

const accented = 'Тропа́рь Богородице, глас 4-й: к Богородице';
const a = format(accented);
assert.ok(contains(accented, a, 'long-cue', 'Тропа́рь Богородице, глас 4-й:'));
assert.ok(contains(accented, a, 'initial', 'к'));

const glory = 'Сла́ва Отцу́, и Сы́ну, и Свято́му Ду́ху. гос́поди, помилуй.';
const g = format(glory);
assert.ok(contains(glory, g, 'doxology', 'Сла́ва Отцу́, и Сы́ну, и Свято́му Ду́ху.'));
assert.ok(contains(glory, g, 'initial', 'г'));
assert.deepEqual(g.breakBefore, [glory.indexOf('гос́поди')]);

const now = 'И ныне, и присно, и вовеки веков. Аминь. спаси нас';
const n = format(now);
assert.ok(contains(now, n, 'doxology', 'И ныне, и присно, и вовеки веков. Аминь.'));
assert.ok(contains(now, n, 'initial', 'с'));
assert.deepEqual(n.breakBefore, [now.indexOf('спаси')]);

const traditionalGlory = 'Сла́ва Ѻ҆ц҃ꙋ̀ и҆ Сн҃ꙋ и҆ Ст҃о́мꙋ Дх҃ꙋ. Помилꙋй нас.';
const traditional = format(traditionalGlory);
assert.ok(contains(traditionalGlory, traditional, 'doxology',
  'Сла́ва Ѻ҆ц҃ꙋ̀ и҆ Сн҃ꙋ и҆ Ст҃о́мꙋ Дх҃ꙋ.'));
assert.deepEqual(traditional.breakBefore, [traditionalGlory.indexOf('Помилꙋй')]);

// Regression for the real canon screenshot: the first colon belongs to the
// hymn body ("источи:" / "помози:"), NOT to a red introductory rubric.
const realGlory =
  'Сла́ва Отцу́, и Сы́ну, и Свято́му Ду́ху. ' +
  'Благоде́теля рождши добрых виновнаго, благодея́ния богатство всем источи́: ' +
  'Вся бо можеши, яко сильнаго';
const gloryMarkup = format(realGlory);
assert.deepEqual(gloryMarkup.breakBefore, [realGlory.indexOf('Благоде́теля')]);
assert.ok(contains(realGlory, gloryMarkup, 'doxology',
  'Сла́ва Отцу́, и Сы́ну, и Свято́му Ду́ху.'));
assert.ok(contains(realGlory, gloryMarkup, 'initial', 'Б'));
assert.ok(!gloryMarkup.ranges.some(range => ['long-cue', 'prayer-cue', 'glory-cue'].includes(range.kind)),
  'Glory + verse before a colon must not be considered an introductory rubric');
assert.ok(!gloryMarkup.ranges.some(range =>
  range.kind !== 'initial' && range.kind !== 'doxology' &&
  realGlory.slice(range.start, range.end).includes('Благоде́теля')),
  'Only the first letter of the verse can be emphasized');

const realNow =
  'И ны́не, и при́сно, во ве́ки веко́в, ами́нь. ' +
  'Лю́тыми неду́ги и боле́зненными страстьми истяза́ему, ' +
  'Де́во, Ты ми́ помози́: Исцели́й бо неоскудное Тя знаю';
const nowMarkup = format(realNow);
assert.deepEqual(nowMarkup.breakBefore, [realNow.indexOf('Лю́тыми')]);
assert.ok(contains(realNow, nowMarkup, 'doxology',
  'И ны́не, и при́сно, во ве́ки веко́в, ами́нь.'));
assert.ok(contains(realNow, nowMarkup, 'initial', 'Л'));
assert.ok(!nowMarkup.ranges.some(range => ['long-cue', 'prayer-cue', 'glory-cue'].includes(range.kind)),
  'And now + verse before a colon must not be colored as a heading');

const newLine = 'Слава Отцу и Сыну и Святому Духу.\nГосподи, помилуй.';
assert.deepEqual(format(newLine).breakBefore, [], 'Never add duplicate break before existing newline');

const twice = 'Господи, помилуй. (Дважды) (Трижды.)';
const r = format(twice);
assert.ok(contains(twice, r, 'repeat-note', '(Дважды)'));
assert.ok(contains(twice, r, 'repeat-note', '(Трижды.)'));

const para = 'господи, помилуй.\n\nспаси нас';
const p = format(para);
assert.ok(contains(para, p, 'initial', 'г'));
assert.ok(contains(para, p, 'initial', 'с'));

const short = 'Ирмос: Достойно есть.';
const shortStyle = format(short);
assert.deepEqual(shortStyle.breakBefore, [], 'Short established cues remain inline');
assert.ok(contains(short, shortStyle, 'short-cue', 'Ирмос:'));
assert.ok(contains(short, shortStyle, 'initial', 'Д'));

const gloryCue = 'Слава: Господи, помилуй.';
const gloryStyle = format(gloryCue);
assert.deepEqual(gloryStyle.breakBefore, [], 'Short glory label stays on its original line');
assert.ok(contains(gloryCue, gloryStyle, 'glory-cue', 'Слава:'));
assert.ok(contains(gloryCue, gloryStyle, 'initial', 'Г'));

const prayerCue = 'Молитва: Господи, услыши нас.';
const prayerStyle = format(prayerCue);
assert.ok(contains(prayerCue, prayerStyle, 'prayer-cue', 'Молитва:'));
assert.deepEqual(prayerStyle.breakBefore, [prayerCue.indexOf('Господи')]);

// A verse that starts with "Молитва" must not be painted red through a
// later colon. Match longer prayer headings only against the actual title.
const prose = 'Молитва умиляет сердце наше и направляет нас ко Господу: помилуй нас.';
const proseStyle = format(prose, '', 'Молитва');
assert.ok(!proseStyle.ranges.some(range => ['prayer-cue', 'long-cue'].includes(range.kind)));
assert.ok(contains(prose, proseStyle, 'initial', 'М'));
const titledPrayer = 'Молитва ко Пресвятой Богородице: спаси нас.';
const titledStyle = format(titledPrayer, '', 'Молитва ко Пресвятой Богородице');
assert.ok(contains(titledPrayer, titledStyle, 'prayer-cue', 'Молитва ко Пресвятой Богородице:'));
assert.ok(contains(titledPrayer, titledStyle, 'initial', 'с'));
const mismatchedTitle = format(titledPrayer, '', 'Молитва');
assert.ok(!mismatchedTitle.ranges.some(range => range.kind === 'prayer-cue'));

const longInline = format('к Богородице ныне', 'Тропарь Богородице, глас 4-й:');
assert.equal(longInline.standaloneInlineLabel, true);
assert.ok(contains('к Богородице ныне', longInline, 'initial', 'к'));
assert.equal(format('Господи, помилуй', 'Ирмос:').standaloneInlineLabel, false);

// The shared renderer is permitted to show the classes but must never
// infer canon formatting from generic Cyrillic content or a regex alone.
const canon = read('src/screens/CanonScreen.js');
const reader = read('src/components/reader/selectableDocumentReader/runtime.js');
const styles = read('src/components/reader/selectableDocumentReader/styles.js');
assert.match(canon, /import \{buildCanonTypography\} from '\.\.\/services\/canonTypography'/);
// The parallel Russian translation behaves like prayer-rule translations:
// no red initial/doxology planner, but independent paragraph typography.
assert.match(canon, /const isParallelTranslation = viewMode === MODE_BOTH && language === 'russian'/);
assert.match(canon, /canonTypography: isParallelTranslation\s*\?\s*null\s*:\s*buildCanonTypography\(text \|\| '', inlineLabel \|\| '', section\.heading \|\| ''\)/);
assert.match(canon, /className: isParallelTranslation\s*\?\s*`\$\{className\} canon-parallel-translation`\s*:\s*className/);
assert.match(styles, /\.rule-item\.canon-section \.reader-text\.canon-russian\.canon-parallel-translation\s*\{/);
assert.match(styles, /\.reader-text\.canon-russian\.canon-parallel-translation\s*\{[^}]*color: var\(--secondary\) !important;[^}]*font-size: 16px;[^}]*line-height: 26px/s);
// Single-language Russian/UK readers display hymn rubric labels; parallel
// translations deliberately remain secondary and have no redundant headings.
assert.match(canon, /inlineLabel: viewMode === MODE_RUSSIAN\s*\?\s*getCanonInlineLabel\(displaySection, russian, t\)\s*:\s*''/);
assert.match(canon, /inlineLabel: getCanonInlineLabel\(displaySection, localized, t\)/);
// A missing Russian translation is omitted completely. Do not fall back
// to Slavonic with a visible notification in the RU reading.
assert.ok(!canon.includes('Церковнославянский припев — перевод отсутствует'));
assert.ok(!canon.includes('canon-untranslated-refrain'));
assert.ok(!styles.includes('canon-untranslated-refrain'));
assert.ok(!canon.includes('Перевод пока отсутствует.'));
assert.match(canon, /const unavailableMode =\s*viewMode === MODE_TRADITIONAL/);
// Psalter labels remain brown in both the post-kathisma section header
// and inline prayers (including nested liturgical-word spans).
assert.match(styles, /\.rule-item\.psalter-post-kathisma-part \.section-header \.prayer-title/);
assert.match(styles, /\.reader-text\.psalter-prayer \.psalter-prayer-title \.liturgical-word/);
assert.match(styles, /\.reader-text\.psalter-reading-prayers \.psalter-prayer-title \.liturgical-word/);
assert.match(styles, /\.rule-item\.canon-section \.reader-text\.canon-church,\s*\.rule-item\.canon-section \.reader-text\.canon-russian\s*\{[^}]*text-align: justify !important;[^}]*word-spacing: normal !important;[^}]*-webkit-hyphens: auto;[^}]*hyphens: auto;/s);
assert.match(reader, /itemConfig\?\.sourceType === 'canon'\s*\?\s*itemConfig\.canonTypography\s*:\s*null/);
assert.match(reader, /block\.sourceType === 'canon' && block\.canonTypography\?\.standaloneInlineLabel/);
assert.match(reader, /canonBreakBefore\.has\(start\)/);
assert.match(reader, /span\.classList\.add\('canon-' \+ range\.kind\)/);
for (const token of ['canon-initial', 'canon-long-cue', 'canon-doxology', 'canon-repeat-note', 'canon-short-cue', 'canon-glory-cue', 'canon-prayer-cue']) {
  assert.ok(styles.includes('.rule-item.canon-section .reader-text .'+token),
    'Missing canon-specific CSS: ' + token);
}
for (const name of [
  'src/screens/CanonScreen.js',
  'src/components/reader/selectableDocumentReader/runtime.js',
  'src/components/reader/selectableDocumentReader/styles.js',
  'src/services/canonTypography.js',
]) {
  babel.parse(read(name), {sourceType: 'module', plugins: ['jsx']});
}
console.log('PASS: canon-only text formatting for initials, rubrics, doxology breaks and (Дважды)');
console.log('PASS: parallel RU translation uses secondary prayer style without canon red initials');
console.log('PASS: standalone RU headings and justified canon text; untranslated refrains are omitted');
console.log('PASS: Psalter prayer heading remains brown in both heading and inline renderers');
console.log('PASS: original text, UTF-16 selection offsets and other reader scopes are protected');
console.log('PASS: four edited/new modules parse via Babel');
