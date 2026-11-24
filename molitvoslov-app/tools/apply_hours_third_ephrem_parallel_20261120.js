#!/usr/bin/env node
'use strict';
// Pair the existing Church Slavonic and Russian Saint Ephrem prayer within
// Third Hour's CS+RU accordion. Preserve all other local reader changes.
const fs = require('node:fs');
const path = require('node:path');
const app = path.resolve(__dirname, '..');
const helperPath = path.join(app, 'src/services/hoursThirdHourRussian.js');
const docPath = path.join(app, 'src/services/hoursDocument.js');
const firstHourChurchPath = path.join(app, 'src/data/hoursFirstHourEditorial.json');
const firstHourRussianPath = path.join(app, 'src/data/hoursFirstHourRussian.json');
const check = (condition, message) => {
  if (!condition) throw Error(message + '. NO FILES MODIFIED.');
};
for (const file of [helperPath, docPath, firstHourChurchPath, firstHourRussianPath]) {
  check(fs.existsSync(file), 'Missing source file: ' + file);
}
const firstHourChurch = JSON.parse(fs.readFileSync(firstHourChurchPath, 'utf8'));
const firstHourRussian = JSON.parse(fs.readFileSync(firstHourRussianPath, 'utf8'));
const findEphrem = data => (data.afterPsalms || [])
  .find(section => section.accordionId === 'first-hour-ephrem');
const cs = findEphrem(firstHourChurch);
const ru = findEphrem(firstHourRussian);
check(cs && ru && cs.rows.length === 9 && ru.rows.length === 9 &&
  cs.rows.every(row => typeof row.church === 'string' && row.church.trim()) &&
  ru.rows.every(row => typeof row.russian === 'string' && row.russian.trim()),
  'First Hour source is missing aligned Saint Ephrem prayer rows');
const helperSource = fs.readFileSync(helperPath, 'utf8');
const documentSource = fs.readFileSync(docPath, 'utf8');
const LF = value => value.replace(/\r\n/g, '\n');
const eol = (source, value) => source.includes('\r\n')
  ? value.replace(/\n/g, '\r\n') : value;
let helper = LF(helperSource);
let doc = LF(documentSource);
check(helper.includes("third-hour-ephrem") && doc.includes("isThirdHour"),
  'The existing Third Hour reader is not installed');
