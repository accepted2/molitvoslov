// A single display pipeline for every saint/feast in the Molitvoslov calendar.
// Verified data fields win; 210 historical UCS cards have a committed civil
// replacement list. Never render raw broken UCS glyphs or mutate saved data.
import {
  looksLegacyUcs, convertLegacyUcsToCivil, expandTitlos, toCivilLetters,
} from './calendarCivicDecoder';

const corrections = require('../data/calendar/uocCivicHymns210.json');
const OLD_LETTERS = /[ѣѢѡѠѻѺѿѾѧѦѵѴѳѲѯѮѱѰꙋꙊꙗꙖ\u0483\u0486\u0487\u2de0-\u2dff]/u;
const INVISIBLE = /[\u200b\u00ad\ufeff\u2060]/gu;
const TYPES = ['troparion', 'kontakion'];

const norm = value => String(value || '').normalize('NFC')
  .replace(INVISIBLE, '')
  .replace(/\r\n?/gu, '\n')
  .replace(/[ \t]+/gu, ' ')
  .replace(/[ \t]*\n[ \t]*/gu, '\n')
  .trim();
const simpleTitle = value => norm(value).replace(/\s+/gu, ' ').toLocaleLowerCase()
  .replace(/ё/gu, 'е').replace(/\([^)]*(?:\d{3,4}|век|столет)[^)]*\)/gu, '')
  .replace(/[^а-яіїєґa-z0-9]+/gu, ' ').trim();

const indexedId = new Map(), indexedName = new Map(), namesWithConflict = new Set();
for (const item of corrections.entries) {
  if (!indexedId.has(item.card_id)) indexedId.set(item.card_id, []);
  indexedId.get(item.card_id).push(item);
  const title = simpleTitle(item.title_ru);
  if (title) {
    if (!indexedName.has(title)) indexedName.set(title, item.card_id);
    else if (indexedName.get(title) !== item.card_id) namesWithConflict.add(title);
  }
}

const canonicalId = feast =>
  String(feast?.card_id || feast?.blagovist_card_id || feast?.article_key || '').trim();
const correctedRows = feast => {
  const id = canonicalId(feast);
  if (id && indexedId.has(id)) return indexedId.get(id);
  // Do not apply a hymn just because it is on the same calendar day.
  // Title-only fallback requires exact normalized same-person identity.
  const title = simpleTitle(feast?.title_ru || feast?.title || '');
  if (!title || namesWithConflict.has(title)) return [];
  return indexedId.get(indexedName.get(title)) || [];
};

const civilize = (value, script = '') => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const source = norm(value);
  const legacy = looksLegacyUcs(source);
  if (!legacy && !OLD_LETTERS.test(source) && script !== 'csl' &&
      script !== 'church') return {text: source, converted: false};
  if (legacy) {
    const decoded = convertLegacyUcsToCivil(source);
    if (decoded.problems?.length || looksLegacyUcs(decoded.text) ||
        OLD_LETTERS.test(decoded.text)) return null;
    return {text: norm(decoded.text), converted: true};
  }
  const result = norm(toCivilLetters(expandTitlos(source)));
  if (!result || looksLegacyUcs(result) || OLD_LETTERS.test(result)) return null;
  return {text: result, converted: true};
};

// Source API may still return old combined stanzas until the migration is
// applied. Detect "Иной..." after conversion, without discarding either stanza.
const embeddedAlternative = (text, kind) => {
  const marker = kind === 'troparion'
    ? /^(?:Иной|Інший|Инъ)\s+тропар/u
    : /^(?:Иной|Інший|Инъ)\s+кондак/u;
  const lines = String(text || '').split(/\r?\n/u);
  const at = lines.findIndex((line, index) =>
    index > 0 && marker.test(line.trim()));
  if (at < 1) return null;
  const first = lines.slice(0, at).join('\n').trim();
  const second = lines.slice(at + 1).join('\n').trim();
  if (!first || !second) return null;
  return {first, second, heading: lines[at].trim()};
};

const localized = (card, key, language) => (
  (language === 'uk' && card?.[key + '_uk']) || card?.[key] || ''
);

