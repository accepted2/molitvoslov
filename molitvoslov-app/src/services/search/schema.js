export const SEARCH_SCHEMA_VERSION = '8';
export const SEARCH_GROUPS = Object.freeze({
  ALL: 'all', PRAYERS: 'prayers', SCRIPTURE: 'scripture',
  PSALTER: 'psalter', AKATHISTS: 'akathists', CANONS: 'canons',
});
export const CREATE_SCHEMA_SQL = `
CREATE VIRTUAL TABLE IF NOT EXISTS search_documents USING fts5(
  title, source, body,
  tokenize='unicode61 remove_diacritics 2',
  detail='full', columnsize=0, content=''
);
CREATE TABLE IF NOT EXISTS search_payloads (
  rowid INTEGER PRIMARY KEY,
  language TEXT NOT NULL,
  group_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  boost REAL NOT NULL DEFAULT 1.0,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS search_payloads_lang_group ON search_payloads(language, group_key);
CREATE TABLE IF NOT EXISTS search_metadata (language TEXT PRIMARY KEY, version TEXT NOT NULL);
`;