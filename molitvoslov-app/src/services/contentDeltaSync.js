/**
 * Small, versioned change stream. Normal readers never fetch their texts.
 * The cursor advances only after all changed local records are safely stored.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as Crypto from 'expo-crypto';
import {API_BASE_URL} from './backendAuth';
import {getCurrentContent, saveSyncedPublicContent} from './contentStore';
import {getCurrentBibleContent, saveSyncedBibleContent} from './bibleStore';
import {getOfflineCalendarDay, storeCalendarDay} from './calendarOfflineStore';
import {invalidateCalendarCache} from './churchCalendar';

const CURSOR_KEY = '@molitvoslov/offline-content-cursor-v1';
const CHECK_KEY = '@molitvoslov/offline-content-check-v1';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
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
    if (!Array.isArray(path) || path.some((key) => ['__proto__', 'prototype', 'constructor'].includes(key)) ||
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
    if (operation.op === 'remove') delete parent[last];
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
  if (!data || !data.payload || !data.checksum) throw new Error('Invalid published object');
  return data.payload;
};

const resolveUpdate = async (change, previous) => {
  const delivery = change.payload;
  if (!delivery || typeof delivery !== 'object') throw new Error('Missing content delta');
  if (delivery.kind === 'full') return delivery.value;
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
        const next = change.operation === 'upsert' ? await resolveUpdate(change, previous) : null;
        biblePayload.books = biblePayload.books.filter((book) => book.code !== code);
        if (next) biblePayload.books.push(next);
        biblePayload.books.sort((a, b) => Number(a.canonical_order) - Number(b.canonical_order));
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

  // Idempotent replay on process interruption is safe: cursor is saved last.
  if (publicPayload) await saveSyncedPublicContent(publicPayload, 'delta-' + cursor);
  if (biblePayload) await saveSyncedBibleContent(biblePayload, 'delta-' + cursor);
  for (const [key, data] of calendarStaged) {
    const [date, language] = key.split(':');
    // A published day must take precedence over old separate year-marker caches.
    const ok = await storeCalendarDay(date, language, {...data, _content_delta: true});
    if (!ok) throw new Error('Failed to persist a calendar delta');
    invalidateCalendarCache(date, language);
  }
  await AsyncStorage.setItem(CURSOR_KEY, String(cursor));
};

const doSync = async ({force = false} = {}) => {
  const last = Number(await AsyncStorage.getItem(CHECK_KEY) || 0);
  if (!force && last && Date.now() - last < CHECK_INTERVAL_MS) {
    return {updated: false, skipped: true};
  }
  const network = await NetInfo.fetch();
  if (network.isConnected === false || network.isInternetReachable === false) {
    return {updated: false, offline: true};
  }
  let cursor = Number(await AsyncStorage.getItem(CURSOR_KEY) || 0);
  if (!Number.isSafeInteger(cursor) || cursor < 0) cursor = 0;
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
    if (!Number.isSafeInteger(next) || next < cursor) throw new Error('Invalid delta cursor');
    if (body.changes.length) {
      if (next === cursor) throw new Error('Non-advancing delta cursor');
      await applyPage(body.changes, next);
      changed += body.changes.length;
      cursor = next;
    }
    if (!body.has_more) {
      await AsyncStorage.setItem(CHECK_KEY, String(Date.now()));
      return {updated: changed > 0, changes: changed, cursor};
    }
    if (!body.changes.length) throw new Error('Empty delta page');
  }
  throw new Error('Too many delta pages');
};
export const syncContentDeltas = (options = {}) => {
  if (pending) return pending;
  pending = doSync(options).finally(() => { pending = null; });
  return pending;
};
