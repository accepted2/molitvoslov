import {API_BASE_URL} from './backendAuth';
import {
  getCurrentContentVersion,
  hydratePublicContent,
  saveSyncedPublicContent,
} from './contentStore';

let publicContentSyncPromise = null;

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

const runPublicContentSync = async () => {
  await hydratePublicContent();

  const currentVersion = normalizeVersion(getCurrentContentVersion());
  const headers = {};

  if (currentVersion) {
    headers['If-None-Match'] = `"${currentVersion}"`;
  }

  const response = await fetch(`${API_BASE_URL}/api/mobile-content/`, {
    method: 'GET',
    headers,
  });

  if (response.status === 304) {
    return {
      success: true,
      updated: false,
      version: currentVersion,
    };
  }

  if (!response.ok) {
    const detail = await readError(response);
    throw new Error(detail || `Ошибка обновления контента: ${response.status}`);
  }

  const payload = await response.json();
  const responseVersion = normalizeVersion(
    response.headers.get('etag') || payload?.content_version
  );

  if (currentVersion && responseVersion && currentVersion === responseVersion) {
    return {
      success: true,
      updated: false,
      version: responseVersion,
    };
  }

  await saveSyncedPublicContent(payload, responseVersion);

  return {
    success: true,
    updated: true,
    version: responseVersion,
  };
};

export const syncPublicContent = async () => {
  if (publicContentSyncPromise) {
    return publicContentSyncPromise;
  }

  publicContentSyncPromise = runPublicContentSync()
    .catch((error) => ({
      success: false,
      updated: false,
      error,
    }))
    .finally(() => {
      publicContentSyncPromise = null;
    });

  return publicContentSyncPromise;
};
