#!/usr/bin/env node
'use strict';
// Run locally from molitvoslov-app:
// node tools/check_hours_first_hour_local.js
// Read-only: never rewrites hoursTexts.json.
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const source = JSON.parse(read('src/data/hoursTexts.json'));
const edited = JSON.parse(read('src/data/hoursFirstHourEditorial.json'));
const code = read('src/services/hoursFirstHourEditorial.js')
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*/gm, '')
  .replace(/\bexport const /g, 'const ');
const {getEditedFirstHour} = new Function('editedFirstHour',
  code + '\nreturn {getEditedFirstHour};')(edited);

const entries = Object.keys(source.entries || {});
console.log('Импортировано часов:', entries.length, 'из 25');
if (!source.entries?.['ordinary-1']) {
  console.error('Первый час пока отсутствует в hoursTexts.json');
  process.exitCode = 1;
} else {
  const original = source.entries['ordinary-1'];
  const merged = getEditedFirstHour(original);
  console.log('Редакторская версия первого часа:',
    merged.applied ? 'ГОТОВА' : 'НЕ ПРИМЕНИЛАСЬ');
  if (!merged.applied) {
    console.log('Причина:', merged.reason);
    for (const item of merged.detected || []) {
      console.log(' -', item.index + 1,
        String(item.title || '').slice(0, 70), 'псалом:', item.psalm ?? '-');
    }
    process.exitCode = 1;
  } else {
    console.log('Сохранены псалмы:', merged.preservedPsalms.join(', '));
    console.log('Старый хвост после 100-го псалма:',
      merged.removedImportedPostPsalmAppendix
        ? 'отсечён от текста'
        : 'не обнаружен внутри псалма');
    console.log('Раскрывающихся уставных блоков:',
      merged.sections.filter(section => section.collapsible).length);
    console.log('Секции до и после:',
      original.sections?.length || 0, '→', merged.sections.length);
    const countAccents = text =>
      (String(text || '').match(/[\u0300\u0301\u0340\u0341\u0483-\u0489]/gu) || []).length;
    const originalChurch = (original.sections || [])
      .flatMap(section => section.rows || []).map(row => row.church || '').join(' ');
    const editedChurch = merged.sections
      .flatMap(section => section.rows || []).map(row => row.church || '').join(' ');
    console.log('Знаки ударения в первом часе (ЦС):',
      countAccents(originalChurch), '→', countAccents(editedChurch));
    console.log('Это не проверка полноты ударений в псалмах и остальных часах.');
  }
}
