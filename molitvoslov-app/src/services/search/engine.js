import {getDatabase} from '../../db/database';
import {getCurrentContent} from '../contentStore';
import {getCurrentBibleContent} from '../bibleStore';
import {buildSearchIndexAsync} from '../searchIndex';
import {normalizeSearchText} from './normalize';
import {tokenizeQuery, buildPhraseQuery, buildAndQuery} from './query';
import {SEARCH_SCHEMA_VERSION, SEARCH_GROUPS, CREATE_SCHEMA_SQL} from './schema';

const BM25_WEIGHTS = '10.0, 4.0, 1.0';
const buildsByLanguage = new Map();
let initialization = null;
const delay = () => new Promise((resolve) => setTimeout(resolve, 0));

export const versionFor = (language) => {
  const content = getCurrentContent() || {};
  const bible = getCurrentBibleContent('rst') || {};
  return [SEARCH_SCHEMA_VERSION, language,
    content.content_version || content.generated_at || 'bundle-public',
    bible.content_version || bible.generated_at || 'bundle-bible'].join(':');
};

export const preparePersistentSearch = async (database = null) => {
  if (database) return true;
  if (!initialization) {
    initialization = (async () => {
      const db = await getDatabase();
      const option = await db.getFirstAsync(
        'SELECT sqlite_compileoption_used(?) AS available', ['ENABLE_FTS5']
      );
      if (!option?.available) return false;
      // A previous on-device v7 index uses a different FTS table shape.
      const columns = await db.getAllAsync('PRAGMA table_info(search_documents)');
      if (columns.length && !columns.some((column) => column.name === 'body')) {
        await db.execAsync('DROP TABLE IF EXISTS search_documents; DROP TABLE IF EXISTS search_payloads; DROP TABLE IF EXISTS search_metadata;');
      }
      await db.execAsync(CREATE_SCHEMA_SQL);
      return true;
    })().catch((error) => {
      initialization = null;
      console.warn('SQLite search unavailable:', error?.message || error);
      return false;
    });
  }
  return initialization;
};

export const isPersistentSearchReady = async (language = 'ru', database = null) => {
  if (!(await preparePersistentSearch(database))) return false;
  const db = database || await getDatabase();
  try {
    const row = await db.getFirstAsync('SELECT version FROM search_metadata WHERE language = ?', [language]);
    return row?.version === versionFor(language);
  } catch {
    return false;
  }
};

const runMatch = async (db, language, group, match, limit, offset) => {
  const where = group === SEARCH_GROUPS.ALL
    ? 'p.language = ? AND search_documents MATCH ?'
    : 'p.language = ? AND p.group_key = ? AND search_documents MATCH ?';
  const args = group === SEARCH_GROUPS.ALL ? [language, match] : [language, group, match];
  const count = await db.getFirstAsync(
    'SELECT count(*) AS n FROM search_documents JOIN search_payloads AS p ' +
    'ON p.rowid = search_documents.rowid WHERE ' + where, args
  );
  const total = count?.n || 0;
  if (!total) return {total: 0, rows: []};
  const rows = await db.getAllAsync(
    'SELECT p.payload AS payload, p.boost AS boost, bm25(search_documents, ' +
    BM25_WEIGHTS + ') AS rank FROM search_documents JOIN search_payloads AS p ' +
    'ON p.rowid = search_documents.rowid WHERE ' + where +
    ' ORDER BY rank ASC LIMIT ? OFFSET ?', [...args, Math.min(limit * 2 + 20, 500), offset]
  );
  return {total, rows};
};

export const searchPersistent = async (
  language, query, group = SEARCH_GROUPS.ALL, limit = 120, offset = 0, database = null
) => {
  const words = tokenizeQuery(query);
  if (!words.length) return {items: [], total: 0, hasMore: false};
  if (!(await isPersistentSearchReady(language, database))) {
    return {items: [], total: 0, hasMore: false, unavailable: true};
  }
  const db = database || await getDatabase();
  let found = await runMatch(db, language, group, buildPhraseQuery(words), limit, offset);
  if (!found.total && words.length > 1) {
    found = await runMatch(db, language, group, buildAndQuery(words), limit, offset);
  }
  const sorted = found.rows.map((row) => ({
    ...row, sortKey: row.rank / (row.boost || 1),
  })).sort((a, b) => a.sortKey - b.sortKey).slice(0, limit);
  return {items: sorted.map((row) => JSON.parse(row.payload)),
    total: found.total, hasMore: offset + sorted.length < found.total};
};

