// Canonical calendar-card presentation. One icon; distinct hymn variants.
// Never change Scripture, hagiography or the underlying Church-Slavonic source.
const LEGACY_UCS = /(?:[а-яёіїєѣѡѳѵꙋ][0-9][a-zа-яёіїєѣѡѳѵꙋ]|[a-zа-яёіїєѣѡѳѵꙋ][0-9][а-яёіїєѣѡѳѵꙋ]|тропaрь|кондaкъ|глaсъ|бжcтвен|прпdб|с™и|[џћњѓ][a-zа-яёіїє]{2,})/iu;
const TRADITIONAL = /[ѣѢѡѠѻѺѿѾѧѦѵѴѳѲѯѮѱѰꙋꙊꙗꙖ\u0483\u0486\u0487\u2de0-\u2dff]/u;
const TYPES = ['troparion', 'kontakion'];
const HYMNS = {troparion: 'tropar', kontakion: 'kondak'};

export const readableCivilHymn = text =>
  typeof text === 'string' && !!text.trim() &&
  !LEGACY_UCS.test(text) && !TRADITIONAL.test(text);

const textId = text => String(text || '').normalize('NFC').replace(/\s+/gu, ' ').trim();
const keyOf = card => String(card?.card_id || card?.sync_uid ||
  card?.source_uid || card?.source_id || card?.id || '').trim();

export const uniqueCalendarCards = (cards = []) => {
  const visited = new Set();
  return (Array.isArray(cards) ? cards : []).filter(card => {
    if (!card) return false;
    const id = keyOf(card);
    const normalizedName = textId(card.title_uk || card.title || '').toLocaleLowerCase();
    const key = id ? 'id:' + id : 'name:' + normalizedName;
    if (visited.has(key)) return false;
    visited.add(key);
    return true;
  });
};

export const selectedCalendarIcon = feast => {
  // The card's curator-approved icon_url is authoritative. Never iterate
  // the full image gallery to build a carousel in the daily saint card.
  const selected = feast?.icon_url || feast?.selected_icon_url || '';
  return typeof selected === 'string' && /^https:\/\//u.test(selected)
    ? selected : '';
};

const localization = (feast, field, uk) =>
  (uk && typeof feast?.[field + '_uk'] === 'string' && feast[field + '_uk'].trim()
    ? feast[field + '_uk'] : feast?.[field]) || '';

const rowCandidates = (feast, uk) => {
  const rows = [];
  for (const raw of Array.isArray(feast?.hymns) ? feast.hymns : []) {
    const kind = raw.kind === 'tropar' ? 'troparion'
      : raw.kind === 'kondak' ? 'kontakion' : raw.kind;
    if (!TYPES.includes(kind)) continue;
    const variant = Math.max(1, Math.floor(Number(raw.variant) || 1));
    rows.push({
      kind, variant, text: raw.content || '', subtitle: raw.heading || '',
      language: raw.language || raw.script || '',
      source: 'hymns', locale: uk ? 'uk' : 'ru',
    });
  }
  for (const kind of TYPES) {
    for (const [variant, marker] of [[1, ''], [2, '_alt']]) {
      const base = kind + marker;
      const text = localization(feast, base + '_content', uk);
      if (!text) continue;
      rows.push({
        kind, variant, text, subtitle: localization(feast, base + '_title', uk),
        language: localization(feast, base + '_script', uk) || 'legacy',
        source: 'fields', locale: uk ? 'uk' : 'ru',
      });
    }
  }
  return rows;
};

export const getCalendarCardHymns = (feast, language = 'ru') => {
  const uk = language === 'uk';
  const candidates = rowCandidates(feast, uk);
  const byKey = new Map();
  for (const row of candidates) {
    const label = row.kind + ':' + row.variant;
    const readable = readableCivilHymn(row.text);
    const script = String(row.language).toLowerCase();
    const rank = !readable || script === 'church' || script === 'csl' ? 100
      : script === 'uk' && uk ? 0
      : script === 'civil' || script === 'ru' ? 1
      : row.source === 'fields' ? 2
      : script === 'uk' ? 3 : 4;
    const current = byKey.get(label);
    if (!current || rank < current.rank) byKey.set(label, {row, rank});
  }
  const output = [];
  const missing = [];
  for (const kind of TYPES) {
    const grouped = [...byKey.values()].filter(x => x.row.kind === kind)
      .sort((a,b) => a.row.variant - b.row.variant);
    let used = 0;
    const seen = new Set();
    for (const entry of grouped) {
      const {row, rank} = entry;
      if (rank >= 100) {
        missing.push({kind, variant: row.variant, reason: 'not_civil_script'});
        continue;
      }
      const normalized = textId(row.text);
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      used += 1;
      // Variant >1 stays labelled "Иной..." even if the primary hymn
      // has not yet passed civic conversion and is temporarily hidden.
      const first = used === 1 && row.variant === 1;
      const title = kind === 'troparion'
        ? first ? (uk ? 'Тропар' : 'Тропарь')
          : (uk ? 'Інший тропар' : 'Иной тропарь')
        : first ? (uk ? 'Кондак' : 'Кондак')
          : (uk ? 'Інший кондак' : 'Иной кондак');
      output.push({
        key: kind + ':' + row.variant,
        kind,
        variant: row.variant,
        title: used > 2 ? title + ' ' + used : title,
        subtitle: row.subtitle,
        text: row.text,
        section: kind + (first ? '' : '_alt'),
      });
    }
  }
  return {sections: output, missing};
};
