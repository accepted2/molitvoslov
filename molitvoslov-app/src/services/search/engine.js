// Поисковый движок Молитвослова.
//
// Принципы:
//  • вся индексация — на компьютере (tools/build_search_seed.py); здесь только запросы;
//  • одна база: ту, что открыл SQLiteProvider (assetSource), передают параметром `database`;
//  • готовность базы проверяется по версии СХЕМЫ, а не по content_version исходных JSON —
//    совместимость с JSON проверяется при СБОРКЕ (tools/verify_search_seed.py);
//  • никакого сканирования корпуса в JavaScript: SQLite отдаёт ≤ ~1000 кандидатов,
//    JS лишь точнее упорядочивает их по приоритетам из ТЗ.
import {SEARCH_SCHEMA_VERSION, SEARCH_GROUPS} from './schema.js';
import {analyzeQuery, buildAndQuery, buildOrQuery, buildPhraseQuery, buildPhrasesQuery} from './query.js';
import {tokenize, stemWord, wordSpans, normalizeSearchText} from './normalize.js';
import {decodeRoute, loadTemplates, loadFeasts, languageName, LANGUAGE_LABEL, withHighlight} from './routes.js';
import {getOverlaySource} from './overlay.js';

export {SEARCH_GROUPS};

const SEP = '\u001f';
const BM25 = 'bm25(__F__, 10.0, 4.0, 1.0)';
const POOL_PHRASE = 200;
const POOL_AND = 600;
const POOL_OR = 300;
const POOL_TITLE = 100;
const ANALYZE_BUDGET = 350;       // сколько кандидатов анализируем по тексту
const FEW = 15;                   // мало результатов → включаем опечатки и частичные совпадения
const NO_TITLE_TIER = new Set(['bible-verse', 'psalm-verse']);
const COLS = 'd.id, d.ext, d.lang, d.grp, d.kind, d.title, d.title_uk, d.nt, d.ntu, d.src, d.srctxt, ' +
  'd.tpl, d.args, d.fid, d.body, d.bl, d.wc, d.boost';

const SEED = {name: 'seed', doc: 'doc', fts: 'fts', vocab: 'fts_v', extra: ''};

// ───────────── Доступ к базе ─────────────
let fallbackDb = null;
let fallbackName = null;
export const setSearchDatabaseName = (name) => { fallbackName = name; };

const getSearchDb = async (database) => {
  if (database) return database;
  if (fallbackDb) return fallbackDb;
  if (!fallbackName) throw new Error('search: database is not provided');
  // eslint-disable-next-line global-require
  const SQLite = require('expo-sqlite');
  fallbackDb = await SQLite.openDatabaseAsync(fallbackName, {useNewConnection: true});
  return fallbackDb;
};

const readyCache = new WeakMap();
const contextCache = new WeakMap();

export const preparePersistentSearch = async (database = null) => {
  try { await getSearchDb(database); return true; } catch { return false; }
};

/** Готова ли встроенная база: схема совпадает и записи есть. НЕ зависит от OTA и от content_version. */
export const isPersistentSearchReady = async (language = 'ru', database = null) => {
  let db;
  try { db = await getSearchDb(database); } catch { return false; }
  if (readyCache.get(db) === true) return true;
  try {
    const meta = await db.getFirstAsync("SELECT v FROM meta WHERE k = 'schema'");
    const count = await db.getFirstAsync('SELECT count(*) AS n FROM doc');
    const ok = meta?.v === SEARCH_SCHEMA_VERSION && (count?.n || 0) > 0;
    if (ok) readyCache.set(db, true);
    return ok;
  } catch (error) {
    console.warn('[search] base is not usable:', error?.message || error);
    return false;
  }
};

/** Совместимость со старым кодом: индексация на телефоне больше невозможна. */
export const ensurePersistentSearch = async (language = 'ru', {database = null} = {}) =>
  isPersistentSearchReady(language, database);
