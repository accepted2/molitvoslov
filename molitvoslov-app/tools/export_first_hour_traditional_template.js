#!/usr/bin/env node
'use strict';
// Экспорт полного первого часа из ЛОКАЛЬНЫХ текстов (включая псалмы).
// Записывает только reports/hours; никогда не меняет src/data.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const readJSON = name => JSON.parse(read(name));
const outputDir = path.join(root, 'reports', 'hours');
const fields = ['presentation', 'accentPrefix', 'redInitial',
  'dividerAfter', 'compactAfter', 'preserveLineBreaks'];
const sectionFields = ['title', 'kind', 'collapsible', 'accordionId',
  'noBottomDivider', 'dividerBefore'];

const getEditedFirstHour = (editorial) => {
  const code = read('src/services/hoursFirstHourEditorial.js')
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*/gm, '')
    .replace(/\bexport const /g, 'const ');
  return new Function('editedFirstHour',
    code + '\nreturn getEditedFirstHour;')(editorial);
};

const sectionKey = (section, position, total) => {
  if (position === 0) return 'opening';
  if (position >= total - 12) {
    return 'after-' + String(position - (total - 12) + 1).padStart(2, '0');
  }
  const match = /(?:псалом|псалм|ѱалом)ъ?[^0-9]*([0-9]{1,3})/iu
    .exec(String(section.title || ''));
  return match
    ? 'psalm-' + String(Number(match[1])).padStart(3, '0')
    : 'psalm-extra-' + String(position).padStart(2, '0');
};

const convert = (section, i, total) => {
  const key = sectionKey(section, i, total);
  const item = {key};
  for (const field of sectionFields) {
    if (section[field] !== undefined) item[field] = section[field];
  }
  item.traditionalTitle = '';
  item.rows = (section.rows || []).map((source, j) => {
    if (typeof source.church !== 'string' || !source.church.trim()) {
      throw Error('Нет церковнославянского текста: ' + key + ' строка ' + (j + 1));
    }
    const row = {
      key: key + '/row-' + String(j + 1).padStart(3, '0'),
      church: source.church,
      traditional: '',
    };
    for (const field of fields) {
      if (source[field] !== undefined) row[field] = source[field];
    }
    return row;
  });
  return item;
};

const buildTemplate = (imported, editorial) => {
  const result = getEditedFirstHour(editorial)(imported);
  if (!result.applied) {
    throw Error('Первый час не объединён: ' + result.reason +
      '. Сначала запусти node tools/check_hours_first_hour_local.js');
  }
  const all = result.sections;
  if (all.length < 16 || all[0].kind !== 'opening') {
    throw Error('Неожиданная структура первого часа, экспорт остановлен.');
  }
  const sections = all.map((s, i) => convert(s, i, all.length));
  const psalms = sections.slice(1, -12);
  const keys = new Set(psalms.map(s => s.key));
  for (const number of [5,89,100]) {
    if (!keys.has('psalm-' + String(number).padStart(3, '0'))) {
      throw Error('Не найден псалом ' + number + '. Нельзя создавать неполный экспорт.');
    }
  }
  const afterPsalms = sections.slice(-12);
  const expectedIds = ['first-hour-lent-tropar', 'first-hour-monday',
    'first-hour-wednesday', 'first-hour-saturday', 'first-hour-ephrem'];
  const actualIds = afterPsalms.filter(s => s.collapsible).map(s => s.accordionId);
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
    throw Error('Неверные уставные раскрывающиеся блоки: ' + actualIds.join(','));
  }
  return {
    version: 1,
    entryId: 'ordinary-1',
    sourceLanguage: 'church',
    targetLanguage: 'traditional',
    instructions: 'Заполнять traditional и traditionalTitle. Не изменять key, church, kind, accordionId, presentation, redInitial, dividerAfter, compactAfter и порядок строк.',
    opening: sections[0],
    psalms,
    afterPsalms,
  };
};

const toMarkdown = template => {
  const lines = [
    '# Первый час — текст для церковнославянского традиционного написания',
    '',
    'Ниже реальный церковнославянский текст из локального приложения. ' +
    'Для традиционного написания заполняются поля traditional в JSON.',
    '',
    'Комментарий показывается курсивом; рубрика выделена жирным; ' +
    'строка из трёх дефисов — разделитель; ▼ — раскрывающийся блок.',
    '',
  ];
  for (const section of [
    template.opening, ...template.psalms, ...template.afterPsalms
  ]) {
    const title = section.title || {
      opening: 'Начальные молитвы', postpsalm: 'После псалмов',
      instruction: 'Уставные указания', hymn: 'Тропарь и Богородичен',
      prayer: 'Молитвы', rubric: 'Трисвятое и кондак',
    }[section.kind] || 'Продолжение';
    lines.push('## ' + (section.collapsible ? '▼ ' : '') + title, '');
    lines.push('Ключ: ' + section.key +
      (section.accordionId ? ', dropdown: ' + section.accordionId : ''), '');
    if (section.dividerBefore) lines.push('---', '');
    for (const row of section.rows) {
      const meta = row.presentation === 'comment';
      const rubric = ['placeholder','rubric-label','liturgical-label','liturgical-red']
        .includes(row.presentation);
      lines.push('Ключ строки: ' + row.key, '');
      lines.push(meta ? '> *' + row.church + '*'
        : rubric ? '**' + row.church + '**' : row.church, '');
      if (row.dividerAfter) lines.push('---', '');
    }
  }
  return lines.join('\n') + '\n';
};

const save = (outDir, template) => {
  const json = path.join(outDir, 'first-hour-traditional-template.json');
  const md = path.join(outDir, 'first-hour-traditional-reference.md');
  const existing = [json, md].filter(file => fs.existsSync(file));
  if (existing.length) {
    throw Error('Готовый экспорт уже существует. Перезапись запрещена, чтобы ' +
      'не потерять перевод: ' + existing.join(', '));
  }
  fs.mkdirSync(outDir, {recursive: true});
  fs.writeFileSync(json, JSON.stringify(template, null, 2) + '\n',
    {encoding:'utf8', flag:'wx'});
  fs.writeFileSync(md, toMarkdown(template), {encoding:'utf8', flag:'wx'});
  return {json, md};
};

if (require.main === module) {
  try {
    const imported = readJSON('src/data/hoursTexts.json').entries?.['ordinary-1'];
    if (!imported) throw Error('Нет локального первого часа в hoursTexts.json');
    const editorial = readJSON('src/data/hoursFirstHourEditorial.json');
    const template = buildTemplate(imported, editorial);
    const output = save(process.argv[2] ? path.resolve(process.argv[2]) : outputDir,
      template);
    const parts = [template.opening, ...template.psalms, ...template.afterPsalms];
    console.log('PASS: Первый час — полный экспорт, включая псалмы 5, 89, 100');
    console.log('Секций:', parts.length);
    console.log('Строк для перевода:', parts.reduce((n, s) => n + s.rows.length, 0));
    console.log('Раскрывающихся блоков:',
      template.afterPsalms.filter(s => s.collapsible).length);
    console.log('JSON:', output.json);
    console.log('Читаемый текст:', output.md);
    console.log('Исходные файлы приложения не изменены.');
  } catch (error) {
    console.error('ERROR:', error.message);
    process.exitCode = 1;
  }
}

module.exports = {buildTemplate, toMarkdown, save};
