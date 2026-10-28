// Схема поисковой базы. Базу СОЗДАЁТ tools/build_search_seed.py на компьютере
// и кладёт в APK; на телефоне таблицы корпуса не создаются и не заполняются.
export const SEARCH_SCHEMA_VERSION = '10';
export const SEARCH_GROUPS = Object.freeze({
  ALL: 'all', CALENDAR: 'calendar', PRAYERS: 'prayers', SCRIPTURE: 'scripture',
  PSALTER: 'psalter', AKATHISTS: 'akathists', CANONS: 'canons',
});

// Единственное, что допускается создавать на устройстве: крошечная отдельная база
// OTA-дополнений (см. overlay.js). Основной индекс она не затрагивает.
export const OVERLAY_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS ota_doc(
  id INTEGER PRIMARY KEY AUTOINCREMENT, ext TEXT NOT NULL, lang TEXT NOT NULL DEFAULT '',
  grp TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, title_uk TEXT,
  nt TEXT, ntu TEXT, src INTEGER, srctxt TEXT, tpl INTEGER, args TEXT, fid INTEGER,
  body TEXT NOT NULL DEFAULT '', bl TEXT NOT NULL DEFAULT '', wc INTEGER NOT NULL DEFAULT 0,
  boost REAL NOT NULL DEFAULT 1.0, route TEXT NOT NULL, UNIQUE(ext, lang));
CREATE INDEX IF NOT EXISTS ota_doc_nt ON ota_doc(nt);
CREATE VIRTUAL TABLE IF NOT EXISTS ota_fts USING fts5(title, source, body,
  tokenize='unicode61 remove_diacritics 0');
CREATE TABLE IF NOT EXISTS ota_meta(k TEXT PRIMARY KEY, v TEXT NOT NULL);
`;