export const versionFor = () => SEARCH_SCHEMA_VERSION;

const getContext = async (db) => {
  let ctx = contextCache.get(db);
  if (!ctx) {
    const srcRows = await db.getAllAsync('SELECT id, text FROM src');
    ctx = {srcMap: new Map(srcRows.map((r) => [r.id, r.text])), templates: await loadTemplates(db)};
    contextCache.set(db, ctx);
  }
  return ctx;
};

// ───────────── SQL ─────────────
const filterSql = (language, group, flags) => {
  let sql = " AND d.lang IN ('', ?)";
  const params = [language];
  if (group && group !== SEARCH_GROUPS.ALL) { sql += ' AND d.grp = ?'; params.push(group); }
  // «молитва» — не показываем пустые заголовки-разделители
  if (flags.genericPrayer) {
    sql += " AND NOT (d.grp = 'prayers' AND d.nt IN ('молитва','молитвы','молитви') AND d.wc < 40)";
  }
  if (flags.bookOnly) sql += " AND (d.grp != 'scripture' OR d.kind = 'bible-book')";
  return {sql, params};
};

const poolQuery = async (src, db, match, language, group, flags, limit) => {
  if (!match) return [];
  const f = filterSql(language, group, flags);
  const rank = BM25.replace('__F__', src.fts);
  return db.getAllAsync(
    `SELECT ${COLS}${src.extra}, ${rank} AS r FROM ${src.fts} JOIN ${src.doc} d ON d.id = ${src.fts}.rowid ` +
    `WHERE ${src.fts} MATCH ?${f.sql} ORDER BY r * d.boost LIMIT ?`,
    [match, ...f.params, limit]);
};

const titleQuery = async (src, db, qn, language, group, flags) => {
  if (!qn) return [];
  const f = filterSql(language, group, flags);
  const hi = qn + '\uffff';
  const cond = language === 'uk'
    ? '(d.nt = ? OR (d.nt >= ? AND d.nt < ?) OR d.ntu = ? OR (d.ntu >= ? AND d.ntu < ?))'
    : '(d.nt = ? OR (d.nt >= ? AND d.nt < ?))';
  const args = language === 'uk' ? [qn, qn, hi, qn, qn, hi] : [qn, qn, hi];
  return db.getAllAsync(
    `SELECT ${COLS}${src.extra}, 0 AS r FROM ${src.doc} d WHERE ${cond}${f.sql} LIMIT ?`,
    [...args, ...f.params, POOL_TITLE]);
};

const editDistance = (a, b, max) => {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2 = []; let prev = []; let cur = [];
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j += 1) prev2[j] = prev[j];
    prev = cur;
  }
  return prev[b.length];
};

/** Исправление опечаток: ближайшие основы из словаря индекса (fts5vocab), без обхода корпуса. */
const fuzzyStems = async (db, stem) => {
  const max = stem.length >= 8 ? 2 : stem.length >= 4 ? 1 : 0;
  if (!max) return [];
  const c0 = stem[0];
  let rows;
  try {
    rows = await db.getAllAsync('SELECT term, doc FROM fts_v WHERE term >= ? AND term < ?', [c0, c0 + '\uffff']);
  } catch { return []; }
  const found = [];
  for (const r of rows) {
    if (r.term === stem || Math.abs(r.term.length - stem.length) > max) continue;
    const d = editDistance(stem, r.term, max);
    if (d <= max) found.push({term: r.term, d, df: r.doc});
  }
  return found.sort((a, b) => a.d - b.d || b.df - a.df).slice(0, 4).map((x) => x.term);
};

const termDf = async (db, stem) => {
  try {
    const r = await db.getFirstAsync('SELECT doc FROM fts_v WHERE term = ?', [stem]);
    return r?.doc || 0;
  } catch { return 1; }
};

