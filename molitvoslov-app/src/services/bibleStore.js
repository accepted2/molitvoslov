import bundledBible from '../data/offlineBible.json';
import {getDatabase} from '../db/database';

const CACHE_PREFIX = 'bible-content-v1:';

const bundledCode = String(bundledBible?.translation?.code || 'rst');

const currentByCode = new Map([[bundledCode, bundledBible]]);
const versionByCode = new Map([[bundledCode, bundledBible?.content_version || null]]);

let generation = 0;
const listeners = new Set();

const isValidBibleContent = (payload, expectedCode = null) => {
  const code = String(payload?.translation?.code || '');

  return (
    Number(payload?.schema_version || 0) >= 1 &&
    !!code &&
    Array.isArray(payload?.books) &&
    (!expectedCode || code === expectedCode)
  );
};

const activateBibleContent = (payload, version, {notify = true} = {}) => {
  const code = String(payload?.translation?.code || '');

  if (!isValidBibleContent(payload, code)) {
    return false;
  }

  currentByCode.set(code, payload);
  versionByCode.set(code, version || payload.content_version || null);
  generation += 1;

  if (notify) {
    listeners.forEach((listener) => {
      try {
        listener({
          code,
          version: versionByCode.get(code) || null,
          generation,
        });
      } catch (error) {
        console.log('Ошибка слушателя обновления Библии:', error?.message || error);
      }
    });
  }

  return true;
};

export const hydrateBibleContent = async (code = 'rst') => {
  const normalizedCode = String(code || 'rst').trim() || 'rst';

  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync(
      `
        SELECT version, payload
        FROM public_content_cache
        WHERE cache_key = ?
        LIMIT 1
      `,
      [CACHE_PREFIX + normalizedCode]
    );

    if (row?.payload) {
      const parsed = JSON.parse(row.payload);

      if (
        isValidBibleContent(parsed, normalizedCode) &&
        activateBibleContent(parsed, row.version, {notify: false})
      ) {
        return {
          success: true,
          source: 'cache',
          version: row.version || parsed.content_version || null,
        };
      }
    }
  } catch (error) {
    console.log('Не удалось прочитать локальный кэш Библии:', error?.message || error);
  }

  return {
    success: true,
    source: normalizedCode === bundledCode ? 'bundle' : 'none',
    version: versionByCode.get(normalizedCode) || null,
  };
};

export const saveSyncedBibleContent = async (payload, version) => {
  const code = String(payload?.translation?.code || '');

  if (!isValidBibleContent(payload, code)) {
    throw new Error('Сервер вернул некорректный пакет Библии');
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
    [CACHE_PREFIX + code, resolvedVersion, serialized, now]
  );

  activateBibleContent(payload, resolvedVersion);

  return {
    success: true,
    version: resolvedVersion,
  };
};

export const getCurrentBibleContent = (code = 'rst') => {
  const normalizedCode = String(code || 'rst').trim() || 'rst';

  if (currentByCode.has(normalizedCode)) {
    return currentByCode.get(normalizedCode);
  }

  return normalizedCode === bundledCode ? bundledBible : null;
};

export const getCurrentBibleContentVersion = (code = 'rst') =>
  versionByCode.get(String(code || 'rst').trim() || 'rst') || null;

export const getBibleContentGeneration = () => generation;

export const subscribeToBibleContentUpdates = (listener) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};
