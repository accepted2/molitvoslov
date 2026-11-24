#!/usr/bin/env node
'use strict';
// Run from molitvoslov-app: node tools/audit_hours_typography.js
// Read-only diagnostic of the actual locally imported hoursTexts.json.
const fs = require('node:fs');
const path = require('node:path');
const data = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../src/data/hoursTexts.json'), 'utf8'
));
const source = fs.readFileSync(
  path.join(__dirname, '../src/services/hoursTypography.js'), 'utf8'
).replace(/\bexport const /g, 'const ');
const {classifyHoursRow, classifyHoursSection} = new Function(
  source + '\nreturn {classifyHoursRow, classifyHoursSection};'
)();
const entries = data.entries || {};
let rows = 0, sections = 0, church = 0, russian = 0;
const suspicious = [];
const kinds = {};
for (const [id, item] of Object.entries(entries)) {
  for (const [sectionIndex, section] of (item.sections || []).entries()) {
    sections++;
    const sectionKind = classifyHoursSection(section.title || '');
    if (!Array.isArray(section.rows) || !section.rows.length) {
      suspicious.push(id + ': empty section ' + sectionIndex);
      continue;
    }
    for (const [rowIndex, row] of section.rows.entries()) {
      rows++;
      for (const lang of ['church', 'russian']) {
        const text = String(row?.[lang] || '');
        if (text.trim()) lang === 'church' ? church++ : russian++;
        if (!text.trim()) continue;
        const kind = classifyHoursRow({text, sectionKind});
        kinds[kind] = (kinds[kind] || 0) + 1;
        const prefix = id + '/' + (sectionIndex + 1) + '/' + (rowIndex + 1) + '/' + lang;
        if (/<\/?(?:div|p|span|table|td|h[1-6])\b/i.test(text)) {
          suspicious.push(prefix + ': HTML tag');
        }
        if (/^(?:церковнославянский|русский|пожертвовать|библиотека|азбука веры)\b/i.test(text)) {
          suspicious.push(prefix + ': possible site chrome');
        }
        if (/\b(?:undefined|null|NaN)\b/.test(text)) {
          suspicious.push(prefix + ': invalid token');
        }
      }
    }
  }
}
console.log('Hours local text audit');
console.log('Service entries:', Object.keys(entries).length, '/ 25');
console.log('Sections:', sections, 'Rows:', rows, 'ЦС populated:', church, 'РУС populated:', russian);
console.log('Block kinds:', JSON.stringify(kinds, null, 2));
console.log('Review flags:', suspicious.length);
suspicious.slice(0, 30).forEach(value => console.log('  -', value));
console.log('Audit is read-only: hoursTexts.json was not modified.');
