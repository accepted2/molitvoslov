// Восстановление route из компактного вида (шаблон + аргументы) и подготовка
// route для экрана чтения. Формат route, route.params и focusTarget — прежний.

const setPath = (root, path, value) => {
  if (!path.length) return value;
  let cur = root;
  for (let i = 0; i < path.length - 1; i += 1) {
    if (cur[path[i]] == null || typeof cur[path[i]] !== 'object') cur[path[i]] = {};
    cur = cur[path[i]];
  }
  cur[path[path.length - 1]] = value;
  return root;
};

export const loadTemplates = async (db) => {
  const rows = await db.getAllAsync('SELECT id, name, tpl, vars FROM tpl');
  return new Map(rows.map((r) => [r.id, {name: r.name, tpl: r.tpl, vars: JSON.parse(r.vars)}]));
};

/** row: строка doc (tpl, args, fid) или строка OTA (route — JSON целиком). */
export const decodeRoute = (row, templates, feastById) => {
  if (row.route) return JSON.parse(row.route);
  const t = templates.get(row.tpl);
  if (!t) return null;
  let params = JSON.parse(t.tpl);
  if (t.vars.length) {
    const args = row.args ? JSON.parse(row.args) : [];
    t.vars.forEach((path, i) => { params = setPath(params, path, args[i]); });
  }
  if (row.fid != null) params.feast = feastById.get(row.fid);
  return {name: t.name, params};
};

export const loadFeasts = async (db, ids) => {
  const out = new Map();
  const list = [...new Set(ids.filter((x) => x != null))];
  for (let i = 0; i < list.length; i += 200) {
    const chunk = list.slice(i, i + 200);
    const rows = await db.getAllAsync(
      'SELECT id, json FROM feast WHERE id IN (' + chunk.map(() => '?').join(',') + ')', chunk);
    rows.forEach((r) => out.set(r.id, JSON.parse(r.json)));
  }
  return out;
};

const LANGUAGE_BY_CODE = {c: 'church', r: 'russian', u: 'ukrainian'};
export const languageName = (code) => LANGUAGE_BY_CODE[code] || null;
export const LANGUAGE_LABEL = {church: 'ЦС', russian: 'Рус.', ukrainian: 'Укр.'};

/**
 * Добавляет к route подсветку найденного слова и язык, на котором найдено.
 * Логика совпадает с прежней withHighlight: focusTarget сохраняется, к нему
 * добавляются highlightQuery / highlightSectionStart / preferredLanguage.
 */
export const withHighlight = (route, query, matchedTextLanguage, highlightSectionStart = false) => {
  if (!route?.name || !query) return route;
  const params = route.params || {};
  const existing = params.focusTarget;
  // A chapter-title hit such as "Марк 8" is a navigation address,
  // not a text fragment. A generic highlight query has no anchor and
  // causes the Bible reader to land at its previous/top position.
  if (route.name === 'BibleChapter' && params.chapterNumber != null &&
      !(existing?.anchor_type || existing?.anchorType)) {
    return {
      ...route,
      params: {
        ...params,
        focusTarget: {
          save_type: 'chapter',
          anchor_type: 'bible_chapter',
          metadata: {chapter_number: Number(params.chapterNumber)},
        },
      },
    };
  }
  const preferredLanguage = matchedTextLanguage || 'russian';
  const focusTarget = existing
    ? {
      ...existing,
      save_type: existing.save_type || existing.saveType || 'fragment',
      highlightQuery: query,
      highlightSectionStart,
      preferredLanguage,
    }
    : {save_type: 'fragment', highlightQuery: query, highlightSectionStart, preferredLanguage};
  return {...route, params: {...params, highlightQuery: query, focusTarget}};
};