// ───────────── Оценка кандидатов по приоритетам ТЗ ─────────────
// 1 — точное название; 2 — название с учётом нормализации; 3 — точная последовательность слов;
// 3.5 — последовательность по основам / префиксу; 4 — все слова запроса; 5 — частичные/опечатки.
const hasSequence = (words, seq, prefixLast) => {
  if (!seq.length) return 0;
  const n = seq.length;
  let level = 0;
  for (let i = 0; i + n <= words.length; i += 1) {
    let exact = true;
    let ok = true;
    for (let k = 0; k < n; k += 1) {
      const w = words[i + k];
      const isLast = k === n - 1;
      if (w === seq[k]) continue;
      if (isLast && prefixLast && w.startsWith(seq[k])) { exact = false; continue; }
      ok = false;
      break;
    }
    if (ok) { if (exact) return 3; level = 2; }
  }
  return level;
};

const sequencesOf = (q) => {
  if (q.phrases.length) return q.phrases;
  return q.words.length ? [{words: q.words, stems: q.stems}] : [];
};

const assess = (cand, q, raw) => {
  const row = cand.row;
  const isRef = NO_TITLE_TIER.has(row.kind);
  const qn = (q.phrases.length && !q.words.length ? q.phrases[0].words : q.words).join(' ');
  let tier = 5;
  let variant = 0;
  let titleHit = false;

  if (!isRef && qn) {
    const rt = (row.title || '').trim().toLowerCase();
    const ru = (row.title_uk || '').trim().toLowerCase();
    if (rt === raw || (ru && ru === raw)) { tier = 1; titleHit = true; }
    else {
      const tn = row.nt || normalizeSearchText(row.title);
      const tu = row.ntu || '';
      let ok = tn === qn || tu === qn || tn.startsWith(qn + ' ');
      if (!ok && q.stems.length) {
        const ts = tokenize(row.title).map(stemWord);
        ok = q.stems.every((s, i) => ts.includes(s) || (i === q.stems.length - 1 && ts.some((t) => t.startsWith(s))));
      }
      if (ok) { tier = 2; titleHit = true; }
    }
  }

  const texts = row.body ? row.body.split(SEP) : [];
  if (tier > 2 && texts.length && cand.via !== 'or' && cand.via !== 'fuzzy') {
    const seqs = sequencesOf(q);
    const best = new Array(seqs.length).fill(0);
    let bestVariant = 0;
    let bestScore = -1;
    texts.forEach((text, i) => {
      const ws = tokenize(text);
      const ss = ws.map(stemWord);
      let score = 0;
      seqs.forEach((seq, si) => {
        const exact = hasSequence(ws, seq.words, true);
        const lvl = exact === 3 ? 3 : Math.max(exact, hasSequence(ss, seq.stems, true));
        best[si] = Math.max(best[si], lvl);
        score += lvl;
      });
      if (score > bestScore) { bestScore = score; bestVariant = i; }
    });
    variant = bestVariant;
    if (best.length && best.every((l) => l === 3)) tier = 3;
    else if (best.length && best.every((l) => l >= 2)) tier = 3.5;
    else if (cand.via === 'and' || cand.via === 'phrase') tier = 4;
  } else if (tier > 2 && (cand.via === 'and' || cand.via === 'phrase')) {
    tier = 4;
  }
  return {tier, variant, titleHit};
};

