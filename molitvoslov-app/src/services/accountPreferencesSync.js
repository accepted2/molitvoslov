import AsyncStorage from '@react-native-async-storage/async-storage';
import {authenticatedFetch, getApiToken, getCachedBackendUser} from './backendAuth';
import {getAppLanguage, setAppLanguage} from './languagePreferences';
import {
  getReadingSettings, saveReadingSettings,
  getAccountReaderModeStorageKey,
} from './readerPreferences';

const PENDING = '@molitvoslov/account-prefs-pending/v1:';
const LAST_SCOPES = '@molitvoslov/account-prefs-last-scopes/v1:';
const APPEARANCE = '@molitvoslov/scoped-reader-appearance/v1:';
const MODE_OLD = '@molitvoslov/reader-language-mode/v1:';
const SECTIONS = ['settings', 'reader_overrides', 'reader_modes'];
const VALID_READER_MODES = new Set(['church', 'russian', 'both', 'traditional']);
let timer = null;
let running = null;
let writeQueue = Promise.resolve();

const mergePatch = (left = {}, right = {}) => {
  const result = {...left};
  for (const section of SECTIONS) {
    if (right[section]) result[section] = {...(left[section] || {}), ...right[section]};
  }
  return result;
};
const pendingKey = (userId) => PENDING + String(userId);
const parse = (raw, fallback = {}) => {
  try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
};
const readPending = async (id) => parse(await AsyncStorage.getItem(pendingKey(id)));

export const queueAccountPreferencePatch = (patch) => {
  // Serialise concurrent palette-drag updates so older writes cannot
  // overwrite a newer color choice in the offline pending queue.
  const enqueue = async () => {
    const user = await getCachedBackendUser().catch(() => null);
    const token = await getApiToken().catch(() => null);
    if (!user?.id || !token) return;
    const key = pendingKey(user.id);
    const current = await readPending(user.id);
    await AsyncStorage.setItem(key, JSON.stringify(mergePatch(current, patch)));
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      syncAccountPreferences().catch(error =>
        console.warn('[preferences] retry on next login/connection:', error?.message || error)
      );
    }, 1300);
  };
  writeQueue = writeQueue.then(enqueue, enqueue);
  return writeQueue;
};

const request = async (method, patch = null) => {
  const response = await authenticatedFetch('/api/account-preferences/', {
    method,
    ...(patch ? {body: JSON.stringify(patch)} : {}),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data?.detail || 'Cloud settings HTTP ' + response.status);
  }
  return response.json();
};

const accountAppearanceKey = (id, scope) => {
  const colon = scope.indexOf(':');
  const type = scope.slice(0, colon);
  const sourceId = decodeURIComponent(scope.slice(colon + 1));
  return `${APPEARANCE}account-${encodeURIComponent(String(id))}:${encodeURIComponent(type)}:${encodeURIComponent(sourceId)}`;
};

const initialSnapshot = async (userId) => {
  const [settings, language, keys] = await Promise.all([
    getReadingSettings(), getAppLanguage(), AsyncStorage.getAllKeys(),
  ]);
  const overrides = {};
  const modes = {};
  // Migrate only explicitly customised documents; never upload a derived
  // copy of the global appearance as a document override.
  const scopes = keys.filter(key => key.startsWith(APPEARANCE + 'guest:') ||
    key.startsWith(APPEARANCE + 'account-' + encodeURIComponent(String(userId)) + ':'))
    .sort((left, right) => Number(left.includes(':guest:')) - Number(right.includes(':guest:')));
  for (const key of scopes) {
    const parts = key.split(':');
    if (parts.length < 4) continue;
    const scope = parts.slice(-2).join(':');
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      const appearance = parse(raw);
      const fields = ['fontSize', 'palette', 'customBackground', 'customText'];
      const equals = reference => fields.every(key =>
        String(appearance?.[key]) === String(reference[key])
      );
      // Do not upload implicit inherited snapshots from old app versions.
      if (appearance?.__explicitOverride === true || (
        !equals(settings) && !equals({
          fontSize: 17, palette: 'parchment',
          customBackground: '#FFF4DE', customText: '#3E2A1D',
        })
      )) {
        // Local marker is not an API field, only the appearance values sync.
        overrides[scope] = Object.fromEntries(fields.map(field => [field, appearance[field]]));
      }
    }
  }
  const oldModeKeys = keys.filter(key => key.startsWith(MODE_OLD));
  for (const key of oldModeKeys) {
    const raw = await AsyncStorage.getItem(key);
    if (VALID_READER_MODES.has(raw)) modes[key.slice(MODE_OLD.length + 1)] = raw;
  }
  const accountModePrefix = `@molitvoslov/reader-language-mode/v2:account-${encodeURIComponent(String(userId))}:`;
  for (const key of keys.filter(k => k.startsWith(accountModePrefix))) {
    const raw = await AsyncStorage.getItem(key);
    if (VALID_READER_MODES.has(raw)) modes[key.slice(accountModePrefix.length)] = raw;
  }
  return {settings: {...settings, language}, reader_overrides: overrides, reader_modes: modes};
};

