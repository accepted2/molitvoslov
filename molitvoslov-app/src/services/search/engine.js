import {getDatabase} from '../../db/database';
import {getCurrentContent} from '../contentStore';
import {getCurrentBibleContent} from '../bibleStore';
import {buildSearchIndexAsync} from '../searchIndex';
import {normalizeSearchText} from './normalize';
import {tokenizeQuery, buildPhraseQuery, buildAndQuery} from './query';
import {SEARCH_SCHEMA_VERSION, SEARCH_GROUPS, CREATE_SCHEMA_SQL} from './schema';

import * as SQLite from 'expo-sqlite';

let searchDb = null;
const getSearchDb = async () => {

  if (searchDb) {
    try {
      // проверка, что handle жив
      await searchDb.getFirstAsync('SELECT 1');
      return searchDb;
    } catch {
      // handle битый — закрыть и переоткрыть
      try { await searchDb.closeAsync(); } catch {}
      searchDb = null;
    }
  }
  searchDb = await SQLite.openDatabaseAsync('molitvoslov_search_seed_v10.db', {
    useNewConnection: true,
  });
  return searchDb;
};

const BM25_WEIGHTS = '10.0, 4.0, 1.0';
const buildsByLanguage = new Map();
let initialization = null;
const delay = () => new Promise((resolve) => setTimeout(resolve, 0));

import bundledContent from '../../data/offlineContent.json';
import bundledBible from '../../data/offlineBible.json';

export const versionFor = (language) => {
  return [
    SEARCH_SCHEMA_VERSION,
    language,
    bundledContent.content_version || bundledContent.generated_at || 'bundle-public',
    bundledBible.content_version || bundledBible.generated_at || 'bundle-bible',
  ].join(':');
};

