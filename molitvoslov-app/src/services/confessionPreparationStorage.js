import * as SecureStore from 'expo-secure-store';

// Personal confession notes are intentionally excluded from public content,
// search indexes, favorites and cloud sync. All values are kept in device
// secure storage. Never log selected IDs, titles, or note contents.
const INDEX_KEY = 'molitvoslov.confession.v1.selected';
const ITEM_PREFIX = 'molitvoslov.confession.v1.item.';
const MAX_NOTE_LENGTH = 1200;
const MAX_TITLE_LENGTH = 90;
const VALID_ID = /^(?:c\d{3,4}|s\d{4}|u[a-z0-9]+)$/u;
let writeQueue = Promise.resolve();

const enqueue = (operation) => {
  const next = writeQueue.catch(() => {}).then(operation);
  writeQueue = next;
  return next;
};

const cleanIds = (value) => {
  const input = Array.isArray(value) ? value : [];
  return [...new Set(input.filter(id => typeof id === 'string' && VALID_ID.test(id)))];
};

const itemKey = id => ITEM_PREFIX + id;

export const loadConfessionPreparation = async () => {
  // Wait for queued edits from a previous mounted screen before reading.
  await writeQueue.catch(() => {});
  const encoded = await SecureStore.getItemAsync(INDEX_KEY);
  let storedIds = [];
  if (encoded) {
    const parsed = JSON.parse(encoded);
    storedIds = cleanIds(parsed);
  }
  const records = await Promise.all(storedIds.map(async id => {
    const encodedItem = await SecureStore.getItemAsync(itemKey(id));
    if (!encodedItem) return {id, note: '', title: ''};
    try {
      const data = JSON.parse(encodedItem);
      return {
        id,
        note: typeof data.note === 'string' ? data.note : '',
        title: id.startsWith('u') && typeof data.title === 'string'
          ? data.title : '',
      };
    } catch (_) {
      // Malformed local entries should not reveal private content in logs.
      return {id, note: '', title: ''};
    }
  }));
  return {
    ids: storedIds,
    notes: Object.fromEntries(records.map(record => [record.id, record.note])),
    custom: Object.fromEntries(records.filter(record => record.id.startsWith('u'))
      .map(record => [record.id, record.title])),
  };
};

export const saveConfessionSelection = ids =>
  enqueue(() => SecureStore.setItemAsync(INDEX_KEY, JSON.stringify(cleanIds(ids))));

export const saveConfessionEntry = (id, note, title = '') => {
  if (!VALID_ID.test(id)) return Promise.reject(new Error('Invalid entry ID'));
  const value = JSON.stringify({
    note: String(note || '').slice(0, MAX_NOTE_LENGTH),
    ...(id.startsWith('u') ? {title: String(title || '').slice(0, MAX_TITLE_LENGTH)} : {}),
  });
  return enqueue(() => SecureStore.setItemAsync(itemKey(id), value));
};

export const deleteConfessionEntry = id => {
  if (!VALID_ID.test(id)) return Promise.reject(new Error('Invalid entry ID'));
  return enqueue(() => SecureStore.deleteItemAsync(itemKey(id)));
};

export const clearConfessionPreparation = ids =>
  enqueue(async () => {
    const validIds = cleanIds(ids);
    for (const id of validIds) {
      await SecureStore.deleteItemAsync(itemKey(id));
    }
    await SecureStore.deleteItemAsync(INDEX_KEY);
  });

export const CONFESSION_NOTE_MAX_LENGTH = MAX_NOTE_LENGTH;
export const CONFESSION_TITLE_MAX_LENGTH = MAX_TITLE_LENGTH;