// ───────────── Сниппет с [скобками] вокруг найденных слов ─────────────
const clipBrackets = (s) => s.replace(/\[/g, '(').replace(/\]/g, ')').replace(/\s+/g, ' ');
const makeSnippet = (text, stemSet, lastStem, win = 26) => {
  const spans = wordSpans(text);
  if (!spans.length) return '';
  const hit = spans.map((s) => stemSet.has(s.stem) || (lastStem && s.stem.startsWith(lastStem)));
  let best = 0;
  let bestEnd = Math.min(win, spans.length) - 1;
  let count = 0;
  for (let i = 0; i < spans.length; i += 1) {
    if (hit[i]) count += 1;
    if (i >= win && hit[i - win]) count -= 1;
    if (count > best) { best = count; bestEnd = i; }
  }
  if (!best) return '';
  let s = Math.max(0, bestEnd - win + 1);
  const first = hit.indexOf(true, s);
  if (first !== -1 && first < s + win) s = Math.max(0, first - 4);
  const e = Math.min(spans.length, s + win);
  let out = '';
  let cur = spans[s].start;
  for (let i = s; i < e; i += 1) {
    out += clipBrackets(text.slice(cur, spans[i].start));
    const w = clipBrackets(text.slice(spans[i].start, spans[i].end));
    out += hit[i] ? '[' + w + ']' : w;
    cur = spans[i].end;
  }
  return (s > 0 ? '… ' : '') + out + (e < spans.length ? ' …' : '');
};

// ───────────── Поиск ─────────────
const GENERIC_PRAYER = new Set(['молитва', 'молитвы', 'молитву', 'молитве', 'молитви']);
const BOOK_WORDS = new Set(['книга', 'книги', 'книгу', 'книге']);
const PRIORITY = {title: 0, phrase: 1, and: 2, fuzzy: 3, or: 4};

const collect = async (src, db, q, language, group, flags, relax) => {
  const out = [];
  const add = (rows, via) => rows.forEach((row) => out.push({src, row, r: row.r, via}));
  const qn = (q.phrases.length && !q.words.length ? q.phrases[0].words : q.words).join(' ');
  const hasPhraseOnly = q.phrases.length > 0;

  if (!hasPhraseOnly && qn) add(await titleQuery(src, db, qn, language, group, flags), 'title');
  if (hasPhraseOnly) {
    const parts = [buildPhrasesQuery(q.phrases)];
    if (q.words.length) parts.push(buildAndQuery(q.words, q.stems));
    add(await poolQuery(src, db, parts.join(' AND '), language, group, flags, POOL_AND), 'phrase');
  } else {
    if (q.stems.length > 1) add(await poolQuery(src, db, buildPhraseQuery(q.stems), language, group, flags, POOL_PHRASE), 'phrase');
    add(await poolQuery(src, db, buildAndQuery(q.words, q.stems), language, group, flags, POOL_AND), 'and');
  }
  return {out, relaxed: null};
};

const relaxCandidates = async (src, db, q, language, group, flags, have) => {
  const out = [];
  const push = (rows, via) => rows.forEach((row) => out.push({src, row, r: row.r, via}));
  if (q.phrases.length || !q.stems.length || !src.vocab) return out;
  // 1. опечатки: слово без совпадений в словаре заменяем ближайшими основами
  const alts = [];
  let changed = false;
  for (let i = 0; i < q.stems.length; i += 1) {
    const isLast = i === q.stems.length - 1;
    const df = await termDf(db, q.stems[i]);
    if (df === 0 && !isLast) {
      const near = await fuzzyStems(db, q.stems[i]);
      if (near.length) { alts.push(near); changed = true; continue; }
    } else if (df === 0 && isLast) {
      const near = await fuzzyStems(db, q.stems[i]);
      if (near.length) { alts.push(near); changed = true; continue; }
    }
    alts.push([q.stems[i]]);
  }
  if (changed) {
    const match = alts.map((g, i) => {
      const isLast = i === alts.length - 1;
      const parts = g.map((s) => '"' + s + '"' + (isLast ? '*' : ''));
      return parts.length > 1 ? '(' + parts.join(' OR ') + ')' : parts[0];
    }).join(' AND ');
    push(await poolQuery(src, db, match, language, group, flags, POOL_AND), 'fuzzy');
  }
  // 2. частичные совпадения: достаточно любого слова запроса
  if (have + out.length < FEW && q.stems.length > 1) {
    push(await poolQuery(src, db, buildOrQuery(q.stems), language, group, flags, POOL_OR), 'or');
  }
  return out;
};

