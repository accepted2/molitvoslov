import {getDatabase} from '../db/database';
import {getCurrentContent} from './contentStore';
import {getCurrentBibleContent} from './bibleStore';
import {buildSearchIndexAsync, normalizeSearchText, SEARCH_GROUPS} from './searchIndex';

const SCHEMA = '2';
let initialization = null;
const buildsByLanguage = new Map();
let enabled = null;

const delay = () => new Promise((resolve) => setTimeout(resolve, 0));
const versionFor = (language) => {
  const content = getCurrentContent() || {};
  const bible = getCurrentBibleContent('rst') || {};
  return [SCHEMA, language, content.content_version || content.generated_at || 'bundle-public',
    bible.content_version || bible.generated_at || 'bundle-bible'].join(':');
};

export const preparePersistentSearch = async () => {
  if (enabled === false) return false;
  if (!initialization) {
    initialization = (async () => {
      const db = await getDatabase();
      const available = await db.getFirstAsync('SELECT sqlite_compileoption_used(?) AS available', ['ENABLE_FTS5']);
      // Expo SQLite generally includes FTS5. Fall back to the existing search if it does not.
      if (!available?.available) {
        enabled = false;
        return false;
      }
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS search_metadata (
          language TEXT PRIMARY KEY, version TEXT NOT NULL
        );
        CREATE VIRTUAL TABLE IF NOT EXISTS search_documents USING fts5(
          id UNINDEXED, language UNINDEXED, group_key UNINDEXED,
          payload UNINDEXED, normalized, tokenize='unicode61 remove_diacritics 2'
        );
      `);
      enabled = true;
      return true;
    })().catch((error) => {
      initialization = null;
      enabled = false;
      console.warn('SQLite search unavailable:', error?.message || error);
      return false;
    });
  }
  return initialization;
};

export const isPersistentSearchReady = async (language = 'ru') => {
  if (!(await preparePersistentSearch())) return false;
  const db = await getDatabase();
  const row = await db.getFirstAsync('SELECT version FROM search_metadata WHERE language = ?', [language]);
  return row?.version === versionFor(language);
};

const ftsTokens = (query) => normalizeSearchText(query).split(' ').filter((word) => word.length >= 2);
// Parameterized FTS5 syntax: each token is quoted and matched by prefix.
const ftsQuery = (query) => ftsTokens(query).map((word) => '"' + word.replace(/"/g, '""') + '"*').join(' AND ');

export const searchPersistent = async (language, query, group = SEARCH_GROUPS.ALL, limit = 120) => {
  if (!(await isPersistentSearchReady(language))) return null;
  if (!ftsQuery(query)) return {items: [], total: 0};
  const db = await getDatabase();
  const where = group === SEARCH_GROUPS.ALL
    ? 'language = ? AND search_documents MATCH ?'
    : 'language = ? AND group_key = ? AND search_documents MATCH ?';
  const args = group === SEARCH_GROUPS.ALL
    ? [language, ftsQuery(query)]
    : [language, group, ftsQuery(query)];
  const count = await db.getFirstAsync('SELECT count(*) AS n FROM search_documents WHERE ' + where, args);
  const rows = await db.getAllAsync(
    'SELECT payload FROM search_documents WHERE ' + where +
      ' ORDER BY bm25(search_documents) LIMIT ?',
    [...args, limit]
  );
  return {items: rows.map((row) => JSON.parse(row.payload)), total: count?.n || 0};
};

export const ensurePersistentSearch = async (language = 'ru', {isCancelled = () => false, onProgress = () => {}} = {}) => {
  if (!(await preparePersistentSearch())) return false;
  if (await isPersistentSearchReady(language)) return true;
  if (buildsByLanguage.has(language)) return buildsByLanguage.get(language);

  const building = (async () => {
    const version = versionFor(language);
    const entries = await buildSearchIndexAsync(language, {isCancelled, onProgress: () => {}});
    if (!entries || isCancelled()) return false;
    const bible = getCurrentBibleContent('rst') || {};
    const db = await getDatabase();
    // Only publish the new version after every record has been written.
    // The previous successful index remains usable until this transaction commits.
    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM search_documents WHERE language = ?', [language]);
      await db.runAsync('DELETE FROM search_metadata WHERE language = ?', [language]);
    });
    let batch = [];
    const flush = async () => {
      if (!batch.length) return;
      const current = batch;
      batch = [];
      await db.withTransactionAsync(async () => {
        const statement = await db.prepareAsync(
          'INSERT INTO search_documents(id, language, group_key, payload, normalized) VALUES (?, ?, ?, ?, ?)'
        );
        try {
          for (const row of current) await statement.executeAsync(row);
        } finally {
          await statement.finalizeAsync();
        }
      });
      await delay();
    };

    const add = async (entry) => {
      const searchable = [entry.titleNormalized, entry.sourceNormalized,
        ...(entry.fields || []).map((f) => f.normalized)].filter(Boolean).join(' ');
      batch.push([String(entry.id), language, entry.group, JSON.stringify(entry), searchable]);
      if (batch.length >= 150) await flush();
    };

    for (const entry of entries) {
      if (isCancelled()) return false;
      await add(entry);
    }

    // Bible verses were previously built from scratch on every app process.
    for (const book of bible.books || []) {
      const bookName = book.name || book.short_name || '';
      for (const chapter of book.chapters || []) {
        for (const verse of chapter.verses || []) {
          if (isCancelled()) return false;
          const title = bookName + ' ' + chapter.number + ':' + verse.number;
          const text = String(verse.text || '');
          const entry = {
            id: 'bible:' + book.id + ':' + chapter.id + ':' + verse.id,
            group: SEARCH_GROUPS.SCRIPTURE,
            kind: 'bible-verse', title,
            source: 'Писание', snippet: text.slice(0, 190),
            matchedLanguage: 'russian', matchedLanguageLabel: 'Рус.',
            groupLabel: 'Писание', score: 150,
            route: {name: 'BibleChapter', params: {
              bookId: Number(book.id), chapterNumber: Number(chapter.number), resume: false,
              focusTarget: {save_type: 'fragment', anchor_type: 'bible_verse',
                anchor_id: Number(verse.id), start_offset: null, end_offset: null,
                metadata: {book_id: Number(book.id), book_slug: book.slug,
                  chapter_number: Number(chapter.number), verse_number: Number(verse.number)}}
            }},
            titleNormalized: normalizeSearchText(title),
            fields: [{normalized: normalizeSearchText(text)}],
          };
          await add(entry);
        }
      }
      onProgress({book: bookName});
    }
    await flush();
    if (isCancelled() || version !== versionFor(language)) return false;
    await db.runAsync('INSERT OR REPLACE INTO search_metadata(language, version) VALUES (?, ?)', [language, version]);
    return true;
  })().catch((error) => {
    console.warn('Persistent search indexing failed:', error?.message || error);
    return false;
  }).finally(() => { buildsByLanguage.delete(language); });

  buildsByLanguage.set(language, building);
  return building;
};
