import AsyncStorage from '@react-native-async-storage/async-storage';
import {API_BASE_URL} from './backendAuth';
import {publishCalendarUpdate} from './calendarEvents';

const PREFIX = '@molitvoslov/calendar-markers-v1:';
const REFRESH_MS = 24 * 60 * 60 * 1000;
const memory = new Map();
const bundled2026 = () => {
  try {
    return require('../data/calendar/markers-2026.json')?.days || {};
  } catch {
    return {};
  }
};
export const getBundledYearMarkers = (year) => (Number(year) === 2026 ? bundled2026() : {});
let pending = null;

export const loadYearMarkers = async (year) => {
  const key = Number(year);
  if (memory.has(key)) return memory.get(key);
  try {
    const raw = await AsyncStorage.getItem(`${PREFIX}${key}`);
    const value = raw ? JSON.parse(raw) : {days: key === 2026 ? bundled2026() : {}};
    const days = value?.days && typeof value.days === 'object' ? value.days : {};
    const merged = {...getBundledYearMarkers(key), ...days};
    memory.set(key, merged);
    return merged;
  } catch {
    return getBundledYearMarkers(key);
  }
};

// The marker cache overlays only fasting-related fields; saint content remains untouched.
export const applyYearMarkers = (day, markersByDate) => {
  if (!day?.date_gregorian) return day;
  const patch = markersByDate?.[day.date_gregorian];
  if (!patch?.calendar_markers) return day;
  return {...day, ...patch, calendar_markers: {...day.calendar_markers, ...patch.calendar_markers}};
};

export const applyYearMarkersToMonth = (month, markersByDate) =>
  month
    ? {...month, days: (month.days || []).map((day) => applyYearMarkers(day, markersByDate))}
    : month;

const pendingByYear = new Map();

export const syncYearMarkers = async (targetYear) => {
  const year = Number(targetYear);
  if (!Number.isInteger(year) || year < 1900 || year > 2200) return {updated: false};
  if (pendingByYear.has(year)) return pendingByYear.get(year);

  const task = (async () => {
    const stampKey = `${PREFIX}${year}:checked`;
    const checked = Number((await AsyncStorage.getItem(stampKey)) || 0);
    if (Date.now() - checked < REFRESH_MS) return {updated: false};

    const response = await fetch(`${API_BASE_URL}/api/calendar/year-markers/?year=${year}`);
    if (!response.ok) throw new Error(`Calendar markers HTTP ${response.status}`);
    const payload = await response.json();
    const expectedDays = (new Date(year, 1, 29).getMonth() === 1) ? 366 : 365;
    if (
      Number(payload?.year) !== year ||
      payload?.total_days !== expectedDays ||
      !payload?.days ||
      Object.keys(payload.days).length !== expectedDays
    ) {
      throw new Error(`Calendar markers: incomplete ${year} year; keeping local data`);
    }

    await AsyncStorage.setItem(`${PREFIX}${year}`, JSON.stringify(payload));
    memory.set(year, {...getBundledYearMarkers(year), ...payload.days});
    await AsyncStorage.setItem(stampKey, String(Date.now()));
    publishCalendarUpdate({kind: 'markers', year});
    return {updated: true};
  })().finally(() => { pendingByYear.delete(year); });

  pendingByYear.set(year, task);
  return task;
};

export const syncYearMarkers2026 = () => syncYearMarkers(2026);