const rankAll = async (db, language, group, q, raw) => {
  const flags = {
    genericPrayer: q.words.length === 1 && GENERIC_PRAYER.has(q.words[0]),
    bookOnly: q.words.length === 1 && BOOK_WORDS.has(q.words[0]),
  };
  const sources = [SEED];
  const overlay = await getOverlaySource();
  let shadow = null;
  if (overlay) { sources.push({...overlay.src, db: overlay.db}); shadow = overlay.exts; }

  let cands = [];
  for (const src of sources) {
    const sdb = src.db || db;
    const {out} = await collect(src, sdb, q, language, group, flags, false);
    cands.push(...out);
  }
  if (shadow) cands = cands.filter((c) => c.src.name !== 'seed' || !shadow.has(c.row.ext));
  let truncated = cands.length >= POOL_AND;

  // дубликаты (одна запись найдена несколькими запросами) — оставляем лучший путь
  const merge = (list) => {
    const map = new Map();
    for (const c of list) {
      const key = c.src.name + ':' + c.row.id;
      const prev = map.get(key);
      if (!prev || PRIORITY[c.via] < PRIORITY[prev.via] ||
        (PRIORITY[c.via] === PRIORITY[prev.via] && c.r < prev.r)) map.set(key, c);
    }
    return [...map.values()];
  };
  cands = merge(cands);

  if (cands.length < FEW) {
    for (const src of sources) {
      const sdb = src.db || db;
      cands.push(...await relaxCandidates(src, sdb, q, language, group, flags, cands.length));
    }
    if (shadow) cands = cands.filter((c) => c.src.name !== 'seed' || !shadow.has(c.row.ext));
    cands = merge(cands);
  }

  cands.sort((a, b) => PRIORITY[a.via] - PRIORITY[b.via] || a.r * a.row.boost - b.r * b.row.boost);
  const scored = cands.map((c, i) => {
    if (i < ANALYZE_BUDGET) return {c, ...assess(c, q, raw)};
    return {c, tier: c.via === 'and' || c.via === 'phrase' ? 4 : 5, variant: 0, titleHit: false};
  });
  scored.sort((a, b) => a.tier - b.tier || a.c.r * a.c.row.boost - b.c.r * b.c.row.boost || a.c.row.id - b.c.row.id);
  return {list: scored, total: scored.length, truncated};
};

let lastRanked = null;

const materialize = async (db, page, language, query, q) => {
  const ctx = await getContext(db);
  const feasts = await loadFeasts(db, page.filter((p) => p.c.src.name === 'seed').map((p) => p.c.row.fid));
  const stemSet = new Set([...q.stems, ...q.phrases.flatMap((p) => p.stems)]);
  const lastStem = q.stems.length ? q.stems[q.stems.length - 1] : null;
  return page.map((p) => {
    const row = p.c.row;
    const texts = row.body ? row.body.split(SEP) : [];
    const code = row.bl ? row.bl[p.variant] || row.bl[0] : '';
    const matchedLanguage = languageName(code);
    const multi = new Set((row.bl || '').split('').filter((c) => 'cru'.includes(c))).size > 1;
    const snippet = texts.length ? makeSnippet(texts[p.variant] || texts[0], stemSet, lastStem) : '';
    const route = decodeRoute(row, ctx.templates, feasts);
    const title = language === 'uk' && row.title_uk ? row.title_uk : row.title;
    const source = row.srctxt != null ? row.srctxt : (ctx.srcMap.get(row.src) || '');
    const sectionStart = row.grp === 'psalter' || (p.titleHit && ['akathists', 'canons', 'prayers'].includes(row.grp));
    return {
      id: row.ext, group: row.grp, kind: row.kind, title, source, snippet,
      groupLabel: row.grp, score: Number((-(p.c.r || 0) * row.boost).toFixed(3)),
      titleMatched: p.titleHit, tier: p.tier,
      matchedTextLanguage: matchedLanguage,
      matchedLanguageLabel: multi && matchedLanguage && snippet ? LANGUAGE_LABEL[matchedLanguage] || '' : '',
      route: withHighlight(route, query, matchedLanguage, sectionStart),
    };
  });
};

