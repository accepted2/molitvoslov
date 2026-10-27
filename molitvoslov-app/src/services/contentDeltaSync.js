/**
 * Small, versioned change stream. Normal readers never fetch their texts.
 * The cursor advances only after all changed local records are safely stored.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as Crypto from 'expo-crypto';
import {API_BASE_URL} from './backendAuth';
import {getCurrentContent, activateCommittedPublicContent} from './contentStore';
import {getCurrentBibleContent, activateCommittedBibleContent} from './bibleStore';
import {getOfflineCalendarDay} from './calendarOfflineStore';
import {getDatabase} from '../db/database';
import {invalidateCalendarCache} from './churchCalendar';

const CURSOR_KEY = '@molitvoslov/offline-content-cursor-v1';
const CHECK_KEY = '@molitvoslov/offline-content-check-v1';
const FAILURE_KEY = '@molitvoslov/offline-content-failed-v1';
const RETRY_DELAY_MS = 15 * 60 * 1000;
let pending = null;

const deepClone = (value) => JSON.parse(JSON.stringify(value));
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const result = {};
    Object.keys(value).sort().forEach((key) => { result[key] = canonical(value[key]); });
    return result;
  }
  return value;
};
const checksumOf = async (value) =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, JSON.stringify(canonical(value)));

const splitPath = (path) => {
  const keys = String(path).split('/');
  if (!keys.length || keys.some((key) => !key || ['__proto__', 'prototype', 'constructor'].includes(key))) {
    throw new Error('Invalid delta path');
  }
  return keys;
};
const atPath = (root, path) => {
  let value = root;
  for (const key of splitPath(path)) {
    if (value == null || typeof value !== 'object') return undefined;
    value = value[key];
  }
  return value;
};
const putPath = (root, path, operation, value) => {
  const keys = splitPath(path);
  let parent = root;
  for (const key of keys.slice(0, -1)) {
    if (!parent[key] || typeof parent[key] !== 'object' || Array.isArray(parent[key])) {
      if (operation === 'delete') return;
      parent[key] = {};
    }
    parent = parent[key];
  }
  const last = keys[keys.length - 1];
  if (operation === 'delete') delete parent[last];
  else parent[last] = value;
};
const applyFieldOperations = (previous, operations) => {
  let result = deepClone(previous);
  for (const operation of operations) {
    const path = operation.path;
    if (!Array.isArray(path) || path.some((key) =>
      (typeof key !== 'string' && !Number.isSafeInteger(key)) ||
      ['__proto__', 'prototype', 'constructor'].includes(key) ||
      (typeof key === 'number' && key < 0)
    ) ||
        !['set', 'remove'].includes(operation.op)) {
      throw new Error('Unsupported field delta');
    }
    if (!path.length) {
      if (operation.op !== 'set') throw new Error('Cannot remove root object');
      result = operation.value;
      continue;
    }
    let parent = result;
    for (const segment of path.slice(0, -1)) {
      if (!parent || typeof parent !== 'object' || !(segment in parent)) {
        throw new Error('Field delta base does not match');
      }
      parent = parent[segment];
    }
    const last = path[path.length - 1];
    if (!parent || typeof parent !== 'object') throw new Error('Invalid field target');
    if (Array.isArray(parent) && (!Number.isInteger(last) || last < 0 || last >= parent.length)) {
      throw new Error('Invalid array delta index');
    }
    if (operation.op === 'remove') {
      if (Array.isArray(parent)) throw new Error('Cannot remove array element by index');
      delete parent[last];
    }
    else parent[last] = operation.value;
  }
  return result;
};

const fetchPublishedObject = async (section, key) => {
  const url = API_BASE_URL + '/api/content-updates/item/?section=' +
    encodeURIComponent(section) + '&key=' + encodeURIComponent(key);
  const response = await fetch(url);
  if (!response.ok) throw new Error('Published object HTTP ' + response.status);
  const data = await response.json();
  if (!data || data.payload == null || !data.checksum) throw new Error('Invalid published object');
  if (await checksumOf(data.payload) !== data.checksum) {
    throw new Error('Published object checksum mismatch');
  }
  return data.payload;
};

const resolveUpdate = async (change, previous) => {
  const delivery = change.payload;
  if (!delivery || typeof delivery !== 'object') throw new Error('Missing content delta');
  if (delivery.kind === 'full') {
    if (delivery.value == null || await checksumOf(delivery.value) !== delivery.checksum) {
      throw new Error('Full content delta checksum mismatch');
    }
    return delivery.value;
  }
  if (delivery.kind !== 'patch' || !Array.isArray(delivery.operations)) {
    throw new Error('Unsupported content delta');
  }
  // A user's APK may contain an older snapshot. Never apply index-based
  // JSON changes blindly to mismatched source content.
  if (previous == null || await checksumOf(previous) !== delivery.base_checksum) {
    return fetchPublishedObject(change.section, change.object_key);
  }
  try {
    const next = applyFieldOperations(previous, delivery.operations);
    if (await checksumOf(next) !== delivery.checksum) {
      return fetchPublishedObject(change.section, change.object_key);
    }
    return next;
  } catch {
    return fetchPublishedObject(change.section, change.object_key);
  }
};

const applyPage = async (changes, cursor) => {
  let publicPayload = null;
  let biblePayload = null;
  const calendarStaged = new Map();
  for (const change of changes) {
    if (!['upsert', 'delete'].includes(change.operation)) throw new Error('Unexpected delta operation');
    if (change.section === 'public') {
      if (!publicPayload) publicPayload = deepClone(getCurrentContent());
      const previous = atPath(publicPayload, change.object_key);
      const next = change.operation === 'upsert' ? await resolveUpdate(change, previous) : null;
      putPath(publicPayload, change.object_key, change.operation, next);
    } else if (change.section === 'bible') {
      if (!change.object_key.startsWith('rst/')) throw new Error('Unknown Bible translation');
      if (!biblePayload) biblePayload = deepClone(getCurrentBibleContent('rst'));
      const name = change.object_key.slice(4);
      if (name === 'translation') {
        if (change.operation !== 'upsert') throw new Error('Cannot delete Bible translation');
        biblePayload.translation = await resolveUpdate(change, biblePayload.translation);
      } else if (name.startsWith('book/')) {
        const code = name.slice(5);
        const previous = biblePayload.books.find((book) => book.code === code);
        const previousMeta = previous && Object.fromEntries(
          Object.entries(previous).filter(([key]) => key !== 'chapters')
        );
        const next = change.operation === 'upsert' ? await resolveUpdate(change, previousMeta) : null;
        biblePayload.books = biblePayload.books.filter((book) => book.code !== code);
        if (next) biblePayload.books.push({...next, chapters: previous?.chapters || []});
        biblePayload.books.sort((a, b) => Number(a.canonical_order) - Number(b.canonical_order));
      } else if (name.startsWith('chapter/')) {
        const match = name.match(/^chapter\/([^/]+)\/(\d+)$/);
        if (!match) throw new Error('Invalid Bible chapter key');
        const [, code, chapterNumber] = match;
        const book = biblePayload.books.find((item) => item.code === code);
        if (!book) throw new Error('Bible book missing for changed chapter: ' + code);
        const previous = (book.chapters || []).find((chapter) => String(chapter.number) === chapterNumber);
        const next = change.operation === 'upsert' ? await resolveUpdate(change, previous) : null;
        book.chapters = (book.chapters || []).filter((chapter) => String(chapter.number) !== chapterNumber);
        if (next) book.chapters.push(next);
        book.chapters.sort((a, b) => Number(a.number) - Number(b.number));
      } else throw new Error('Unknown Bible delta');
    } else if (change.section === 'calendar') {
      const match = String(change.object_key).match(/^(\d{4}-\d{2}-\d{2})\/(ru|uk)$/);
      if (!match || change.operation === 'delete') throw new Error('Unsupported calendar delta');
      const [date, language] = [match[1], match[2]];
      const key = date + ':' + language;
      let previous = calendarStaged.get(key);
      if (!previous) previous = await getOfflineCalendarDay(date, language);
      // Strip client-only overlay metadata before comparing canonical revisions.
      if (previous?._content_delta) {
        previous = {...previous};
        delete previous._content_delta;
      }
      const data = await resolveUpdate(change, previous);
      if (data?.date_gregorian !== date) throw new Error('Calendar delta date mismatch');
      calendarStaged.set(key, data);
    } else throw new Error('Unknown content delta section');
  }

  // All three content families and the applied cursor share ONE SQLite transaction.
  // A killed process either commits everything or rolls everything back.
  const db = await getDatabase();
  await db.withExclusiveTransactionAsync(async (tx) => {
    const now = new Date().toISOString();
    if (publicPayload) await tx.runAsync(
      `INSERT INTO public_content_cache (cache_key, version, payload, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET
         version=excluded.version, payload=excluded.payload, updated_at=excluded.updated_at`,
      ['public-content-v1', 'delta-' + cursor, JSON.stringify(publicPayload), now]
    );
    if (biblePayload) await tx.runAsync(
      `INSERT INTO public_content_cache (cache_key, version, payload, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET
         version=excluded.version, payload=excluded.payload, updated_at=excluded.updated_at`,
      ['bible-content-v1:rst', 'delta-' + cursor, JSON.stringify(biblePayload), now]
    );
    for (const [key, data] of calendarStaged) {
      const [date, language] = key.split(':');
      await tx.runAsync(
        `INSERT INTO content_delta_calendar (date, language, payload) VALUES (?, ?, ?)
         ON CONFLICT(date, language) DO UPDATE SET payload=excluded.payload`,
        [date, language, JSON.stringify({...data, _content_delta: true})]
      );
    }
    await tx.runAsync(
      `INSERT INTO content_delta_state (id, cursor) VALUES (1, ?)
       ON CONFLICT(id) DO UPDATE SET cursor=excluded.cursor`,
      [cursor]
    );
  });
  // Notify screens only after commit. On restart, stores hydrate committed rows.
  if (publicPayload) activateCommittedPublicContent(publicPayload, 'delta-' + cursor);
  if (biblePayload) activateCommittedBibleContent(biblePayload, 'delta-' + cursor);
  for (const key of calendarStaged.keys()) {
    const [date, language] = key.split(':');
    invalidateCalendarCache(date, language);
  }
};

const doSync = async ({force = false} = {}) => {
  const lastFailure = Number(await AsyncStorage.getItem(FAILURE_KEY) || 0);
  if (!force && lastFailure && Date.now() - lastFailure < RETRY_DELAY_MS) {
    return {updated: false, skipped: true, retryLater: true};
  }
  const network = await NetInfo.fetch();
  if (network.isConnected === false || network.isInternetReachable === false) {
    return {updated: false, offline: true};
  }
  const db = await getDatabase();
  // One-time migration of legacy cursor: never advance past a snapshot that
  // was saved in the old non-atomic format.
  const legacyCursor = Number(await AsyncStorage.getItem(CURSOR_KEY) || 0);
  let row = await db.getFirstAsync('SELECT cursor FROM content_delta_state WHERE id = 1');
  if (!row) {
    const initial = Number.isSafeInteger(legacyCursor) && legacyCursor >= 0 ? legacyCursor : 0;
    await db.runAsync('INSERT OR IGNORE INTO content_delta_state (id, cursor) VALUES (1, ?)', [initial]);
    row = await db.getFirstAsync('SELECT cursor FROM content_delta_state WHERE id = 1');
  }
  let cursor = Number(row?.cursor || 0);
  if (!Number.isSafeInteger(cursor) || cursor < 0) throw new Error('Corrupt content revision');
  // Most checks finish here with one cheap revision lookup and no delta payload.
  const manifestResponse = await fetch(
    API_BASE_URL + '/api/content-updates/manifest/',
    {headers: {Accept: 'application/json'}}
  );
  if (!manifestResponse.ok) throw new Error('Content manifest HTTP ' + manifestResponse.status);
  const manifest = await manifestResponse.json();
  const latestRevision = Number(manifest?.latest_revision);
  if (manifest?.schema_version !== 1 ||
      !Number.isSafeInteger(latestRevision) || latestRevision < 0) {
    throw new Error('Unsupported content manifest');
  }
  if (cursor > latestRevision) {
    throw new Error('Local content cursor is ahead of server; reset required');
  }
  if (cursor === latestRevision) {
    await AsyncStorage.multiSet([
      [CHECK_KEY, String(Date.now())],
      [FAILURE_KEY, '0'],
    ]);
    return {updated: false, changes: 0, cursor};
  }
  let changed = 0;
  for (let page = 0; page < 1000; page += 1) {
    const response = await fetch(
      API_BASE_URL + '/api/content-updates/?since=' + encodeURIComponent(cursor),
      {headers: {Accept: 'application/json'}}
    );
    if (!response.ok) throw new Error('Content update HTTP ' + response.status);
    const body = await response.json();
    if (body?.schema_version !== 1 || !Array.isArray(body?.changes)) {
      throw new Error('Unsupported content update format');
    }
    const next = Number(body.cursor);
    const latest = Number(body.latest_revision);
    if (!Number.isSafeInteger(next) || next < cursor ||
        !Number.isSafeInteger(latest) || latest < next) {
      throw new Error('Invalid delta cursor');
    }
    let previousId = cursor;
    for (const change of body.changes) {
      const id = Number(change?.id);
      if (!Number.isSafeInteger(id) || id <= previousId || id > next) {
        throw new Error('Out-of-order content delta');
      }
      previousId = id;
    }
    if ((body.changes.length && previousId !== next) ||
        (!body.changes.length && next !== cursor) ||
        (body.has_more && next >= latest)) {
      throw new Error('Inconsistent content delta page');
    }
    if (body.changes.length) {
      if (next === cursor) throw new Error('Non-advancing delta cursor');
      await applyPage(body.changes, next);
      changed += body.changes.length;
      cursor = next;
    }
    if (!body.has_more) {
      await AsyncStorage.multiSet([
        [CHECK_KEY, String(Date.now())],
        [FAILURE_KEY, '0'],
      ]);
      return {updated: changed > 0, changes: changed, cursor};
    }
    if (!body.changes.length) throw new Error('Empty delta page');
  }
  throw new Error('Too many delta pages');
};
// Manual diagnostics bypass the transient-failure backoff; the active sync is still deduplicated.
export const forceSyncContentDeltas = () => syncContentDeltas({force: true});

export const syncContentDeltas = (options = {}) => {
  if (pending) return pending;
  pending = doSync(options)
    .then((result) => {
      console.log('Offline content delta sync result:', JSON.stringify(result));
      return result;
    })
    .catch(async (error) => {
      // Transient API failures must not trigger a new network request on every
      // foreground transition. Never advance the applied revision on failure.
      try { await AsyncStorage.setItem(FAILURE_KEY, String(Date.now())); } catch {}
      throw error;
    })
    .finally(() => { pending = null; });
  return pending;
};
