// Patch only the Russian translation strings of one canon in offlineContent.json.
// No bulk re-export: preserve every other character, JSON key and local customisation.
const fs = require('fs');
const path = require('path');

const TAG = 'PENITENTIAL_CANON_RU_OFFLINE_20261117';
const sourcePath = path.resolve(__dirname, '../../molitvoslov-backend/api/data/canon_pokayan_ko_gospodu_ru_20261117.txt');
const offlinePath = path.resolve(__dirname, '../src/data/offlineContent.json');
const slugArg = process.argv.find(arg => arg.startsWith('--slug='))?.slice(7) || null;
const replaceExisting = process.argv.includes('--replace-existing');
const apply = process.argv.includes('--apply');

const KINDS = {
  'Ирмос': 'irmos', 'Припев': 'refrain', 'Тропарь': 'troparion',
  'Слава': 'glory', 'И ныне': 'now', 'Слава и ныне': 'glory_now',
  'Богородичен': 'theotokion', 'Седален': 'sedalen',
  'Кондак': 'kontakion', 'Икос': 'ikos', 'Молитва': 'prayer',
};
const GROUPS = [
  'Песнь 1', 'Песнь 3', 'Седален, глас 6-й', 'Песнь 4',
  'Песнь 5', 'Песнь 6', 'Кондак', 'Икос', 'Песнь 7',
  'Песнь 8', 'Песнь 9', 'Молитва',
];
const EXPECTED_COUNTS = [9, 9, 3, 9, 9, 9, 1, 1, 9, 7, 9, 1];

function parseSource(raw) {
  const lines = raw.split(/\r?\n/);
  const counts = {};
  const groups = [];
  const entries = [];
  let group = null;
  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('# ') && !line.startsWith('## ')) return;
    if (line.startsWith('## ')) {
      group = line.slice(3).trim();
      if (groups.includes(group)) throw Error('Повтор заголовка: ' + group);
      groups.push(group);
      counts[group] = 0;
      return;
    }
    const match = line.match(/^(?:\[([^\]]+)\]|\*\*([^*]+):\*\*)\s*(.+)$/);
    if (!match || !group) throw Error('Некорректный исходник, строка ' + (index + 1));
    const kind = KINDS[(match[1] || match[2]).trim()];
    if (!kind || !match[3].trim()) throw Error('Неизвестная рубрика, строка ' + (index + 1));
    const ode = /^Песнь ([1-9])$/.exec(group);
    entries.push({group, kind, ode: ode ? Number(ode[1]) : null, value: match[3].trim(), line: index + 1});
    counts[group] += 1;
  });
  if (groups.join('|') !== GROUPS.join('|') ||
      GROUPS.some((name, i) => counts[name] !== EXPECTED_COUNTS[i]) ||
      entries.length !== 76) {
    throw Error('Неверная структура русского текста: ' + JSON.stringify(counts));
  }
  return entries;
}

function findClose(raw, openIndex, open, close) {
  let nesting = 0, inside = false, escaped = false;
  for (let i = openIndex; i < raw.length; i++) {
    const c = raw[i];
    if (inside) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inside = false;
      continue;
    }
    if (c === '"') { inside = true; continue; }
    if (c === open) nesting++;
    if (c === close) {
      nesting--;
      if (!nesting) return i;
    }
  }
  throw Error('Незакрытый JSON-объект.');
}