export const uniqueCalendarCards = cards => {
  const ids = new Set();
  const titles = new Set();
  return (Array.isArray(cards) ? cards : []).filter(card => {
    if (!card) return false;
    const id = canonicalId(card) || String(card.sync_uid || card.source_id || card.id || '');
    const title = simpleTitle(card.title_ru || card.title_uk || card.title);
    if ((id && ids.has(id)) || (title && titles.has(title))) return false;
    if (id) ids.add(id);
    if (title) titles.add(title);
    return true;
  });
};

export const getCalendarCardHymns = (feast, language = 'ru') => {
  if (!feast) return {sections: [], missing: []};
  const options = [];
  const add = (kind, variant, content, heading, script, origin, priority) => {
    if (!TYPES.includes(kind) || !content) return;
    const cleaned = civilize(content, script);
    if (!cleaned) {
      options.push({kind, variant, missing: true, priority, origin});
      return;
    }
    const cleanHeading = civilize(heading || '', script);
    const split = variant === 1 ? embeddedAlternative(cleaned.text, kind) : null;
    options.push({kind, variant, text: split?.first || cleaned.text,
      heading: cleanHeading?.text || '', priority, origin,
      converted: cleaned.converted});
    if (split) {
      options.push({kind, variant: 2, text: split.second,
        heading: split.heading, priority, origin,
        converted: cleaned.converted});
    }
  };

  // The same card's current server/editor data, when civil already, wins.
  for (const h of Array.isArray(feast.hymns) ? feast.hymns : []) {
    const kind = h.kind === 'tropar' ? 'troparion'
      : h.kind === 'kondak' ? 'kontakion' : h.kind;
    const lang = String(h.language || '');
    add(kind, Number(h.variant) || 1, h.content, h.heading,
      lang === 'civil' || lang === 'uk' || lang === 'ru' ? '' : lang,
      'api', lang === 'uk' && language === 'uk' ? 0 : lang === 'civil' ? 1 : 5);
  }
  for (const kind of TYPES) {
    for (const [suffix, variant] of [['', 1], ['_alt', 2]]) {
      const text = localized(feast, kind + suffix + '_content', language);
      const heading = localized(feast, kind + suffix + '_title', language);
      const script = localized(feast, kind + suffix + '_script', language);
      const isCivil = !!text && script !== 'csl' && script !== 'church'
        && !looksLegacyUcs(String(text)) && !OLD_LETTERS.test(String(text));
      add(kind, variant, text, heading, script, 'fields',
        isCivil ? 2 : 7);
    }
  }
  // The 226 corrected variants are baked into Git; no ZIP or downloads.
  for (const h of correctedRows(feast)) {
    const kind = h.kind === 'tropar' ? 'troparion' : 'kontakion';
    add(kind, h.variant, h.content, h.heading, 'civil', 'uoc_210', 3);
  }

  const sections = [], missing = [], usedText = new Set();
  for (const kind of TYPES) {
    const variants = [...new Set(options.filter(x => x.kind === kind)
      .map(x => x.variant))].sort((a,b) => a-b);
    for (const variant of variants) {
      const set = options.filter(x => x.kind === kind && x.variant === variant)
        .sort((a,b) => a.priority - b.priority);
      const chosen = set.find(x => !!x.text);
      if (!chosen) {
        missing.push({kind, variant});
        continue;
      }
      const key = kind + ':' + chosen.text.toLocaleLowerCase();
      if (usedText.has(key)) continue;
      usedText.add(key);
      const another = variant !== 1;
      const title = kind === 'troparion'
        ? another ? (language === 'uk' ? 'Інший тропар' : 'Иной тропарь')
          : (language === 'uk' ? 'Тропар' : 'Тропарь')
        : another ? (language === 'uk' ? 'Інший кондак' : 'Иной кондак') : 'Кондак';
      sections.push({
        key: kind + ':' + variant, kind, variant, title: another && variant > 2
          ? title + ' ' + variant : title,
        text: chosen.text, subtitle: chosen.heading, origin: chosen.origin,
      });
    }
  }
  return {sections, missing};
};
