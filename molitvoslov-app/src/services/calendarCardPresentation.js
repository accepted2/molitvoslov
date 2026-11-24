// A single display pipeline for every saint/feast in the Molitvoslov calendar.
// Verified data fields win; 210 historical UCS cards have a committed civil
// replacement list. Never render raw broken UCS glyphs or mutate saved data.
import {
  looksLegacyUcs, convertLegacyUcsToCivil, expandTitlos, toCivilLetters,
} from './calendarCivicDecoder';

const corrections = require('../data/calendar/uocCivicHymns210.json');
const allCivilShards = [
  require('../data/calendar/uocAllCivilHymns0.json'),
  require('../data/calendar/uocAllCivilHymns1.json'),
  require('../data/calendar/uocAllCivilHymns2.json'),
  require('../data/calendar/uocAllCivilHymns3.json'),
  require('../data/calendar/uocAllCivilHymns4.json'),
  require('../data/calendar/uocAllCivilHymns5.json'),
  require('../data/calendar/uocAllCivilHymns6.json'),
  require('../data/calendar/uocAllCivilHymns7.json'),
];
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

// Exactly one canonical card's texts may be associated with a displayed saint.
// A date alone is NEVER a sufficient join key: prevents a saint receiving
// an unrelated holiday's troparion or kontakion.
const civilById = new Map(), civilByName = new Map(), ambiguousNames = new Set();
for (const shard of allCivilShards) {
  for (const card of shard.cards || []) {
    if (civilById.has(card.card_id)) throw Error('Duplicate canonical hymn ID');
    civilById.set(card.card_id, card);
    for (const title of [card.title_ru, card.title_uk]) {
      const key = simpleTitle(title);
      if (!key) continue;
      if (civilByName.has(key) && civilByName.get(key) !== card.card_id)
        ambiguousNames.add(key);
      else civilByName.set(key, card.card_id);
    }
  }
}
// The live 2026 July bundle calls the Apostles' feast "Святых славных...",
// whereas the source catalogue begins "СЛАВНЫХ И ВСЕХВАЛЬНЫХ..." and adds
// "(67)". This is a checked identity alias, not fuzzy saint matching.
const approvedHymnAlias = feast => {
  const titles = [feast?.title_ru, feast?.title_uk, feast?.title];
  const sourceId = Number(feast?.source_id);
  // Audited bridge from the 2026 bundled CalendarFeast external source IDs
  // to canonical catalogue IDs. Match BOTH the source ID and commemoration
  // title so an accidental numeric collision cannot transplant hymns.
  if ((sourceId === 3301 || sourceId === 4260) &&
      titles.some(value => /онисифор[а-я]*\s+и\s+порфир/i.test(
        String(value || '').toLocaleLowerCase('ru-RU')))) {
    return 'blv-d8aea6d1a8b6379590a8bed9';
  }
  if (sourceId === 3797 && titles.some(value => {
    const normalized = String(value || '').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('ru-RU');
    return /евфросин/.test(normalized) && /полоцк/.test(normalized);
  })) {
    // 2026-06-05 bundled source: verified Euphrosyne of Polotsk has
    // 2 independent troparia and 3 kontakia. No fuzzy-name matching.
    return 'blv-01c20f48d726643027c330eb';
  }
  if (sourceId === 3355 &&
      titles.some(value => /никола/i.test(String(value || '')) &&
        /мир[\s-]*лики/i.test(String(value || '').toLocaleLowerCase('ru-RU')))) {
    return 'blv-839dc39617bdf40503d594dd';
  }
  for (const raw of titles) {
    const title = simpleTitle(raw);
    if (/(?:апостолов|апостолів) петра (?:и|і) павла/u.test(title)
        && /первоверховн/u.test(title))
      return 'blv-ca7f2ce407c66cc45b803749';
  }
  return '';
};
const fullCivilRows = feast => {
  const id = canonicalId(feast);
  if (id) return civilById.get(id)?.hymns || [];
  const alias = approvedHymnAlias(feast);
  if (alias && civilById.has(alias)) return civilById.get(alias).hymns || [];
  for (const value of [feast?.title_ru, feast?.title_uk, feast?.title]) {
    const key = simpleTitle(value);
    if (!key || ambiguousNames.has(key)) continue;
    const match = civilById.get(civilByName.get(key));
    if (match) return match.hymns || [];
  }
  return [];
};

