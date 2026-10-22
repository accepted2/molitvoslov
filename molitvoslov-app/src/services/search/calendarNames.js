import {getBundledCalendarMonth} from '../calendarOfflineStore';
import {normalizeSearchText} from './normalize';

// Search only short memorial titles; never index long lives or hymn bodies.
let catalogPromise = null;
const canonical = (title) => normalizeSearchText(title).replace(/никола[яюи]\b/g, 'николай');
const buildCatalog = async () => {
  const result = [];
  const seen = new Map();
  for (let month = 1; month <= 12; month += 1) {
    const payload = getBundledCalendarMonth(2026, month, 'ru');
    for (const day of payload?.days || []) {
      const date = day.date_gregorian;
      for (const feast of day.all_feasts || (day.main_feast ? [day.main_feast] : [])) {
        if (!date || !feast?.title) continue;
        const identity = String(feast.sync_uid || feast.id || feast.title);
        const record = {
          identity, date, id: feast.id, sync_uid: feast.sync_uid,
          title: feast.title, title_uk: feast.title_uk || '',
          hasLife: !!feast.life_content, hasTroparion: !!feast.troparion_content,
          hasKontakion: !!feast.kontakion_content,
          hasIcon: !!feast.icon_url || !!feast.icon,
        };
        const previous = seen.get(identity);
        const score = (item) => Number(item.hasLife) * 4 + Number(item.hasIcon) * 2 + Number(item.hasTroparion) + Number(item.hasKontakion);
        if (!previous || score(record) > score(previous)) seen.set(identity, record);
      }
    }
    // Allow the main search interface to continue rendering between months.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  result.push(...seen.values());
  return result;
};
export const searchCalendarNames = async (query, language = 'ru') => {
  const key = canonical(query);
  if (key.length < 3) return [];
  if (!catalogPromise) catalogPromise = buildCatalog().catch((error) => {
    catalogPromise = null;
    throw error;
  });
  const catalog = await catalogPromise;
  const matches = catalog.filter((record) => {
    const title = language === 'uk' ? (record.title_uk || record.title) : record.title;
    return canonical(title).includes(key) || canonical(record.title).includes(key);
  }).slice(0, 24);
  return matches.flatMap((record) => {
    const name = language === 'uk' ? (record.title_uk || record.title) : record.title;
    const base = {date: record.date, feastId: record.id, feastUid: record.sync_uid, feastTitle: record.title};
    const rows = [{
      id: 'calendar-name:' + record.identity,
      group: 'calendar', kind: 'calendar-saint', title: name, snippet: '',
      route: {name: 'SaintDetail', params: {...base, focusSection: record.hasLife ? 'life' : undefined}},
    }];
    for (const [kind, label, has] of [
      ['troparion', language === 'uk' ? 'Тропар' : 'Тропарь', record.hasTroparion],
      ['kontakion', language === 'uk' ? 'Кондак' : 'Кондак', record.hasKontakion],
    ]) {
      if (!has) continue;
      rows.push({
        id: 'calendar-name:' + record.identity + ':' + kind,
        group: 'calendar', kind: 'calendar-' + kind,
        title: label + ' — ' + name, snippet: '',
        route: {name: 'SaintDetail', params: {...base, focusSection: kind}},
      });
    }
    return rows;
  });
};
