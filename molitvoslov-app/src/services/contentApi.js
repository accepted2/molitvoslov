import bundledBaseline from '../data/offlineContent.json';
import {getDailyQuote} from './dailyQuote';
import {isCuratedAkathist} from '../data/curatedAkathists';
import {getCurrentContent} from './contentStore';
import {API_BASE_URL} from './backendAuth';

const baselineAkathistSlugs = new Set(Object.keys(bundledBaseline?.akathists?.by_slug || {}));
const isVisibleAkathist = (item) => !!item && (isCuratedAkathist(item) || (!!item.slug && !baselineAkathistSlugs.has(String(item.slug))));

const response = (data) => ({data});

// Until the prayer rules have been finalized in Django, use the current
// local SQLite-backed API in development. Production stays fully offline.
// Set EXPO_PUBLIC_PRAYER_RULES_SOURCE=offline to use the bundled JSON in dev.
const useLivePrayerRules = () =>
  __DEV__ && process.env.EXPO_PUBLIC_PRAYER_RULES_SOURCE !== 'offline';

const isPrayerRulePath = (path) =>
  path === 'prayer-rules/' || /^prayer-rules\/[^/]+\/$/.test(path);

const getLivePrayerRule = async (path) => {
  const url = `${API_BASE_URL}/api/${path}`;
  let result;

  try {
    result = await fetch(url, {
      method: 'GET',
      headers: {Accept: 'application/json', 'Cache-Control': 'no-cache'},
    });
  } catch (error) {
    throw new Error(
      `Локальный Django недоступен (${url}). Проверьте, что runserver запущен ` +
        `и эмулятор подключён к порту 8000. ${error?.message || ''}`
    );
  }

  if (!result.ok) {
    throw new Error(
      `Локальный Django вернул HTTP ${result.status} (${url}). ` +
        'Проверьте, что правило опубликовано и новые молитвы привязаны к нему.'
    );
  }

  try {
    return response(await result.json());
  } catch (error) {
    throw new Error(
      `Django вернул некорректный JSON для молитвенного правила (${url}): ` +
        (error?.message || String(error))
    );
  }
};

const notFound = (path) => {
  const error = new Error(`Офлайн-контент не найден: ${path}`);
  error.response = {
    status: 404,
    data: {detail: 'Контент не найден в офлайн-базе'},
  };
  return error;
};

const normalizePath = (path) =>
  String(path || '')
    .replace(/^\/+/, '')
    .replace(/\?.*$/, '');

const getTodayString = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDateOrdinal = (date) => {
  const utcDays = Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000
  );

  // Python date(1970, 1, 1).toordinal() === 719163.
  return utcDays + 719163;
};

const getLocal = (rawPath) => {
  const path = normalizePath(rawPath);
  const bundledContent = getCurrentContent();

  if (path === 'categories/') {
    return bundledContent.categories || [];
  }

  let match = path.match(/^categories\/([^/]+)\/texts\/$/);
  if (match) {
    return bundledContent.category_texts?.[match[1]] || [];
  }

  match = path.match(/^texts\/([^/]+)\/$/);
  if (match) {
    const item = bundledContent.texts?.[match[1]];
    if (!item) throw notFound(path);
    return item;
  }

  if (path === 'prayer-rules/') {
    return bundledContent.prayer_rules?.list || [];
  }

  match = path.match(/^prayer-rules\/([^/]+)\/$/);
  if (match) {
    const item = bundledContent.prayer_rules?.by_slug?.[match[1]];
    if (!item) throw notFound(path);
    return item;
  }

  match = path.match(/^psalters\/([^/]+)\/$/);
  if (match) {
    const item = bundledContent.psalters?.by_slug?.[match[1]];
    if (!item) throw notFound(path);
    return item;
  }

  match = path.match(/^kathismas\/(\d+)\/$/);
  if (match) {
    const item = bundledContent.kathismas?.by_number?.[match[1]];
    if (!item) throw notFound(path);
    return item;
  }

  if (path === 'akathists/') {
    return (bundledContent.akathists?.list || []).filter(isVisibleAkathist);
  }

  match = path.match(/^akathists\/([^/]+)\/$/);
  if (match) {
    const item = bundledContent.akathists?.by_slug?.[match[1]];

    if (!item || !isVisibleAkathist(item)) {
      throw notFound(path);
    }

    return item;
  }

  if (path === 'canons/') {
    return bundledContent.canons?.list || [];
  }

  match = path.match(/^canons\/([^/]+)\/$/);
  if (match) {
    const item = bundledContent.canons?.by_slug?.[match[1]];
    if (!item) throw notFound(path);
    return item;
  }

  if (path === 'daily-quotes/today/') {
    return getDailyQuote();
  }

  throw notFound(path);
};

export const contentApi = {
  get: async (path) => {
    const normalizedPath = normalizePath(path);

    if (useLivePrayerRules() && isPrayerRulePath(normalizedPath)) {
      // No fallback to an outdated JSON: it would hide missing local edits.
      return getLivePrayerRule(normalizedPath);
    }

    const content = getCurrentContent();
    const ready = Number(content?.schema_version || 0) >= 1 && !!content?.generated_at;

    if (!ready) {
      throw new Error('Офлайн-контент не собран. Запустите export_mobile_content.');
    }

    return response(getLocal(path));
  },
};

export const isOfflineContentReady = () => {
  const content = getCurrentContent();
  return Number(content?.schema_version || 0) >= 1 && !!content?.generated_at;
};

export const getOfflineContentInfo = () => {
  const content = getCurrentContent();

  return {
    ready: Number(content?.schema_version || 0) >= 1 && !!content?.generated_at,
    schemaVersion: Number(content?.schema_version || 0),
    generatedAt: content?.generated_at || null,
    contentVersion: content?.content_version || null,
  };
};
