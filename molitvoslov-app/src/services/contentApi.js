import {getDailyQuote} from './dailyQuote';

const bundledContent = require('../data/offlineContent.json');

const bundleReady =
  Number(bundledContent?.schema_version || 0) >= 1 &&
  !!bundledContent?.generated_at;

const response = data => ({data});

const notFound = path => {
  const error = new Error(`Офлайн-контент не найден: ${path}`);
  error.response = {
    status: 404,
    data: {detail: 'Контент не найден в офлайн-базе'},
  };
  return error;
};

const normalizePath = path =>
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

const getDateOrdinal = date => {
  const utcDays = Math.floor(
    Date.UTC(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    ) / 86400000
  );

  // Python date(1970, 1, 1).toordinal() === 719163.
  return utcDays + 719163;
};


const getLocal = rawPath => {
  const path = normalizePath(rawPath);

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
    return bundledContent.akathists?.list || [];
  }

  match = path.match(/^akathists\/([^/]+)\/$/);
  if (match) {
    const item = bundledContent.akathists?.by_slug?.[match[1]];
    if (!item) throw notFound(path);
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
  get: async path => {
    if (!bundleReady) {
      throw new Error(
        'Офлайн-контент не собран. Запустите export_mobile_content.'
      );
    }

    return response(getLocal(path));
  },
};

export const isOfflineContentReady = () => bundleReady;

export const getOfflineContentInfo = () => ({
  ready: bundleReady,
  schemaVersion: Number(bundledContent?.schema_version || 0),
  generatedAt: bundledContent?.generated_at || null,
});
