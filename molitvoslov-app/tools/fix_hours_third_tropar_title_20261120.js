#!/usr/bin/env node
'use strict';

// Local correction for Third Hour ONLY, following the previous typography installer.
// Move the existing accent presentation from the "Glory to the Father" line
// to the "Troparion of the day" caption. Never touch other reader components.
// Run with --dry-run to validate before writing.

const fs = require('node:fs');
const path = require('node:path');
const app = path.resolve(__dirname, '..');
const dataFiles = [
  {
    name: 'RU',
    file: path.join(app, 'src/data/hoursThirdHourRussian.json'),
    textField: 'russian',
    presentationField: 'presentation',
    glory: 'Слава Отцу, и Сыну, и Святому Духу:',
    caption: 'Тропарь дня',
  },
  {
    name: 'ЦС традиц.',
    file: path.join(app, 'src/data/hoursThirdHourTraditional.json'),
    textField: 'traditional',
    presentationField: 'traditionalPresentation',
    glory: 'Сла́ва Ѻ҆ц҃ꙋ̀, и҆ Сн҃ꙋ, и҆ Ст҃о́мꙋ Дх҃ꙋ:',
    caption: 'Тропа́рь днѧ̀',
  },
];

const docPath = path.join(app, 'src/services/hoursDocument.js');
const cssPath = path.join(
  app, 'src/components/reader/selectableDocumentReader/styles.js',
);
const requireCondition = (condition, message) => {
  if (!condition) throw Error(message + '. NO FILES MODIFIED.');
};

requireCondition(
  fs.existsSync(docPath) && fs.existsSync(cssPath),
  'Hours reader components missing',
);
const doc = fs.readFileSync(docPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
requireCondition(
  doc.includes("'tropar-intro'") && css.includes('hours-presentation-tropar-intro'),
  'Existing Third Hour tropar accent styles not installed',
);

const changes = dataFiles.map((spec) => {
  requireCondition(fs.existsSync(spec.file), spec.name + ' source not found');
  const original = fs.readFileSync(spec.file, 'utf8');
  const value = JSON.parse(original.replace(/^\uFEFF/u, ''));
  requireCondition(
    value.entryId === 'ordinary-3' &&
      value.sections?.length === 13 &&
      value.sections[6].rows?.length >= 2,
    'Unexpected Third Hour source structure in ' + spec.name,
  );

  const glory = value.sections[6].rows[0];
  const caption = value.sections[6].rows[1];
  requireCondition(
    glory[spec.textField] === spec.glory &&
      caption[spec.textField] === spec.caption,
    'Unexpected Third Hour text in ' + spec.name,
  );
  requireCondition(
    glory[spec.presentationField] == null ||
      glory[spec.presentationField] === 'tropar-intro',
    'Unexpected style assigned to doxology in ' + spec.name,
  );
  requireCondition(
    caption[spec.presentationField] == null ||
      caption[spec.presentationField] === 'tropar-intro',
    'Unexpected style assigned to caption in ' + spec.name,
  );

  delete glory[spec.presentationField];
  caption[spec.presentationField] = 'tropar-intro';

  // Check only the presentation placement changes. Prayer strings are untouched.
  const newline = original.includes('\r\n') ? '\r\n' : '\n';
  const content = (original.startsWith('\uFEFF') ? '\uFEFF' : '') +
    JSON.stringify(value, null, 2).replace(/\n/gu, newline) + newline;
  return { ...spec, original, content };
});
const modified = changes.filter((change) => change.original !== change.content);

if (process.argv.includes('--dry-run')) {
  console.log('DRY RUN PASS: Glory red, Troparion of the day accent-brown/bold.');
  console.log('WOULD MODIFY:', modified.map(c => c.name).join(', ') || 'none');
  console.log('NO FILES MODIFIED.');
  process.exit(0);
}
if (!modified.length) {
  console.log('PASS: Third Hour tropar title fix already present. NO FILES MODIFIED.');
  process.exit(0);
}

const backupDir = path.resolve(
  app, '..', 'build-backups',
  'third-hour-tropar-title-' + new Date().toISOString().replace(/[:.]/g, '-'),
);
fs.mkdirSync(backupDir, {recursive: true});
for (const change of modified) {
  fs.copyFileSync(change.file, path.join(backupDir, path.basename(change.file)));
}
try {
  for (const change of modified) {
    fs.writeFileSync(change.file, change.content, 'utf8');
  }
} catch (error) {
  for (const change of modified) {
    fs.copyFileSync(
      path.join(backupDir, path.basename(change.file)), change.file,
    );
  }
  throw error;
}
console.log('PASS: Third Hour RU and traditional tropar title style corrected.');
console.log('Glory -> liturgical red; Troparion caption -> accent-brown/bold.');
console.log('FILES CHANGED:', modified.map(c => path.relative(app, c.file)).join(', '));
console.log('BACKUP:', backupDir);