const applySnapshot = async (userId, remote) => {
  if (remote.settings && Object.keys(remote.settings).length) {
    await saveReadingSettings(remote.settings);
    if (remote.settings.language) await setAppLanguage(remote.settings.language);
  }
  const previousKey = LAST_SCOPES + String(userId);
  const previous = parse(await AsyncStorage.getItem(previousKey), {appearance: [], modes: []});
  const appearances = remote.reader_overrides || {};
  const modes = remote.reader_modes || {};
  for (const scope of previous.appearance || []) {
    if (!(scope in appearances)) {
      await AsyncStorage.removeItem(accountAppearanceKey(userId, scope));
    }
  }
  for (const [scope, appearance] of Object.entries(appearances)) {
    await AsyncStorage.setItem(accountAppearanceKey(userId, scope), JSON.stringify({
      ...appearance, __explicitOverride: true,
    }));
  }
  for (const scope of previous.modes || []) {
    if (!(scope in modes)) await AsyncStorage.removeItem(getAccountReaderModeStorageKey(userId, scope));
  }
  for (const [scope, mode] of Object.entries(modes)) {
    await AsyncStorage.setItem(getAccountReaderModeStorageKey(userId, scope), mode);
  }
  await AsyncStorage.setItem(previousKey, JSON.stringify({
    appearance: Object.keys(appearances), modes: Object.keys(modes),
  }));
};

const syncOnce = async () => {
  const user = await getCachedBackendUser().catch(() => null);
  const token = await getApiToken().catch(() => null);
  if (!user?.id || !token) return {success: false, reason: 'no-user'};
  const id = user.id;
  await writeQueue;
  let remote = await request('GET');
  let pending = await readPending(id);
  const cloudIsEmpty = !Object.keys(remote.settings || {}).length &&
    !Object.keys(remote.reader_overrides || {}).length &&
    !Object.keys(remote.reader_modes || {}).length;
  const lastSynced = await AsyncStorage.getItem(LAST_SCOPES + String(id));
  if (cloudIsEmpty) {
    pending = mergePatch(await initialSnapshot(id), pending);
  } else if (!lastSynced) {
    // First login from an older app: import only document preferences absent
    // from the cloud. Never overwrite existing cloud overrides or settings.
    const legacy = await initialSnapshot(id);
    const missingOverrides = Object.fromEntries(
      Object.entries(legacy.reader_overrides).filter(([scope]) =>
        !Object.prototype.hasOwnProperty.call(remote.reader_overrides || {}, scope))
    );
    const missingModes = Object.fromEntries(
      Object.entries(legacy.reader_modes).filter(([scope]) =>
        !Object.prototype.hasOwnProperty.call(remote.reader_modes || {}, scope))
    );
    pending = mergePatch({
      reader_overrides: missingOverrides,
      reader_modes: missingModes,
    }, pending);
  }
  if (Object.keys(pending).length) {
    remote = await request('PATCH', pending);
    await writeQueue;
    const latest = await readPending(id);
    const remaining = {};
    for (const section of SECTIONS) {
      const items = latest[section] || {};
      const newer = Object.fromEntries(Object.entries(items).filter(
        ([key, value]) => JSON.stringify(pending[section]?.[key]) !== JSON.stringify(value)
      ));
      if (Object.keys(newer).length) remaining[section] = newer;
    }
    if (Object.keys(remaining).length) {
      await AsyncStorage.setItem(pendingKey(id), JSON.stringify(remaining));
      // New unsent updates are in local UI. Do not clobber them with remote.
      return {success: true, pending: true};
    }
    await AsyncStorage.removeItem(pendingKey(id));
  }
  await applySnapshot(id, remote);
  return {success: true};
};

export const syncAccountPreferences = () => {
  if (running) return running;
  running = syncOnce().finally(() => { running = null; });
  return running;
};
