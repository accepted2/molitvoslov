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

export const hydratePublicContent = async () => {
  if (hydrated) {
    return {
      success: true,
      source: currentVersion ? 'cache' : 'bundle',
      version: currentVersion,
    };
  }

  if (hydratePromise) {
    return hydratePromise;
  }

  hydratePromise = (async () => {
    try {
      const db = await getDatabase();
      const row = await db.getFirstAsync(
        `
          SELECT version, payload
          FROM public_content_cache
          WHERE cache_key = ?
          LIMIT 1
        `,
        [CACHE_KEY]
      );

      if (row?.payload) {
        const parsed = JSON.parse(row.payload);

        if (activateContent(parsed, row.version, {notify: false})) {
          hydrated = true;
          return {
            success: true,
            source: 'cache',
            version: currentVersion,
          };
        }
      }
    } catch (error) {
      console.log('Не удалось прочитать локальный публичный контент:', error?.message || error);
    }

    hydrated = true;

    return {
      success: true,
      source: 'bundle',
      version: null,
    };
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