// Universal exact-name lookup; applies to all Bible books and named works, not specific strings.
// Only a *complete* known book title can collapse chapter hits. Optional integer selects one chapter.
const universalNamedLookupV10 = async (db, language, group, q) => {
  if (q.phrases.length || q.words.length === 0) return null;
  const f = filterSql(language, group, {});
  const input = q.words.join(' ');
  if (group === SEARCH_GROUPS.ALL || group === SEARCH_GROUPS.SCRIPTURE) {
    const books = await db.getAllAsync(
      `SELECT ${COLS}, 0 AS r FROM doc d WHERE d.kind = 'bible-book'${f.sql}`,
      f.params
    );
    const chapterNumber = /^\d+$/.test(q.words[q.words.length - 1]) ? Number(q.words[q.words.length - 1]) : null;
    const title = chapterNumber === null ? input : q.words.slice(0, -1).join(' ');
    // Never mistake an incomplete query (e.g. 'книга') for the whole title.
    const names = (b) => [b.nt || normalizeSearchText(b.title), b.ntu].filter(Boolean);
    const exactBooks = books.filter((b) => names(b).includes(title));
    // Also support an unambiguous prefix, e.g. 'книга притчей' => 'Книга притчей Соломоновых'.
    const matching = exactBooks.length ? exactBooks : (title.split(' ').length >= 2
      ? books.filter((b) => names(b).some((n) => n.startsWith(title + ' '))) : []);
    if (!exactBooks.length && matching.length !== 1) return null;
    if (matching.length) {
      let rows = matching;
      if (chapterNumber !== null) {
        rows = [];
        for (const book of matching) {
          const bookRoute = decodeRoute(book, (await getContext(db)).templates, new Map());
          const bookId = bookRoute?.params?.bookId;
          if (bookId == null) continue;
          // Identify chapters by their route's bookId (not by translated title prefix).
          const chapters = await db.getAllAsync(
            `SELECT ${COLS}, 0 AS r FROM doc d WHERE d.kind = 'bible-chapter'${f.sql}`,
            f.params
          );
          const ctx = await getContext(db);
          for (const chapter of chapters) {
            const route = decodeRoute(chapter, ctx.templates, new Map());
            if (String(route?.params?.bookId) === String(bookId) &&
                Number(route?.params?.chapterNumber) === chapterNumber) rows.push(chapter);
          }
        }
        // A book with exactly one chapter may not have a separate chapter document.
        if (!rows.length && chapterNumber === 1) {
          for (const book of matching) {
            const route = decodeRoute(book, (await getContext(db)).templates, new Map());
            if (route?.name === 'BibleChapter') rows.push(book);
          }
        }
      }
      return rows.map((row) => ({c:{src:SEED,row,r:0,via:'title'},tier:1,variant:0,titleHit:true}));
    }
  }
  // Exact named texts should not be drowned out by incidental body matches.
  // Exclude Bible verses and psalm verses, whose generated titles are not standalone works.
  if (q.words.length < 2) return null;
  const rows = await db.getAllAsync(
    `SELECT ${COLS}, 0 AS r FROM doc d WHERE (d.nt = ? OR d.ntu = ?) AND d.kind NOT IN ('bible-verse','psalm-verse','bible-chapter')${f.sql} LIMIT 100`,
    [input,input,...f.params]
  );
  if (!rows.length) return null;
  return rows.map((row) => ({c:{src:SEED,row,r:0,via:'title'},tier:1,variant:0,titleHit:true}));
};

