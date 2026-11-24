// Source-selected UOC icons, screened for duplicated URLs and tiny thumbnails.
// One candidate per canonical card; it does NOT grant reuse rights.
const iconShards = [
  require('../data/calendar/uocIconCandidates0.json'),
  require('../data/calendar/uocIconCandidates1.json'),
  require('../data/calendar/uocIconCandidates2.json'),
  require('../data/calendar/uocIconCandidates3.json'),
  require('../data/calendar/uocIconCandidates4.json'),
  require('../data/calendar/uocIconCandidates5.json'),
  require('../data/calendar/uocIconCandidates6.json'),
  require('../data/calendar/uocIconCandidates7.json'),
  require('../data/calendar/uocIconCandidates8.json'),
  require('../data/calendar/uocIconCandidates9.json'),
  require('../data/calendar/uocIconCandidates10.json'),
  require('../data/calendar/uocIconCandidates11.json'),
];
// Links quarantined by the full icon audit: repeated assignments, inferred
// unverified high-res addresses or small thumbnails. The 459 truly missing
// source images need no entry in this quarantine.
const quarantineShards = [
  require('../data/calendar/uocIconQuarantine0.json'),
  require('../data/calendar/uocIconQuarantine1.json'),
];
const curated = require('../data/calendar/uocIconCuratedExceptions.json');
const curatedById = new Map();
const curatedByName = new Map();
const curatedFor = {
  peterAndPaul: curated.items[0][3],
  nicholas: curated.items[1][3],
};
const quarantinedIds = new Set();
const quarantinedNames = new Set();

const iconById = new Map();
const iconByName = new Map();
const ambiguousNames = new Set();
const urlOwners = new Map();
const normalize = value => String(value || '').normalize('NFC').toLowerCase()
  .replace(/ё/g, 'е').replace(/і/g, 'и').replace(/ї/g, 'и')
  .replace(/\([^)]*(?:\d{1,4}|век|столет|близько)[^)]*\)/g, '')
  .replace(/[^a-zа-я0-9]+/g, ' ').trim();
const isHttps = url => typeof url === 'string' && /^https:\/\//i.test(url);
const sourceId = card => {
  const source = typeof card?.source_id === 'string' ? card.source_id.trim() : '';
  const fromSource = /^blv-[a-z0-9-]+$/i.test(source) ? source : '';
  return String(card?.card_id || card?.blagovist_card_id ||
    card?.canonical_card_id || fromSource || '');
};
for (const [cardId, titleRu, titleUk, url] of curated.items) {
  curatedById.set(cardId, url);
  for (const title of [titleRu, titleUk]) {
    const key = normalize(title);
    if (key) curatedByName.set(key, url);
  }
}
for (const shard of quarantineShards) {
  for (const [id, titleRu, titleUk] of shard.items) {
    quarantinedIds.add(id);
    for (const name of [titleRu, titleUk]) {
      const normalized = normalize(name);
      if (normalized) quarantinedNames.add(normalized);
    }
  }
}
for (const shard of iconShards) {
  for (const [id, titleRu, titleUk, url] of shard.items) {
    if (!isHttps(url) || iconById.has(id) || urlOwners.has(url)) {
      throw Error('Non-unique UOC icon candidate identity or URL');
    }
    const record = {id, url};
    iconById.set(id, record);
    urlOwners.set(url, id);
    for (const name of [titleRu, titleUk]) {
      const key = normalize(name);
      if (!key) continue;
      const previous = iconByName.get(key);
      if (previous && previous.id !== id) ambiguousNames.add(key);
      else iconByName.set(key, record);
    }
  }
}

export const safeIconCandidateCount = iconById.size;
export const selectUocIcon = feast => {
  if (!feast) return '';
  const existing = String(feast.icon_url || '').trim();
  // The editor's explicitly selected icon must remain the highest priority.
  if (feast.icon_is_manual) return isHttps(existing) ? existing : '';
  const id = sourceId(feast);
  const explicit = id ? curatedById.get(id) : null;
  if (explicit) return explicit;
  if (!id) {
    for (const label of [feast.title_ru, feast.title_uk, feast.title]) {
      const key = normalize(label);
      if (!key) continue;
      if (curatedByName.has(key)) return curatedByName.get(key);
      if (/петр.*павл|павл.*петр/u.test(key) &&
          /апостол/u.test(key) && /первоверховн/u.test(key))
        return curatedFor.peterAndPaul;
      if (/никол/u.test(key) && /чудотвор/u.test(key) &&
          /мир.?лик/u.test(key))
        return curatedFor.nicholas;
    }
  }
  let selected = id ? iconById.get(id) : null;
  // If the incoming card has a canonical ID but it failed verification,
  // NEVER match it to a different person's icon by title.
  if (!selected && !id) {
    for (const title of [feast.title_ru, feast.title_uk, feast.title]) {
      const name = normalize(title);
      if (!name || ambiguousNames.has(name) || quarantinedNames.has(name)) continue;
      const match = iconByName.get(name);
      if (match) { selected = match; break; }
    }
  }
  if (selected) return selected.url;
  // Never fall back to a Blagovist link that was explicitly quarantined.
  // Existing manually curated icons and other source libraries are kept.
  // A generic old Blagovist URL is not a curated match. Even if this
  // specific card was not in the quarantine list, do not silently reuse it:
  // source-page thumbnails and unrelated sidebar icons caused the original
  // cross-saint contamination. Explicit admin edits were handled above.
  if (/^https:\/\/(?:www\.)?blagovist\.info\//i.test(existing)) return '';
  // Preserve separately supplied non-Blagovist images from the app's
  // existing library, unless an administrator clears them manually.
  return isHttps(existing) ? existing : '';
};
