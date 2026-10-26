/**
 * Only reads the tiny /api/content-updates/ change feed.
 * Public text, Bible and calendar are always read locally by reader screens.
 * The server publishes changes explicitly after edits, never on a GET.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import {API_BASE_URL} from './backendAuth';
import {getCurrentContent, saveSyncedPublicContent} from './contentStore';
import {getCurrentBibleContent, saveSyncedBibleContent} from './bibleStore';
import {storeCalendarDay} from './calendarOfflineStore';
import {invalidateCalendarCache} from './churchCalendar';

const CURSOR_KEY = '@molitvoslov/offline-content-cursor-v1';
const CHECK_KEY = '@molitvoslov/offline-content-check-v1';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
let pending = null;

const deepClone = (source) => JSON.parse(JSON.stringify(source));

const putPath = (root, path, operation, value) => {
  const keys = path.split('/');
  if (!keys.length || keys.some((key) => !key || key === '__proto__' || key === 'constructor')) {
    throw new Error('Invalid content update path');
  }
  let parent = root;
  for (const segment of keys.slice(0, -1)) {
    if (!parent[segment] || typeof parent[segment] !== 'object' || Array.isArray(parent[segment])) {
      if (operation === 'delete') return;
      parent[segment] = {};
    }
    parent = parent[segment];
  }
  const key = keys[keys.length - 1];
  if (operation === 'delete') delete parent[key];
  else parent[key] = value;
};

const applyPage = async (changes, cursor) => {
  let publicPayload = null;
  let biblePayload = null;
  const calendarUpdates = [];
  for (const change of changes) {
    if (!['upsert', 'delete'].includes(change.operation)) {
      throw new Error('Unexpected delta operation');
    }
    if (change.section === 'public') {
      if (!publicPayload) publicPayload = deepClone(getCurrentContent());
      putPath(publicPayload, change.object_key, change.operation, change.payload);
    } else if (change.section === 'bible') {
      if (!change.object_key.startsWith('rst/')) throw new Error('Unknown Bible translation');
      if (!biblePayload) biblePayload = deepClone(getCurrentBibleContent('rst'));
      const key = change.object_key.slice(4);
      if (key === 'translation') {
        if (change.operation !== 'upsert') throw new Error('Cannot delete translation');
        biblePayload.translation = change.payload;
      } else if (key.startsWith('book/')) {
        const code = key.slice(5);
        biblePayload.books = biblePayload.books.filter((book) => book.code !== code);
        if (change.operation === 'upsert') biblePayload.books.push(change.payload);
        biblePayload.books.sort((a, b) => Number(a.canonical_order) - Number(b.canonical_order));
      } else {
        throw new Error('Unexpected Bible update');
      }
    } else if (change.section === 'calendar') {
      const match = String(change.object_key).match(/^(\d{4}-\d{2}-\d{2})\/(ru|uk)$/);
      if (!match) throw new Error('Invalid calendar update');
      if (change.operation === 'delete') {
        // The bundled data cannot be removed by deleting the AsyncStorage override.
        // A future publisher should use an explicit tombstone for deleted calendar days.
        throw new Error('Calendar deletions require a tombstone release');
      }
      if (!change.payload || change.payload.date_gregorian !== match[1]) {
        throw new Error('Invalid calendar day payload');
      }
      calendarUpdates.push({date: match[1], language: match[2], data: change.payload});
    } else {
      throw new Error('Unknown content update section');
    }
  }

  // Write every updated page locally before persisting the cursor.
  if (publicPayload) await saveSyncedPublicContent(publicPayload, 'delta-' + cursor);
  if (biblePayload) await saveSyncedBibleContent(biblePayload, 'delta-' + cursor);
  for (const update of calendarUpdates) {
    const ok = await storeCalendarDay(update.date, update.language, update.data);
    if (!ok) throw new Error('Failed to persist a calendar delta');
    invalidateCalendarCache(update.date, update.language);
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
    const nextCursor = Number(body.cursor);
    if (!Number.isSafeInteger(nextCursor) || nextCursor < cursor) {
      throw new Error('Invalid content update cursor');
    }
    if (body.changes.length) {
      if (nextCursor === cursor) throw new Error('Non-advancing update cursor');
      await applyPage(body.changes, nextCursor);
      changed += body.changes.length;
      cursor = nextCursor;
    }
    if (!body.has_more) {
      await AsyncStorage.setItem(CHECK_KEY, String(Date.now()));
      return {updated: changed > 0, changes: changed, cursor};
    }
    if (!body.changes.length) throw new Error('Empty update page');
  }
  throw new Error('Too many update pages');
};

export const syncContentDeltas = (options = {}) => {
  if (pending) return pending;
  pending = doSync(options).finally(() => { pending = null; });
  return pending;
};