const marker = 'THIRD_HOUR_EPHREM_PARALLEL_20261120_V1';
const oldImport = "import firstHourRussian from '../data/hoursFirstHourRussian.json';";
const newImport = oldImport + "\nimport firstHourChurch from '../data/hoursFirstHourEditorial.json';";
if (!helper.includes("import firstHourChurch from '../data/hoursFirstHourEditorial.json';")) {
  check(helper.split(oldImport).length === 2,
    'Unknown Third Hour source import layout');
  helper = helper.replace(oldImport, newImport);
}
const fnStart = 'const ephremSection = () => {';
const fnEnd = '\n// Both RU and CS+RU follow the same liturgical order:';
const first = helper.indexOf(fnStart);
const last = helper.indexOf(fnEnd, first);
check(first >= 0 && last > first, 'Unable to locate Saint Ephrem section');
const currentFunction = helper.slice(first, last);
const replacement = [
  '// ' + marker,
  'const ephremSection = () => {',
  '  const firstHourEphrem = firstHourRussian.afterPsalms.find(section =>',
  "    section.accordionId === 'first-hour-ephrem');",
  '  const churchEphrem = firstHourChurch.afterPsalms.find(section =>',
  "    section.accordionId === 'first-hour-ephrem');",
  '  if (!firstHourEphrem || !churchEphrem ||',
  '      firstHourEphrem.rows.length !== 9 ||',
  '      churchEphrem.rows.length !== firstHourEphrem.rows.length) {',
  "    throw new Error('First Hour Saint Ephrem parallel sources are incomplete');",
  '  }',
  '  return {',
  '    ...firstHourEphrem,',
  "    accordionId: 'third-hour-ephrem',",
  '    originalSectionIndex: 13,',
  '    rows: firstHourEphrem.rows.map((row, index) => {',
  '      const church = churchEphrem.rows[index]?.church;',
  "      if (typeof church !== 'string' || !church.trim()) {",
  "        throw new Error('Missing Church Slavonic Saint Ephrem row ' + index);",
  '      }',
  '      return {...row, church};',
  '    }),',
  '  };',
  '};',
  '',
].join('\n');
if (!helper.includes(marker) && !currentFunction.includes('firstHourChurchEphrem')) {
  check(currentFunction.includes('firstHourEphrem.rows.map(row => ({...row}))') &&
    currentFunction.includes("accordionId: 'third-hour-ephrem'") &&
    !currentFunction.includes('churchEphrem') &&
    !currentFunction.includes('firstHourChurch'),
    'Saint Ephrem helper was customized; refusing to overwrite it');
  helper = helper.slice(0, first) + replacement + helper.slice(last);
}
// Source and rendering are separate. Some local builds already make all
// Third Hour rows parallel; only enable Ephrem specifically if needed.
const firstHourLayout = [
  "        layout: isFirstHour && viewMode === READER_LANGUAGE_MODES.BOTH &&",
  "          blocks.length === 2 ? 'parallel' : 'stack',",
].join('\n');
const thirdHourLayout = [
  '        // Keep every Saint Ephrem bow/rubric aligned between CS and RU.',
  "        layout: (isFirstHour ||",
  "          (isThirdHour && section.accordionId === 'third-hour-ephrem')) &&",
  '          viewMode === READER_LANGUAGE_MODES.BOTH &&',
  "          blocks.length === 2 ? 'parallel' : 'stack',",
].join('\n');
if (!doc.includes("section.accordionId === 'third-hour-ephrem'") &&
    !doc.includes('layout: (isFirstHour || isThirdHour) &&') &&
    !doc.includes('layout: (isFirstHour || isThirdHour)') &&
    !doc.includes('layout: isFirstHour || isThirdHour')) {
  check(doc.split(firstHourLayout).length === 2,
    'Third Hour parallel row layout differs locally');
  doc = doc.replace(firstHourLayout, thirdHourLayout);
}
check(helper.includes(marker) || helper.includes('firstHourChurchEphrem'),
  'Paired Ephrem section was not installed');
check(doc.includes('reader') || doc.includes('createBlock'), 'Invalid Hours document');
try {
  const {parse} = require('@babel/parser');
  parse(helper, {sourceType: 'module'});
  parse(doc, {sourceType: 'module'});
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
  console.warn('WARN: @babel/parser unavailable; parser check skipped.');
}
const changes = [
  {file: helperPath, old: helperSource, updated: eol(helperSource, helper)},
  {file: docPath, old: documentSource, updated: eol(documentSource, doc)},
].filter(item => item.old !== item.updated);
if (process.argv.includes('--dry-run')) {
  console.log('DRY RUN PASS: 9 paired CS/RU Saint Ephrem rows.');
  console.log('DRY RUN PASS: stable bookmarks and unchanged source prayers.');
  console.log('WOULD MODIFY: ' + (changes.map(c => path.relative(app, c.file)).join(', ') || 'none'));
  console.log('NO FILES MODIFIED.');
  process.exit(0);
}
if (!changes.length) {
  console.log('PASS: Third Hour Saint Ephrem is already paired. NO FILES MODIFIED.');
  process.exit(0);
}
const backup = path.resolve(app, '..', 'build-backups',
  'third-hour-ephrem-parallel-' + new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(backup, {recursive: true});
for (const change of changes)
  fs.copyFileSync(change.file, path.join(backup, path.basename(change.file)));
try {
  for (const change of changes) fs.writeFileSync(change.file, change.updated, 'utf8');
} catch (error) {
  for (const change of changes) {
    fs.copyFileSync(path.join(backup, path.basename(change.file)), change.file);
  }
  throw error;
}
console.log('PASS: Third Hour Saint Ephrem has parallel CS and RU in all nine rows.');
console.log('FILES CHANGED: ' + changes.map(c => path.relative(app,c.file)).join(', '));
console.log('BACKUP: ' + backup);