// Prioritise contiguous matching phrases over scattered individual words.
// Do not discard ordinary one-word queries or all weak results when there are no strong hits.
const universalStrongMatchesV10 = (list, q) => {
  if (q.words.length < 2 && !q.phrases.length) return list;
  const strong = list.filter((r) => r.tier <= 3);
  return strong.length ? strong : list;
};

/** Публичный API — совместим со старой сигнатурой searchPersistent. */
export const searchPersistent = async (
  language, query, group = SEARCH_GROUPS.ALL, limit = 120, offset = 0, database = null
) => {
  const q = analyzeQuery(query);
  if (q.empty) return {items: [], total: 0, hasMore: false};
  if (!(await isPersistentSearchReady(language, database))) {
    return {items: [], total: 0, hasMore: false, unavailable: true};
  }
  const db = await getSearchDb(database);
  const key = [language, group, q.key].join('|');
  let ranked = lastRanked && lastRanked.db === db && lastRanked.key === key ? lastRanked.ranked : null;
  if (!ranked) {
    ranked = await rankAll(db, language, group, q, String(query || '').trim().toLowerCase());
    lastRanked = {db, key, ranked};
  }
  const named = await universalNamedLookupV10(db, language, group, q);
  const selected = named !== null ? named : universalStrongMatchesV10(ranked.list, q);
  const end = offset + limit;
  const items = await materialize(db, selected.slice(offset, end), language, query, q);
  return {items, total: selected.length,
    hasMore: end < selected.length || (named === null && selected === ranked.list && ranked.truncated && end >= selected.length)};
};

/** Подсказки при наборе: названия, начинающиеся с введённого, затем содержащие все слова. */
export const suggestTitles = async (database, query, group = SEARCH_GROUPS.ALL, language = 'ru', limit = 6) => {
  const q = analyzeQuery(query);
  const qn = q.words.join(' ');
  if (!qn || qn.length < 2) return [];
  const db = await getSearchDb(database);
  const f = filterSql(language, group, {});
  const col = language === 'uk' ? 'COALESCE(d.title_uk, d.title)' : 'd.title';
  const seen = new Set();
  const out = [];
  const take = (rows) => rows.forEach((r) => {
    const k = normalizeSearchText(r.t);
    if (!seen.has(k) && out.length < limit) { seen.add(k); out.push(r.t); }
  });
  take(await db.getAllAsync(
    `SELECT ${col} AS t FROM doc d WHERE d.nt >= ? AND d.nt < ?${f.sql} ORDER BY length(d.nt) LIMIT 40`,
    [qn, qn + '\uffff', ...f.params]));
  if (out.length < limit && q.stems.length) {
    const match = 'title : (' + buildAndQuery(q.words, q.stems) + ')';
    take(await db.getAllAsync(
      `SELECT ${col} AS t FROM fts JOIN doc d ON d.id = fts.rowid WHERE fts MATCH ?${f.sql} ` +
      'ORDER BY bm25(fts, 10.0, 4.0, 1.0) LIMIT 40', [match, ...f.params]));
  }
  return out.slice(0, limit);
};

/** Удаляет старые копии поисковой базы после обновления APK (best effort). */
export const cleanupStaleSearchDatabases = async (currentName) => {
  try {
    // eslint-disable-next-line global-require
    const FileSystem = require('expo-file-system');
    const dir = FileSystem.documentDirectory + 'SQLite/';
    const names = await FileSystem.readDirectoryAsync(dir);
    for (const n of names) {
      if (/^molitvoslov_search_v\d+_[0-9a-f]+\.db(-wal|-shm|-journal)?$/.test(n) && !n.startsWith(currentName)) {
        await FileSystem.deleteAsync(dir + n, {idempotent: true});
      }
    }
  } catch (error) {
    console.warn('[search] stale db cleanup skipped:', error?.message || error);
  }
};
