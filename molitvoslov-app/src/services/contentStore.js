import {getDatabase} from '../db/database';

const bundledContent = require('../data/offlineContent.json');

const CACHE_KEY = 'public-content-v1';

let currentContent = bundledContent;
let currentVersion = null;
let generation = 0;
let hydrated = false;
let hydratePromise = null;

const listeners = new Set();

const isValidContent = (payload) =>
  Number(payload?.schema_version || 0) >= 1 &&
  payload?.categories &&
  payload?.texts &&
  payload?.prayer_rules &&
  payload?.akathists &&
  payload?.canons;

const activateContent = (payload, version, {notify = true} = {}) => {
  if (!isValidContent(payload)) {
    return false;
  }

  currentContent = payload;
  currentVersion = version || payload.content_version || null;
  generation += 1;

  if (notify) {
    listeners.forEach((listener) => {
      try {
        listener({
          version: currentVersion,
          generation,
        });
      } catch (error) {
        console.log('Ошибка слушателя обновления контента:', error?.message || error);
      }
    });
  }

  return true;
};

// PUBLIC_CONTENT_BUNDLED_ONLY_V1
// The APK's complete offlineContent.json is authoritative in dev and release.
// A previously installed SQLite cache (including old OTA data) must NEVER
// silently supersede the contents of a new APK.
export const hydratePublicContent = async () => {
  const bundledVersion = String(bundledContent?.content_version || '');
  if (!isValidContent(bundledContent) || !bundledVersion) {
    throw new Error('Некорректный комплект offlineContent.json в APK');
  }

  if (hydrated) {
    return {success: true, source: 'bundle', version: bundledVersion};
  }
  if (hydratePromise) return hydratePromise;

  hydratePromise = (async () => {
    // Upgrade only the PUBLIC cache; do not touch saved_items, progress,
    // personal_prayers, memorials or other user-owned SQLite tables.
    try {
      const db = await getDatabase();
      const row = await db.getFirstAsync(
        'SELECT version FROM public_content_cache WHERE cache_key = ?',
        [CACHE_KEY]
      );
      if (row?.version !== bundledVersion) {
        const now = new Date().toISOString();
        await db.withExclusiveTransactionAsync(async (tx) => {
          await tx.runAsync(
            `INSERT INTO public_content_cache (cache_key, version, payload, updated_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(cache_key) DO UPDATE SET
               version=excluded.version,
               payload=excluded.payload,
               updated_at=excluded.updated_at`,
            [CACHE_KEY, bundledVersion, JSON.stringify(bundledContent), now]
          );
        });
        console.log('[offline] APK public content installed:', bundledVersion);
      }
    } catch (error) {
      // Even when SQLite is unavailable, the bundled APK content stays readable.
      console.warn('[offline] Failed to persist APK public snapshot:', error?.message || error);
    }
    activateContent(bundledContent, bundledVersion, {notify: false});
    hydrated = true;
    return {success: true, source: 'bundle', version: bundledVersion};
  })();

  try {
    return await hydratePromise;
  } finally {
    hydratePromise = null;
  }
};

export const saveSyncedPublicContent = async (payload, version) => {
  if (!isValidContent(payload)) {
    throw new Error('Сервер вернул некорректный пакет публичного контента');
  }

  const db = await getDatabase();
  const resolvedVersion = version || payload.content_version || null;
  const serialized = JSON.stringify(payload);
  const now = new Date().toISOString();

  await db.runAsync(
    `
      INSERT INTO public_content_cache (
        cache_key,
        version,
        payload,
        updated_at
      )
      VALUES (?, ?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET
        version = excluded.version,
        payload = excluded.payload,
        updated_at = excluded.updated_at
    `,
    [CACHE_KEY, resolvedVersion, serialized, now]
  );

  activateContent(payload, resolvedVersion);

  return {
    success: true,
    version: resolvedVersion,
  };
};

export const getCurrentContent = () => currentContent;

export const getCurrentContentVersion = () => currentVersion;

export const getContentGeneration = () => generation;

export const subscribeToContentUpdates = (listener) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

// Activate a snapshot already committed with the delta cursor in SQLite.
export const activateCommittedPublicContent = (payload, version) => {
  if (!activateContent(payload, version)) throw new Error('Invalid committed public content');
};