export const preparePersistentSearch = async (database = null) => {
  if (database) return true;
  if (!initialization) {
    initialization = (async () => {
      console.error('[search] prepare: opening DB');
      const db = await getDatabase();
      console.error('[search] prepare: DB opened');
      const option = await db.getFirstAsync(
        'SELECT sqlite_compileoption_used(?) AS available',
        ['ENABLE_FTS5']
      );
      console.error('[search] prepare: FTS5 =', option?.available);
      if (!option?.available) return false;
      const columns = await db.getAllAsync('PRAGMA table_info(search_documents)');
      if (columns.length && !columns.some((column) => column.name === 'body')) {
        await db.execAsync(
          'DROP TABLE IF EXISTS search_documents; DROP TABLE IF EXISTS search_payloads; DROP TABLE IF EXISTS search_metadata;'
        );
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
  const db = database || (await getSearchDb());
  try {
    const row = await db.getFirstAsync(
      'SELECT version FROM search_metadata WHERE language = ?',
      [language]
    );
    console.error(
      '[search] isReady:',
      'expected =', versionFor(language),
      '| stored =', row?.version,
      '| match =', row?.version === versionFor(language)
    );
    return row?.version === versionFor(language);
  } catch (error) {
    console.error('[search] isReady ERROR:', error?.message || error);
    return false;
  }
};

const runMatch = async (db, language, group, match, limit, offset, titleMatch = null) => {
  const where =
    group === SEARCH_GROUPS.ALL
      ? 'p.language = ? AND search_documents MATCH ?'
      : 'p.language = ? AND p.group_key = ? AND search_documents MATCH ?';
  const args = group === SEARCH_GROUPS.ALL ? [language, match] : [language, group, match];

  let total = null;
  if (group === SEARCH_GROUPS.ALL) {
    const count = await db.getFirstAsync(
      'SELECT count(*) AS n FROM (SELECT 1 FROM search_documents JOIN search_payloads AS p ' +
      'ON p.rowid = search_documents.rowid WHERE ' + where + ' LIMIT 500)',
      args
    );
    total = count?.n || 0;
  } else {
    const t0 = Date.now();
    const ftsRows = await db.getAllAsync(
      'SELECT rowid FROM search_documents WHERE search_documents MATCH ?',
      [match]
    );
    const allRowids = ftsRows.map((r) => r.rowid);
    let countTotal = 0;
    for (let i = 0; i < allRowids.length; i += 900) {
      const chunk = allRowids.slice(i, i + 900);
      const placeholders = chunk.map(() => '?').join(',');
      const count = await db.getFirstAsync(
        'SELECT count(*) AS n FROM search_payloads WHERE rowid IN (' + placeholders + ') AND language = ? AND group_key = ?',
        [...chunk, language, group]
      );
      countTotal += count?.n || 0;
    }
    total = countTotal;
    console.error('[search] timing: group =', group, '| total =', total, '| count =', Date.now() - t0, 'ms | fts =', allRowids.length);
  }
  if (!total) return {total: 0, rows: []};

  const t1 = Date.now();
  // 1) Основной запрос: payload, rank, rowid (без snippet)
  const rows = await db.getAllAsync(
    'SELECT p.payload AS payload, p.boost AS boost, ' +
    'bm25(search_documents, ' + BM25_WEIGHTS + ') AS rank, ' +
    'search_documents.rowid AS rowid ' +
    'FROM search_documents JOIN search_payloads AS p ' +
    'ON p.rowid = search_documents.rowid WHERE ' + where +
    (titleMatch
      ? ' ORDER BY CASE WHEN search_documents.rowid IN ' +
        '(SELECT rowid FROM search_documents WHERE search_documents MATCH ?) THEN 0 ELSE 1 END, rank ASC'
      : ' ORDER BY rank ASC') +
    ' LIMIT ? OFFSET ?',
    [...args, ...(titleMatch ? [titleMatch] : []), Math.min(limit, 500), offset]
  );

  // 2) Snippet отдельно по rowid (FTS без JOIN — snippet вокруг совпадения)
  if (rows.length) {
    const snippets = await db.getAllAsync(
      'SELECT rowid, snippet(search_documents, 2, "[", "]", "...", 38) AS snippet ' +
      'FROM search_documents WHERE search_documents MATCH ?',
      [match]
    );
    const snippetByRowid = new Map(snippets.map((s) => [s.rowid, s.snippet]));
    rows.forEach((r) => {
      const fragment = snippetByRowid.get(r.rowid) || '';
      // Title/source-only matches have no body hit; do not show a misleading preview.
      r.snippet = /\[[^\]]+\]/.test(fragment) ? fragment : null;
    });
  }
  console.error('[search] timing: group =', group, '| rows =', Date.now() - t1, 'ms | rows =', rows.length);
  console.error('[search] runMatch:', 'group =', group, '| row0_snippet_len =', rows[0]?.snippet?.length, '| row0_snippet =', (rows[0]?.snippet || '').slice(0, 80));

  if (total === null) total = rows.length;
  return {total, rows};
};

const detectLanguageFromSnippet = (snippet) => {
  const s = String(snippet || '');
  const hits = s.match(/\[([^\]]+)\]/g);
  if (!hits) return null;

  const joined = hits.map((h) => h.slice(1, -1)).join(' ').toLowerCase();
  if (!joined.trim()) return null;

  if (/[ѣѳѵ]/.test(joined)) return 'church';
  if (/[іїєґ]/.test(joined)) return 'ukrainian';
  if (/[ъь]$/.test(joined.trim())) return 'church';

  return 'russian';
};

const detectLanguageFromQuery = (query) => {
  const q = String(query || '').toLowerCase();
  if (/[ѣѳѵ]/.test(q)) return 'church';
  if (/[іїєґ]/.test(q)) return 'ukrainian';
  return 'russian';
};

const withHighlight = (route, query, snippet, matchedTextLanguage = null) => {
  if (!route?.name || !query) return route;
  const params = route.params || {};
  const existingFocus = params.focusTarget;

  const preferredLanguage = matchedTextLanguage ||
    detectLanguageFromSnippet(snippet) ||
    detectLanguageFromQuery(query);

  const focusTarget = existingFocus
    ? {
      ...existingFocus,
      save_type: existingFocus.save_type || existingFocus.saveType || 'fragment',
      highlightQuery: query,
      preferredLanguage,
    }
    : {
      save_type: 'fragment',
      highlightQuery: query,
      preferredLanguage,
    };

  return {
    ...route,
    params: { ...params, highlightQuery: query, focusTarget },
  };
};

export const searchPersistent = async (
  language,
  query,
  group = SEARCH_GROUPS.ALL,
  limit = 120,
  offset = 0,
  database = null
) => {
  const words = tokenizeQuery(query);
  if (!words.length) return { items: [], total: 0, hasMore: false };
  if (!(await isPersistentSearchReady(language, database))) {
    return { items: [], total: 0, hasMore: false, unavailable: true };
  }
  const db = database || (await getSearchDb());
  // FTS title hits are always ranked ahead of body-only matches.
  const titleMatch = 'title : (' + buildAndQuery(words) + ')';

  if (words.length === 1) {
    const found = await runMatch(db, language, group, buildPhraseQuery(words), limit, offset, titleMatch);
    const first = found.rows[0];
    if (first) {
      const p = JSON.parse(first.payload);
      const ft = withHighlight(p.route, query, p.snippet, p.matchedTextLanguage).params?.focusTarget;
      console.warn('[search] FT(single) =', JSON.stringify(ft));
    }
    return {
      items: found.rows.map((row) => {
        const p = JSON.parse(row.payload);
        const snippet = row.snippet || p.snippet;
        return {
          ...p,
          snippet: row.snippet || '',
          route: withHighlight(p.route, query, snippet, p.matchedTextLanguage),
        };
      }),
      total: found.total,
      hasMore: found.rows.length >= limit,
    };
  }

  const phraseLimit = Math.max(limit, 120);
  const phrase = await runMatch(
    db, language, group, buildPhraseQuery(words), phraseLimit, offset, titleMatch
  );

  const phraseIds = new Set(phrase.rows.map((r) => JSON.parse(r.payload).id));
  const needMore = phrase.rows.length < limit;
  let andRows = [];
  let andTotal = 0;
  if (needMore) {
    const and = await runMatch(
      db, language, group, buildAndQuery(words), limit, 0, titleMatch
    );
    andTotal = and.total;
    andRows = and.rows.filter((r) => {
      const p = JSON.parse(r.payload);
      return !phraseIds.has(p.id);
    });
  }

  const combined = [...phrase.rows, ...andRows].slice(0, limit);
  const total = Math.max(phrase.total, andTotal);
  if (combined[0]) {
    const p = JSON.parse(combined[0].payload);
    const ft = withHighlight(p.route, query, p.snippet, p.matchedTextLanguage).params?.focusTarget;
    console.warn('[search] FT(multi) =', JSON.stringify(ft));
  }
  return {
    items: combined.map((row) => {
      const p = JSON.parse(row.payload);
      const snippet = row.snippet || p.snippet;
      return {
        ...p,
        snippet: row.snippet || p.snippet,
        route: withHighlight(p.route, query, snippet, p.matchedTextLanguage)
      };
    }),
    total,
    hasMore: combined.length >= limit,
  };
};

const addEntry = async (db, entry, language) => {
  const payload = {
    id: entry.id,
    group: entry.group,
    kind: entry.kind || 'text',
    title: entry.title || '',
    source: entry.source || '',
    snippet: entry.snippet || entry.preview || '',
    route: entry.route,
    groupLabel: entry.groupLabel || entry.group,
    matchedLanguageLabel: '',
  };
  const normalizedBody = (entry.fields || [])
    .map((field) => normalizeSearchText(field.normalized || field.text || ''))
    .filter(Boolean)
    .join(' ');
  const result = await db.runAsync(
    'INSERT INTO search_payloads(language,group_key,kind,boost,payload) VALUES(?,?,?,?,?)',
    [language, entry.group, payload.kind, 1.0, JSON.stringify(payload)]
  );
  await db.runAsync('INSERT INTO search_documents(rowid,title,source,body) VALUES(?,?,?,?)', [
    result.lastInsertRowId,
    normalizeSearchText(entry.title),
    normalizeSearchText(entry.source),
    normalizedBody,
  ]);
};

export const ensurePersistentSearch = async (
  language = 'ru',
  {isCancelled = () => false, onProgress = () => {}} = {}
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
    await db.execAsync("INSERT INTO search_documents(search_documents) VALUES('delete-all');");
    await db.runAsync('DELETE FROM search_payloads');
    await db.runAsync('DELETE FROM search_metadata');
    let batch = [];
    const flush = async () => {
      const rows = batch;
      batch = [];
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
            group: SEARCH_GROUPS.SCRIPTURE,
            kind: 'bible-verse',
            title: (book.name || book.short_name || '') + ' ' + chapter.number + ':' + verse.number,
            source: 'Писание',
            snippet: String(verse.text || '').slice(0, 190),
            route: {
              name: 'BibleChapter',
              params: {
                bookId: Number(book.id),
                chapterNumber: Number(chapter.number),
                resume: false,
                focusTarget: {
                  save_type: 'fragment',
                  anchor_type: 'bible_verse',
                  anchor_id: Number(verse.id),
                  start_offset: null,
                  end_offset: null,
                  metadata: {
                    book_id: Number(book.id),
                    book_slug: book.slug,
                    chapter_number: Number(chapter.number),
                    verse_number: Number(verse.number),
                  },
                },
              },
            },
            fields: [{normalized: verse.text || ''}],
          });
          if (batch.length >= 150) await flush();
        }
      }
      onProgress({book: book.name || book.short_name || ''});
    }
    await flush();
    console.error('[search] ensure: flush done, isCancelled =', isCancelled(), '| version =', version);
    if (isCancelled() || version !== versionFor(language)) {
      console.error('[search] ensure: CANCELLED or VERSION CHANGED');
      return false;
    }
    await db.runAsync('INSERT OR REPLACE INTO search_metadata(language,version) VALUES(?,?)', [
      language,
      version,
    ]);
    console.error('[search] ensure: metadata written, DONE');
    return true;
  })()
    .catch((error) => {
      console.warn('Persistent search indexing failed:', error?.message || error);
      return false;
    })
    .finally(() => {
      buildsByLanguage.delete(language);
    });
  buildsByLanguage.set(language, job);
  return job;
};