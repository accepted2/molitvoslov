// Production reader cleanup: conservative Django source-cleaning rules.
// Ported from api/calendar_text_cleanup.py, audit/calendar-text-cleanup-20261123.
// No network calls, no persistent writes, no import/migration side effects.
// Only remove isolated source page headers/footers, not narrative content.
const INVISIBLES = /[\u200b\u00ad\ufeff\u2060]/g;
const NAV = '(?:Акафист|Акафіст|Тропарь|Тропар|Кондак|Служба в Минее|Служба в Мінеї)';
const NAV_ROW = new RegExp('^\\s*' + NAV + '(?:\\s*[·•|]\\s*' + NAV + ')+\\s*$', 'i');
const MONTH = '(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря|січня|лютого|березня|квітня|травня|червня|липня|серпня|вересня|жовтня|листопада|грудня)';
const DATE_ROW = new RegExp('^\\s*\\d{1,2}\\s+' + MONTH + '[^\\n]{0,175}(?:по\\s+ст\\.\\s*ст\\.|за\\s+ст\\.\\s*ст\\.)\\s*$', 'i');
const OLD_DATE_ROW = /^\s*(?:Месяца|Місяця|Мiсяця)\s+[^\n]{0,150}(?:в\s+\d{1,2}[-–]?[а-яіїєґ]*\s+день\.?|(?:на|у)\s+\d{1,2}[-–]?[а-яіїєґ]*\s+день(?:[^\n]*)?)\s*$/i;
const OTHER_SAINTS = new RegExp('^\\s*(?:Інші святі|Другие святые)(?:\\s+\\d{1,2}\\s+' + MONTH + ')?\\s*$', 'i');
const BLOCK_BREAK = /\n\s*\n+/;

export const cleanCalendarSourceFieldPreview = (field, value) => {
  if (typeof value !== 'string' || !value) return value;
  const clean = value.replace(INVISIBLES, '');
  if (!field.startsWith('life_content')) return clean;
  let blocks = clean.split(BLOCK_BREAK);
  let count = 0;
  while (count < blocks.length) {
    const block = blocks[count].trim();
    if (!NAV_ROW.test(block) && !DATE_ROW.test(block) && !OLD_DATE_ROW.test(block)) break;
    count += 1;
  }
  if (count) blocks = blocks.slice(count);
  let footerIndex = -1;
  for (let i = 0; i < blocks.length; i += 1) {
    if (OTHER_SAINTS.test(blocks[i].trim()) &&
        blocks.slice(0, i).join('\n\n').trim().length >= 35) {
      footerIndex = i;
      break;
    }
  }
  if (footerIndex !== -1) blocks = blocks.slice(0, footerIndex);
  if (count || footerIndex !== -1) {
    const candidate = blocks.join('\n\n').trim();
    if (candidate.length < 30 ||
        (value.length > 150 && candidate.length < Math.min(80, value.length * 0.08))) {
      return clean;
    }
    return candidate;
  }
  return clean;
};

const FIELDS = [
  'life_content', 'life_content_uk',
  'troparion_content', 'troparion_content_uk',
  'kontakion_content', 'kontakion_content_uk',
  'prayer_content', 'prayer_content_uk',
  'magnification_content', 'magnification_content_uk',
  ...['troparion', 'kontakion'].flatMap(kind =>
    ['', '_alt'].flatMap(variant =>
      ['title', 'content'].flatMap(field =>
        ['', '_uk'].map(lang => kind + variant + '_' + field + lang)))),
];

export const previewCleanCalendarFeast = (source) => {
  if (!source || typeof source !== 'object') return source;
  const result = {...source};
  const protectedFields = new Set([
    ...(source.manually_edited_fields || []),
    ...(source.protected_hymn_fields || []),
  ]);
  for (const field of new Set(FIELDS)) {
    if (!protectedFields.has(field) && typeof source[field] === 'string') {
      result[field] = cleanCalendarSourceFieldPreview(field, source[field]);
    }
  }
  return result;
};

export const countPreviewChanges = (before, after, language = 'ru') => {
  const suffix = language === 'uk' ? '_uk' : '';
  const keys = ['life_content', 'troparion_content', 'kontakion_content',
    'prayer_content', 'magnification_content'].map((key) =>
    suffix && before?.[key + suffix] ? key + suffix : key);
  let fields = 0;
  let removed = 0;
  for (const key of keys) {
    const left = before?.[key] || '';
    const right = after?.[key] || '';
    if (left !== right) {
      fields += 1;
      removed += Math.max(0, left.length - right.length);
    }
  }
  return {fields, removed};
};
