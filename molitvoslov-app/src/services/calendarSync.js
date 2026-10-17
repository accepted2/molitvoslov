import {getCalendarMonth} from './churchCalendar';
import {syncYearMarkers} from './calendarYearMarkers';

// Shared foreground synchronizer. Network failures never clear the offline calendar.
let running = null;
const recent = new Map();
const FRESH_MS = 5 * 60 * 1000;

const refreshMonth = async (year, month, language, force) => {
  const key = `${language}:${year}-${month}`;
  if (!force && Date.now() - (recent.get(key) || 0) < FRESH_MS) return;
  await getCalendarMonth(year, month, {language, force: true, skipOffline: true});
  recent.set(key, Date.now());
};

export const syncCalendarWindow = ({date = new Date(), neighbors = false, force = false} = {}) => {
  if (running) return running;
  running = (async () => {
    const months = [0, ...(neighbors ? [-1, 1] : [])];
    const targets = months.map((delta) => {
      const value = new Date(date.getFullYear(), date.getMonth() + delta, 1);
      return {year: value.getFullYear(), month: value.getMonth() + 1};
    });
    const jobs = [];
    for (const {year, month} of targets) {
      for (const language of ['ru', 'uk']) {
        jobs.push(refreshMonth(year, month, language, force));
      }
    }
    for (const year of new Set(targets.map((target) => target.year))) {
      jobs.push(syncYearMarkers(year));
    }
    const results = await Promise.allSettled(jobs);
    const rejected = results.filter((item) => item.status === 'rejected');
    if (rejected.length) {
      console.log('Calendar background refresh:', rejected.length, 'requests deferred');
    }
    return {updated: results.some((item) => item.status === 'fulfilled')};
  })().finally(() => { running = null; });
  return running;
};
