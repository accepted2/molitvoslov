#!/usr/bin/env node
// Read-only regressions: Favorites shows the source font, never guesses it
// from Church Slavonic accents or historic Cyrillic glyphs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/parser');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

const filenames = [
  'src/services/savedTextTypography.js',
  'src/screens/FavoritesScreen.js',
  'src/components/reader/CalendarSaveText.js',
  'src/screens/ChurchCalendarScreen.js',
  'src/screens/SaintDetailScreen.js',
  'src/components/reader/SelectableDocumentReader.js',
  'src/components/reader/SelectableSaveText.js',
  'src/components/reader/PrayerRuleReader.js',
];
for (const name of filenames) {
  const filename = path.join(root, name);
  const ast = babel.parse(read(name), {sourceType: 'module', plugins: ['jsx']});
  for (const declaration of ast.program.body) {
    if (declaration.type !== 'ImportDeclaration' ||
        !declaration.source.value.startsWith('.')) continue;
    const file = path.resolve(path.dirname(filename), declaration.source.value);
    assert.ok(['', '.js', '.jsx', '/index.js'].some(ext => fs.existsSync(file + ext)),
      'Broken import ' + declaration.source.value + ' in ' + name);
  }
}
console.log('PASS: eight changed source modules parse and their imports resolve');

const helper = read('src/services/savedTextTypography.js')
  .replace('export const savedTextFontFamily =', 'const savedTextFontFamily =');
const font = new Function(helper + '\nreturn savedTextFontFamily;')();
const accentedCivil = '«О́тче Еди́норо́дне Бо́г Сло́во, прише́дше к нам»';
const historicalCivil = '«Я́ко Госпо́день ученик, восприял еси»';
assert.equal(font({source_type: 'calendar', text: accentedCivil, metadata: {section: 'kontakion'}}),
  'serif', 'Legacy calendar text with accents is not evidence of Ponomar');
assert.equal(font({source_type: 'calendar', text: historicalCivil, metadata: {section: 'troparion'}}),
  'serif', 'Legacy troparion should keep regular font');
assert.equal(font({source_type: 'prayer_rule', text: accentedCivil, metadata: {language: 'church'}}),
  'serif', 'Ordinary CS reader is civil serif');
assert.equal(font({source_type: 'psalter', text: accentedCivil, metadata: {language: 'traditional'}}),
  'Ponomar', 'Traditional CS reader must retain Ponomar');
assert.equal(font({text: 'Господи помилуй', metadata: {font_family: 'Ponomar'}}),
  'Ponomar', 'Explicit original Ponomar wins even without accents');
assert.equal(font({text: historicalCivil, metadata: {font_family: 'serif', language: 'traditional'}}),
  'serif', 'Recorded font wins over language');
assert.equal(font({text: 'Текст', metadata: {font_family: 'Georgia'}}),
  'serif', 'Explicit non-Ponomar font stays civil');
assert.equal(font({text: historicalCivil, metadata: {text_language: 'traditional'}}),
  'Ponomar', 'Legacy traditional mode still works');
console.log('PASS: 8 font cases, including old accented troparia and traditional prayer');

const favorites = read('src/screens/FavoritesScreen.js');
assert.doesNotMatch(favorites, /CHURCH_SCRIPT_PATTERN|isChurchPreview/);
assert.match(favorites, /savedTextFontFamily\(item\) === 'Ponomar'/);
assert.match(favorites, /isPonomarPreview\(item\) && ponomarLoaded && styles\.quoteChurch/);

const calendar = read('src/components/reader/CalendarSaveText.js');
assert.match(calendar, /makeCalendarSaveContext = \(\{[^}]*fontFamily = 'serif'/);
assert.match(calendar, /font_family: String\(fontFamily \|\| 'serif'\)/);
for (const name of ['src/screens/ChurchCalendarScreen.js', 'src/screens/SaintDetailScreen.js']) {
  assert.match(read(name), /fontFamily: styles\.(?:textBlockParagraph|body)\.fontFamily/);
}
assert.match(read('src/components/reader/SelectableDocumentReader.js'), /font_family:\s*\n\s*itemConfig\.metadata\?\.font_family/);
assert.match(read('src/components/reader/SelectableSaveText.js'), /flattenedStyle\.fontFamily/);
assert.match(read('src/components/reader/PrayerRuleReader.js'), /font_family: message\.language === 'traditional' \? 'Ponomar' : 'serif'/);
console.log('PASS: native, WebView and calendar save paths persist original source font');
