#!/usr/bin/env node
// Read-only UI regression: heading/translation/rubric colors and personal
// prayer selection must stay separate from Android's native TextInput editor.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/parser');

const root = path.resolve(__dirname, '..');
const read = pathname => fs.readFileSync(path.join(root, pathname), 'utf8');

const app = read('src/services/scopedReaderAppearance.js');
const code = (
  app.slice(app.indexOf('export const READER_PALETTES'), app.indexOf('const ownerScope')) +
  '\n' + app.slice(app.indexOf('export const applyReaderAppearance'))
).replace(/export const /g, 'const ') +
  '\nmodule.exports = {applyReaderAppearance, resolveReaderAppearance};';
const sandbox = {module: {exports: {}}};
vm.runInNewContext(code, sandbox);
const {applyReaderAppearance} = sandbox.module.exports;

function getCss(palette, rule = false) {
  let expression = null;
  applyReaderAppearance({injectJavaScript(value) {expression = value;}}, palette, rule);
  assert.ok(expression);
  const vars = {};
  let style;
  const document = {
    documentElement: {style: {setProperty(name, value) {vars[name] = value;}}},
    getElementById() {return style;},
    createElement() {style = {textContent: ''}; return style;},
    head: {appendChild() {}},
  };
  vm.runInNewContext(expression, {document});
  assert.ok(style?.textContent);
  return {vars, css: style.textContent};
}

for (const [palette, dark] of [
  [{palette: 'parchment'}, false],
  [{palette: 'warm'}, false],
  [{palette: 'night'}, true],
  [{palette: 'custom', customBackground: '#161616', customText: '#E9E3DA'}, true],
]) {
  for (const rule of [false, true]) {
    const {vars, css} = getCss(palette, rule);
    assert.equal(vars['--accent-dark'], dark ? '#D1AE7A' : '#7A4F2D');
    assert.equal(vars['--reader-section-heading'], dark ? '#DFC19A' : '#5A3822');
    assert.equal(vars['--secondary'], dark ? '#D8C7AC' : '#765238');
    assert.equal(vars['--liturgical'], dark ? '#E18A84' : '#9B3B32');
    assert.equal(vars['--psalter-heading-color'], dark ? '#D1AE7A' : '#765238');
    assert.equal(vars['--psalter-translation-color'], vars['--secondary']);
    assert.ok(css.includes('.prayer-title'), 'Prayer headings must be themed');
    assert.ok(css.includes('.section-title'), 'Section headings must be themed');
    assert.ok(css.includes('{color:var(--accent-dark) !important;}'), 'Headings must be brown, not body text');
    assert.ok(css.includes('{color:var(--reader-section-heading) !important;}'), 'Section titles must keep their original darker brown');
    assert.ok(css.includes('{color:var(--secondary) !important;}'), 'RU translations must differ from body');
    assert.ok(css.includes('{color:var(--liturgical) !important;}'), 'Liturgical cues must stay red');
    assert.ok(!css.includes('.reader-inline-label{color:' + vars['--text']),
      'Liturgical inline label must not be flattened to main text');
    if (rule) assert.ok(css.includes('.translation-text{color:var(--secondary) !important;}'));
    else assert.ok(css.includes('.reader-text.secondary'), 'Parallel Russian texts must be secondary');
  }
}
console.log('PASS: morning/evening, general, parallel and Psalter text colors preserved in four themes');

const builder = read('src/services/personalPrayerReadingDocument.js')
  .replace('export const buildPersonalPrayerReadingDocument =', 'const buildPersonalPrayerReadingDocument =') +
  '\nmodule.exports = buildPersonalPrayerReadingDocument;';
const docSandbox = {module: {exports: null}};
vm.runInNewContext(builder, docSandbox);
const create = docSandbox.module.exports;
const book = {title: 'Мои молитвы', description: 'Мой сборник'};
const items = [
  {prayer: {sync_id: 'p1', title: 'Первая', text: 'Господи, помилуй.\n\nАминь.'}},
  {prayer: {sync_id: 'p2', title: 'Вторая', text: 'Благодарю Тебя.'}},
];
const documentData = create({
  book, items, bookSyncId: 'book-1', sourceIdForSync: id => Number(id.slice(-1)),
  savedItems: [],
});
assert.equal(documentData.sections.length, 2);
assert.equal(documentData.sections[0].rows[0].blocks[0].text, items[0].prayer.text);
assert.equal(documentData.sections[0].rows[0].blocks[0].sourceType, 'personal_prayer');
assert.equal(documentData.sections[0].rows[0].blocks[0].sourceId, 1);
assert.equal(documentData.sections[0].rows[0].blocks[0].anchorType, 'personal_prayer');
assert.equal(documentData.sections[0].rows[0].blocks[0].fullSaveType, 'prayer');
assert.equal(documentData.sections[0].rows[0].blocks[0].metadata.prayer_sync_id, 'p1');
assert.equal(documentData.sections[0].rows[0].blocks[0].metadata.book_sync_id, 'book-1');
assert.equal(documentData.sections[1].rows[0].blocks[0].sourceId, 2);
assert.equal(documentData.sections[0].rows[0].blocks[0].id, 1);
assert.equal(documentData.sections[1].rows[0].blocks[0].id, 2);

for (const file of [
  'src/components/reader/PersonalPrayerReadingView.js',
  'src/screens/PrayerBookReaderScreen.js',
  'src/screens/PersonalPrayerEditorScreen.js',
]) babel.parse(read(file), {sourceType: 'module', plugins: ['jsx']});

const screen = read('src/screens/PrayerBookReaderScreen.js');
const personal = read('src/components/reader/PersonalPrayerReadingView.js');
const css = read('src/components/reader/selectableDocumentReader/styles.js');
assert.match(screen, /if \(personalTextOnly\)/);
assert.match(screen, /<PersonalPrayerReadingView/);
assert.doesNotMatch(screen, /<SelectableSaveText/, 'Never use TextInput as a prayer reading selector');
assert.match(screen, /<PsalterPrayer prayer=\{prayer\}/, 'Preserve special Psalm/kathisma layout');
assert.match(personal, /<SelectableDocumentReader/, 'Reuse existing custom word/fragment selector');
assert.match(personal, /getSavedItems\(\{source_type: 'personal_prayer'\}\)/);
assert.match(personal, /savedSourceId\(item.prayer.sync_id\)/);
assert.match(personal, /navigation.navigate\('PersonalPrayerEditor'/);
assert.match(personal, /photoGallery/);
assert.match(personal, /onNativeReadingScroll=\{handleNativeReadingScroll\}/);
assert.match(css, /\.reader-text\.personal-prayer \{/);
console.log('PASS: personal prayer reading uses custom selection; editor and attached photos are preserved');