// The 2025-2027 release-only calendar uses canonical "blv-..." strings
// in source_id, whereas legacy calendar years used numeric source IDs.
const canonicalId = feast => {
  const source = typeof feast?.source_id === 'string' ? feast.source_id.trim() : '';
  const fromSource = /^blv-[a-z0-9-]+$/i.test(source) ? source : '';
  return String(feast?.card_id || feast?.blagovist_card_id ||
    feast?.article_key || fromSource || '').trim();
};
const correctedRows = feast => {
  const id = canonicalId(feast);
  if (id) return indexedId.get(id) || [];
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
  const protectedFields = new Set([
    ...(feast.protected_hymn_fields || []),
    ...(feast.manually_edited_fields || []),
  ]);
  const deliberatelyBlank = new Set();
  // A confirmed legacy-ID bridge means the old bundled fields may predate
  // the corrected canonical stanzas. Preserve manual edits, but do not let
  // stale unedited fields replace checked text or its glas/heading.
  // For an exact source_id/card_id, reviewed canonical verses outrank
  // stale imported fields. Explicit editor overrides retain priority.
  const verifiedLegacyAlias = !canonicalId(feast) && !!approvedHymnAlias(feast);
  const preferReviewed = verifiedLegacyAlias || civilById.has(canonicalId(feast));
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
    for (const [suffix, variant] of [['', 1], ['_alternate', 2], ['_alt', 2]]) {
      const field = kind + suffix + '_content';
      const text = localized(feast, field, language);
      const manual = protectedFields.has(field) || protectedFields.has(field + '_uk');
      if (manual && !text) deliberatelyBlank.add(kind + ':' + variant);
      const heading = localized(feast, kind + suffix + '_title', language);
      const script = localized(feast, kind + suffix + '_script', language);
      const isCivil = !!text && script !== 'csl' && script !== 'church'
        && !looksLegacyUcs(String(text)) && !OLD_LETTERS.test(String(text));
      add(kind, variant, text, heading, script, 'fields',
        manual ? -2 : isCivil ? 2 : 7);
    }
  }
  // Canonical civil/UK texts for 1,267 cards (2,821 variants), including
  // Peter & Paul and the 210 corrected source groups, are shipped in the APK.
  for (const h of fullCivilRows(feast)) {
    const kind = h.kind === 'tropar' ? 'troparion' : 'kontakion';
    add(kind, Number(h.variant) || 1, h.content, h.heading,
      h.language === 'civil' || h.language === 'uk' ? '' : h.language,
      'canonical_catalogue',
      preferReviewed
        ? (h.language === 'uk' && language === 'uk' ? 0 : h.language === 'civil' ? 1 : 4)
        : (h.language === 'uk' && language === 'uk' ? 3 : 4));
  }
  // The original 210 repair package remains committed with exact before/after
  // comparisons and can fill variants when a later shard is incomplete.
  for (const h of correctedRows(feast)) {
    const kind = h.kind === 'tropar' ? 'troparion' : 'kontakion';
    add(kind, h.variant, h.content, h.heading, 'civil', 'uoc_210', 6);
  }

  const sections = [], missing = [], usedText = new Set();
  for (const kind of TYPES) {
    const variants = [...new Set(options.filter(x => x.kind === kind)
      .map(x => x.variant))].sort((a,b) => a-b);
    for (const variant of variants) {
      if (deliberatelyBlank.has(kind + ':' + variant)) continue;
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