const addEntry = async (db, entry, language) => {
  const payload = {
    id: entry.id, group: entry.group, kind: entry.kind || 'text',
    title: entry.title || '', source: entry.source || '',
    snippet: entry.snippet || entry.preview || '', route: entry.route,
    groupLabel: entry.groupLabel || entry.group, matchedLanguageLabel: '',
  };
  const normalizedBody = (entry.fields || []).map((field) =>
    normalizeSearchText(field.normalized || field.text || '')).filter(Boolean).join(' ');
  const result = await db.runAsync(
    'INSERT INTO search_payloads(language,group_key,kind,boost,payload) VALUES(?,?,?,?,?)',
    [language, entry.group, payload.kind, 1.0, JSON.stringify(payload)]
  );
  await db.runAsync(
    'INSERT INTO search_documents(rowid,title,source,body) VALUES(?,?,?,?)',
    [result.lastInsertRowId, normalizeSearchText(entry.title), normalizeSearchText(entry.source), normalizedBody]
  );
};

export const ensurePersistentSearch = async (
  language = 'ru', {isCancelled = () => false, onProgress = () => {}} = {}
) => {
  if (!(await preparePersistentSearch())) return false;
  if (await isPersistentSearchReady(language)) return true;
  if (buildsByLanguage.has(language)) return buildsByLanguage.get(language);
  const job = (async () => {
    const version = versionFor(language);
    const entries = await buildSearchIndexAsync(language, {isCancelled, onProgress: () => {}});
    if (!entries || isCancelled()) return false;
    const db = await getDatabase();
    await db.runAsync('DELETE FROM search_metadata WHERE language = ?', [language]);
    // A full rebuild is simpler and safe for a contentless FTS5 index.
    // Never mix index versions or leave orphaned FTS rows.
    await db.execAsync("INSERT INTO search_documents(search_documents) VALUES('delete-all');");
    await db.runAsync('DELETE FROM search_payloads');
    await db.runAsync('DELETE FROM search_metadata');
    let batch = [];
    const flush = async () => {
      const rows = batch; batch = [];
      if (!rows.length) return;
      await db.withTransactionAsync(async () => {
        for (const entry of rows) await addEntry(db, entry, language);
      });
      await delay();
    };
    for (const entry of entries) {
      if (isCancelled()) return false;
      batch.push(entry);
      if (batch.length >= 150) await flush();
    }
    const bible = getCurrentBibleContent('rst') || {};
    for (const book of bible.books || []) {
      for (const chapter of book.chapters || []) {
        for (const verse of chapter.verses || []) {
          if (isCancelled()) return false;
          batch.push({
            id: 'bible:' + book.id + ':' + chapter.id + ':' + verse.id,
            group: SEARCH_GROUPS.SCRIPTURE, kind: 'bible-verse',
            title: (book.name || book.short_name || '') + ' ' + chapter.number + ':' + verse.number,
            source: 'Писание', snippet: String(verse.text || '').slice(0, 190),
            route: {name: 'BibleChapter', params: {bookId: Number(book.id),
              chapterNumber: Number(chapter.number), resume: false,
              focusTarget: {save_type: 'fragment', anchor_type: 'bible_verse',
                anchor_id: Number(verse.id), start_offset: null, end_offset: null,
                metadata: {book_id: Number(book.id), book_slug: book.slug,
                  chapter_number: Number(chapter.number), verse_number: Number(verse.number)}}}},
            fields: [{normalized: verse.text || ''}],
          });
          if (batch.length >= 150) await flush();
        }
      }
      onProgress({book: book.name || book.short_name || ''});
    }
    await flush();
    if (isCancelled() || version !== versionFor(language)) return false;
    await db.runAsync('INSERT OR REPLACE INTO search_metadata(language,version) VALUES(?,?)', [language, version]);
    return true;
  })().catch((error) => {
    console.warn('Persistent search indexing failed:', error?.message || error);
    return false;
  }).finally(() => { buildsByLanguage.delete(language); });
  buildsByLanguage.set(language, job);
  return job;
};