function main() {
  if (!fs.existsSync(sourcePath)) throw Error('Не найден русский файл: ' + sourcePath);
  if (!fs.existsSync(offlinePath)) throw Error('Не найден офлайн-контент: ' + offlinePath);
  const entries = parseSource(fs.readFileSync(sourcePath, 'utf8').replace(/^\uFEFF/, ''));
  const raw = fs.readFileSync(offlinePath, 'utf8');
  const data = JSON.parse(raw);
  const candidates = Object.values(data.canons?.by_slug || {}).filter(item =>
    /покаян/i.test(item.title || '') && /иисус/i.test(item.title || '')
  );
  const target = slugArg ? data.canons?.by_slug?.[slugArg] :
    (candidates.length === 1 ? candidates[0] : null);
  if (!target) throw Error('Не удалось однозначно найти канон. Кандидаты: ' +
    JSON.stringify(candidates.map(item => ({slug: item.slug, title: item.title}))) +
    '. При необходимости укажите --slug=...');
  const variants = (target.sections || []).map(s => Number(s.variant || 1));
  const primary = Math.min(...variants);
  const sections = target.sections.filter(s => Number(s.variant || 1) === primary)
    .sort((a,b) => Number(a.order) - Number(b.order));
  const errors = [];
  if (sections.length !== entries.length) {
    errors.push('ЦС-секций: ' + sections.length + ', русских строк: ' + entries.length);
  }
  for (let i = 0; i < Math.min(sections.length, entries.length); i++) {
    const s = sections[i], e = entries[i];
    const okType = s.section_type === e.kind ||
      e.kind === 'glory_now' && ['glory', 'now'].includes(s.section_type);
    if (!okType || (e.ode != null && Number(s.ode_number) !== e.ode)) {
      errors.push('#' + (i+1) + ' ' + e.group + '/' + e.kind +
        ' vs ' + String(s.ode_number) + '/' + s.section_type +
        ', ЦС=' + String(s.text?.content || '').slice(0,45));
    }
  }
  if (errors.length) throw Error('Сопоставление не прошло проверку:\n' + errors.slice(0,25).join('\n'));
  if (new Set(sections.map(s => s.text?.id)).size !== sections.length)
    throw Error('Одинаковый Text используется несколько раз: обновление остановлено.');
  const conflict = sections.map((s,i)=>({s,e:entries[i]})).filter(
    ({s,e}) => String(s.text?.translation || '').trim() &&
      s.text.translation.trim() !== e.value
  );
  if (conflict.length && !replaceExisting) {
    throw Error('Отличающиеся русские переводы уже существуют в ' + conflict.length +
      ' строках. Осознанная замена: --replace-existing.');
  }
  const modified = sections.filter((s,i) => s.text.translation !== entries[i].value).length;
  console.log(TAG, 'Канон:', target.title, '|', target.slug);
  console.log('Совпадение разметки:', sections.length + '/76, вариант ' + primary);
  console.log('Изменений:', modified, '| прежние отличающиеся:', conflict.length);
  if (!apply) {
    console.log('Проверка завершена. Для записи добавьте --apply.');
    return;
  }

  // Update only the string values inside this canon's sections; leave the
  // large offlineContent.json serialization entirely untouched.
  const canonPos = raw.indexOf('"canons"');
  const bySlugPos = raw.indexOf('"by_slug"', canonPos);
  if (canonPos < 0 || bySlugPos < 0) throw Error('Нет canons.by_slug в JSON.');
  const key = JSON.stringify(target.slug);
  const keyPos = raw.indexOf(key, bySlugPos);
  if (keyPos < 0) throw Error('Ключ канона не найден в JSON.');
  const colonPos = raw.indexOf(':', keyPos + key.length);
  const objectStart = raw.indexOf('{', colonPos);
  const objectEnd = findClose(raw, objectStart, '{', '}');
  const chunk = raw.slice(objectStart, objectEnd + 1);
  const embedded = JSON.parse(chunk);
  if (embedded.slug !== target.slug) throw Error('Неверный объект канона.');
  const sectionKey = chunk.indexOf('"sections"');
  const arrayStart = chunk.indexOf('[', sectionKey);
  const arrayEnd = findClose(chunk, arrayStart, '[', ']');
  if (sectionKey < 0 || arrayStart < 0) throw Error('Нет sections в каноне.');
  const sectionText = chunk.slice(arrayStart, arrayEnd + 1);
  const translationPattern = /("translation"\s*:\s*)("(?:\\.|[^"\\])*")/g;
  const positions = Array.from(sectionText.matchAll(translationPattern));
  if (positions.length !== target.sections.length) {
    throw Error('Найдено translation-полей ' + positions.length +
      ', секций ' + target.sections.length + '. Офлайн-файл не изменён.');
  }
  // Match original section indexes, since the parsed sections may be sorted.
  const originalSections = target.sections;
  const newValuesByIndex = new Map();
  sections.forEach((section,i) => {
    const originalIndex = originalSections.findIndex(s => Number(s.id) === Number(section.id));
    if (originalIndex < 0 || newValuesByIndex.has(originalIndex)) throw Error('Неверный ID секции.');
    newValuesByIndex.set(originalIndex, entries[i].value);
  });
  let index = -1;
  const updatedSectionText = sectionText.replace(translationPattern, (full, prefix, value) => {
    index += 1;
    return newValuesByIndex.has(index) ? prefix + JSON.stringify(newValuesByIndex.get(index)) : full;
  });
  const patched = raw.slice(0, objectStart + arrayStart) + updatedSectionText +
    raw.slice(objectStart + arrayEnd + 1);
  const result = JSON.parse(patched);
  const after = result.canons.by_slug[target.slug];
  if (sections.some((section,i) => {
    const candidate = after.sections.find(s => Number(s.id) === Number(section.id));
    return candidate?.text?.translation !== entries[i].value;
  })) throw Error('Итоговая JSON-проверка не пройдена. Офлайн-файл не изменён.');
  if (modified === 0) {
    console.log('Все строки уже заполнены. Запись не требуется.');
    return;
  }
  const dest = path.resolve(__dirname, '../reports');
  fs.mkdirSync(dest, {recursive:true});
  const backup = path.join(dest,'offlineContent-before-penitential-ru-' +
    new Date().toISOString().replace(/[:.]/g,'-') + '.json');
  fs.copyFileSync(offlinePath, backup);
  fs.writeFileSync(offlinePath, patched, 'utf8');
  console.log('ГОТОВО: офлайн-канон обновлён. ЦС и остальные разделы не изменены.');
  console.log('Резервная копия:', backup);
}

try { main(); } catch (error) { console.error('ERROR:', error.message); process.exitCode = 1; }
