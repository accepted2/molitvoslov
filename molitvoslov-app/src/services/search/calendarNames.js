import {getBundledCalendarMonth} from '../calendarOfflineStore';
import {normalizeSearchText} from './normalize';

// A compact, cached index of names only. No changes to the existing FTS index.
let catalogPromise = null;
const normalized = (text) => normalizeSearchText(text);
const titleKey = (title) => normalized(title)
  .replace(/^(?:житие(?: во святых)?|святитель|свт|св|память)\s+/g, '')
  .replace(/\s+/g, ' ').trim();
const searchTokens = (value) => normalized(value).split(' ').filter(Boolean);
const relatedToken = (word, token) =>
  word === token || word.startsWith(token) || token.startsWith(word) ||
  (word.length >= 5 && token.length >= 5 && word.slice(0, 5) === token.slice(0, 5));
const tokenMatch = (title, query) => {
  const words = searchTokens(title);
  return searchTokens(query).every((token) => words.some((word) => relatedToken(word, token)));
};
const completeness = (r) => Number(r.hasLife) * 20 + Number(r.hasIcon) * 8 +
  Number(r.hasTroparion) * 4 + Number(r.hasKontakion) * 2;
const buildCatalog = async () => {
  const seen = new Map();
  for (let month = 1; month <= 12; month += 1) {
    const payload = getBundledCalendarMonth(2026, month, 'ru');
    for (const day of payload?.days || []) {
      const date = day.date_gregorian;
      for (const feast of [day.main_feast, ...(day.all_feasts || [])].filter(Boolean)) {
        if (!date || !feast?.title) continue;
        const title = feast.title;
        const record = {
          date, feast, title, title_uk: feast.title_uk || '',
          hasLife: !!(feast.life_content || feast.life_content_uk),
          hasTroparion: !!(feast.troparion_content || feast.troparion_content_uk),
          hasKontakion: !!(feast.kontakion_content || feast.kontakion_content_uk),
          hasIcon: !!(feast.icon_url || feast.icon),
        };
        const key = titleKey(title);
        const prev = seen.get(key);
        if (!prev || completeness(record) > completeness(prev)) seen.set(key, record);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return [...seen.values()];
};
export const searchCalendarNames = async (query, language = 'ru') => {
  const text = normalized(query);
  if (text.length < 3) return [];
  if (!catalogPromise) catalogPromise = buildCatalog().catch((error) => {
    catalogPromise = null;
    throw error;
  });
  const catalog = await catalogPromise;
  const isLifeQuery = /^(?:житие|житие святого|житие святителя)\s+/.test(text);
  const needle = isLifeQuery ? text.replace(/^житие(?: святого| святителя)?\s+/, '') : text;
  const matched = catalog.filter((r) => {
    const title = language === 'uk' ? r.title_uk || r.title : r.title;
    return tokenMatch(title, needle) || tokenMatch(r.title, needle) ||
      tokenMatch(r.feast.life_title, needle);
  }).sort((a, b) => {
    const score = (r) => {
      const title = normalized(r.title);
      const starts = title.startsWith(needle) || title.startsWith('свт ' + needle);
      return Number(starts)*80 + Number(r.hasLife)*25 +
        Number(r.hasIcon)*10 + completeness(r)/10;
    };
    return score(b)-score(a) || a.title.localeCompare(b.title, 'ru');
  });
  return matched.flatMap((r) => {
    const title = language === 'uk' ? r.title_uk || r.title : r.title;
    const base = {feast: r.feast, date: r.date};
    const results = [{
      id: 'calendar-name:' + r.date + ':' + titleKey(r.title),
      group: 'calendar', kind: 'calendar-saint',
      title: (r.hasLife ? (language === 'uk' ? 'Житіє — ' : 'Житие — ') : '') + title,
      snippet: '', route: {name: 'SaintDetail',
        params: {...base, focusSection: r.hasLife ? 'life' : undefined}},
    }];
    if (!isLifeQuery) {
      for (const [kind, label, text] of [
        ['troparion', language === 'uk' ? 'Тропар' : 'Тропарь', r.feast.troparion_content],
        ['kontakion', 'Кондак', r.feast.kontakion_content],
      ]) {
        if (!text) continue;
        results.push({
          id: 'calendar-name:' + r.date + ':' + titleKey(r.title) + ':' + kind,
          group: 'calendar', kind: 'calendar-' + kind,
          title: label + ' — ' + title,
          snippet: '', route: {name: 'SaintDetail', params: {...base, focusSection: kind}},
        });
      }
    }
    return results;
  });
};
