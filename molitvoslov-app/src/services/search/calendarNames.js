import {getBundledCalendarMonth} from '../calendarOfflineStore';
import {normalizeSearchText} from './normalize';

// A compact, cached index of names only. No changes to the existing FTS index.
let catalogPromise = null;
const normalized = (text) => normalizeSearchText(text)
  .replace(/никола[яюи](?=\s|$)/g, 'николай')
  .replace(/мир\s+ликийских|мирликийских|мирликийский|мирликийского/g, 'мирликийск');
const titleKey = (title) => normalized(title).replace(/^(?:житие|житие во святых|святитель|свт|св)\s+/g, '');
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
    return normalized(title).includes(needle) || normalized(r.title).includes(needle) ||
      normalized(r.feast.life_title).includes(needle);
  }).sort((a, b) => {
    const score = (r) => {
      const title = normalized(r.title);
      const starts = title.startsWith(needle) || title.startsWith('свт ' + needle);
      const nikolai = /николай/.test(needle) && /мирликийск/.test(title) && /чудотвор/.test(title);
      return Number(nikolai)*1000 + Number(starts)*80 + Number(r.hasLife)*25 +
        Number(r.hasIcon)*10 + completeness(r)/10;
    };
    return score(b)-score(a) || a.title.localeCompare(b.title, 'ru');
  }).slice(0, 35);
  return matched.flatMap((r) => {
    const title = language === 'uk' ? r.title_uk || r.title : r.title;
    const base = {feast: r.feast, date: r.date};
    const results = [{
      id: 'calendar-name:' + r.date + ':' + titleKey(r.title),
      group: 'calendar', kind: 'calendar-saint',
      title: (isLifeQuery && r.hasLife ? (language === 'uk' ? 'Житіє — ' : 'Житие — ') : '') + title,
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
