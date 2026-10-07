import {API_BASE_URL} from './backendAuth';
import {
  getCurrentBibleContentVersion,
  hydrateBibleContent,
  saveSyncedBibleContent,
} from './bibleStore';

const syncPromises = new Map();

const normalizeVersion = (value) =>
  String(value || '')
    .trim()
    .replace(/^W\//, '')
    .replace(/^"|"$/g, '');

const readError = async (response) => {
  try {
    const data = await response.json();
    return data?.detail || data?.error || '';
  } catch {
    return '';
  }
};

const runBibleContentSync = async (translationCode = 'rst') => {
  const code = String(translationCode || 'rst').trim() || 'rst';

  await hydrateBibleContent(code);

  const currentVersion = normalizeVersion(
    getCurrentBibleContentVersion(code)
  );
  const headers = {};

  if (currentVersion) {
    headers['If-None-Match'] = `"${currentVersion}"`;
  }

  const response = await fetch(
    `${API_BASE_URL}/api/bible-content/?translation=${encodeURIComponent(code)}`,
    {
      method: 'GET',
      headers,
    }
  );

  if (response.status === 304) {
    return {
      success: true,
      updated: false,
      version: currentVersion,
      translation: code,
    };
  }

  if (!response.ok) {
    const detail = await readError(response);

    throw new Error(
      detail || `Ошибка обновления Библии: ${response.status}`
    );
  }

  const payload = await response.json();
  const responseVersion = normalizeVersion(
    response.headers.get('etag') || payload?.content_version
  );

  if (
    currentVersion &&
    responseVersion &&
    currentVersion === responseVersion
  ) {
    return {
      success: true,
      updated: false,
      version: responseVersion,
      translation: code,
    };
  }

  await saveSyncedBibleContent(payload, responseVersion);

  return {
    success: true,
    updated: true,
    version: responseVersion,
    translation: code,
  };
};

export const syncBibleContent = async (translationCode = 'rst') => {
  const code = String(translationCode || 'rst').trim() || 'rst';

  if (syncPromises.has(code)) {
    return syncPromises.get(code);
  }

  const promise = runBibleContentSync(code)
    .catch((error) => ({
      success: false,
      updated: false,
      translation: code,
      error,
    }))
    .finally(() => {
      syncPromises.delete(code);
    });

  syncPromises.set(code, promise);

  return promise;
};
