import AsyncStorage from '@react-native-async-storage/async-storage';
import {getDatabase} from '../db/database';
import {
  applyYearMarkers,
  applyYearMarkersToMonth,
  getBundledYearMarkers,
  loadYearMarkers,
} from './calendarYearMarkers';

const STORAGE_PREFIX = 'calendar-day-v3';

const bundledMonthLoaders = {
  '2025-01': () => require('../data/calendar/2025-01.json'),
  '2025-02': () => require('../data/calendar/2025-02.json'),
  '2025-03': () => require('../data/calendar/2025-03.json'),
  '2025-04': () => require('../data/calendar/2025-04.json'),
  '2025-05': () => require('../data/calendar/2025-05.json'),
  '2025-06': () => require('../data/calendar/2025-06.json'),
  '2025-07': () => require('../data/calendar/2025-07.json'),
  '2025-08': () => require('../data/calendar/2025-08.json'),
  '2025-09': () => require('../data/calendar/2025-09.json'),
  '2025-10': () => require('../data/calendar/2025-10.json'),
  '2025-11': () => require('../data/calendar/2025-11.json'),
  '2025-12': () => require('../data/calendar/2025-12.json'),
  '2026-01': () => require('../data/calendar/2026-01.json'),
  '2026-02': () => require('../data/calendar/2026-02.json'),
  '2026-03': () => require('../data/calendar/2026-03.json'),
  '2026-04': () => require('../data/calendar/2026-04.json'),
  '2026-05': () => require('../data/calendar/2026-05.json'),
  '2026-06': () => require('../data/calendar/2026-06.json'),
  '2026-07': () => require('../data/calendar/2026-07.json'),
  '2026-08': () => require('../data/calendar/2026-08.json'),
  '2026-09': () => require('../data/calendar/2026-09.json'),
  '2026-10': () => require('../data/calendar/2026-10.json'),
  '2026-11': () => require('../data/calendar/2026-11.json'),
  '2026-12': () => require('../data/calendar/2026-12.json'),
  '2027-01': () => require('../data/calendar/2027-01.json'),
  '2027-02': () => require('../data/calendar/2027-02.json'),
  '2027-03': () => require('../data/calendar/2027-03.json'),
  '2027-04': () => require('../data/calendar/2027-04.json'),
  '2027-05': () => require('../data/calendar/2027-05.json'),
  '2027-06': () => require('../data/calendar/2027-06.json'),
  '2027-07': () => require('../data/calendar/2027-07.json'),
  '2027-08': () => require('../data/calendar/2027-08.json'),
  '2027-09': () => require('../data/calendar/2027-09.json'),
  '2027-10': () => require('../data/calendar/2027-10.json'),
  '2027-11': () => require('../data/calendar/2027-11.json'),
  '2027-12': () => require('../data/calendar/2027-12.json'),
};

const bundledMonthCache = new Map();

const getBundledMonthPayload = (year, month) => {
  const key = `${Number(year)}-${String(Number(month)).padStart(2, '0')}`;

  if (bundledMonthCache.has(key)) {
    return bundledMonthCache.get(key);
  }

  const loader = bundledMonthLoaders[key];

  if (!loader) {
    return null;
  }

  const payload = loader();
  bundledMonthCache.set(key, payload);

  return payload;
};

const normalizeLanguage = (language) => (language === 'uk' ? 'uk' : 'ru');

const normalizeDate = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return value.slice(0, 10);
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  return null;
};

const getStorageKey = (date, language) => {
  const dateKey = normalizeDate(date);
  const lang = normalizeLanguage(language);

  if (!dateKey) {
    return null;
  }

  return `${STORAGE_PREFIX}:${lang}:${dateKey}`;
};

const getMonthDateKeys = (year, month) => {
  const normalizedYear = Number(year);
  const normalizedMonth = Number(month);

  if (
    !Number.isInteger(normalizedYear) ||
    !Number.isInteger(normalizedMonth) ||
    normalizedMonth < 1 ||
    normalizedMonth > 12
  ) {
    return [];
  }

  const count = new Date(normalizedYear, normalizedMonth, 0).getDate();
  const monthText = String(normalizedMonth).padStart(2, '0');

  return Array.from(
    {length: count},
    (_item, index) => `${normalizedYear}-${monthText}-${String(index + 1).padStart(2, '0')}`
  );
};

/*
 * Данные, уже сохранённые на телефоне.
 * Они имеют приоритет над встроенным JSON.
 */
export const getStoredCalendarDay = async (date, language = 'ru') => {
  const key = getStorageKey(date, language);

  if (!key) {
    return null;
  }

  try {
    // Delta days are committed atomically with public/Bible snapshots in SQLite.
    const db = await getDatabase();
    const row = await db.getFirstAsync(
      'SELECT payload FROM content_delta_calendar WHERE date = ? AND language = ?',
      [normalizeDate(date), normalizeLanguage(language)]
    );
    if (row?.payload) return JSON.parse(row.payload);
    const raw = await AsyncStorage.getItem(key);

    if (!raw) {
      return null;
    }

    return JSON.parse(raw);
  } catch (error) {
    console.log('Ошибка чтения calendar cache:', error?.message || error);

    return null;
  }
};

/*
 * Встроенный календарь из APK.
 */
export const getBundledCalendarDay = (date, language = 'ru') => {
  const dateKey = normalizeDate(date);
  const lang = normalizeLanguage(language);

  if (!dateKey) {
    return null;
  }

  const [year, month] = dateKey.split('-').map(Number);
  const payload = getBundledMonthPayload(year, month);

  return applyYearMarkers(payload?.days?.[dateKey]?.[lang] || null, getBundledYearMarkers(year));
};

/*
 * Мгновенный месяц прямо из JS bundle.
 * Здесь нет AsyncStorage и сети, поэтому экран может переключить
 * сетку сразу, а более свежие данные догрузить следом в фоне.
 */
export const getBundledCalendarMonth = (year, month, language = 'ru') => {
  const lang = normalizeLanguage(language);
  const dateKeys = getMonthDateKeys(year, month);
  const payload = getBundledMonthPayload(year, month);

  if (!dateKeys.length || !payload) {
    return null;
  }

  const days = dateKeys.map((dateKey) => payload?.days?.[dateKey]?.[lang] || null).filter(Boolean);

  if (!days.length) {
    return null;
  }

  return {
    year: Number(year),
    month: Number(month),
    language: lang,
    days: days.map((day) => applyYearMarkers(day, getBundledYearMarkers(year))),
    total_days: days.length,
    start_date: dateKeys[0],
    end_date: dateKeys[dateKeys.length - 1],
    source_error: null,
    offline: true,
  };
};

/*
 * Лучший локальный вариант дня:
 * сначала более свежий кэш телефона, затем встроенный JSON из APK.
 */
export const getOfflineCalendarDay = async (date, language = 'ru') => {
  const stored = await getStoredCalendarDay(date, language);

  const day = stored || getBundledCalendarDay(date, language);
  const year = Number(normalizeDate(date)?.slice(0, 4));
  return applyYearMarkers(day, await loadYearMarkers(year));
};

/*
 * Собираем целый месяц без сети.
 * Для каждого дня кэш телефона перекрывает встроенный JSON.
 * Благодаря этому исправления, однажды полученные с сервера,
 * остаются доступны после отключения интернета.
 */
export const getOfflineCalendarMonth = async (year, month, language = 'ru') => {
  const lang = normalizeLanguage(language);
  const dateKeys = getMonthDateKeys(year, month);

  if (!dateKeys.length) {
    return null;
  }

  let storedByDate = new Map();

  try {
    const storageKeys = dateKeys.map((dateKey) => getStorageKey(dateKey, lang));
    const pairs = await AsyncStorage.multiGet(storageKeys);

    storedByDate = new Map(
      pairs
        .map(([key, raw], index) => {
          if (!raw) {
            return null;
          }

          try {
            return [dateKeys[index], JSON.parse(raw)];
          } catch {
            return null;
          }
        })
        .filter(Boolean)
    );
  } catch (error) {
    console.log('Ошибка чтения calendar month cache:', error?.message || error);
  }

  // Atomic SQLite overrides take precedence over the older AsyncStorage cache.
  try {
    const db = await getDatabase();
    const rows = await db.getAllAsync(
      'SELECT date, payload FROM content_delta_calendar WHERE date >= ? AND date <= ? AND language = ?',
      [dateKeys[0], dateKeys[dateKeys.length - 1], lang]
    );
    for (const row of rows) storedByDate.set(row.date, JSON.parse(row.payload));
  } catch (error) {
    console.log('Ошибка чтения атомарного calendar cache:', error?.message || error);
  }

  const bundledMonth = getBundledMonthPayload(year, month);

  const days = dateKeys
    .map((dateKey) => storedByDate.get(dateKey) || bundledMonth?.days?.[dateKey]?.[lang] || null)
    .filter(Boolean);

  if (!days.length) {
    return null;
  }

  return applyYearMarkersToMonth(
    {
      year: Number(year),
      month: Number(month),
      language: lang,
      days,
      total_days: days.length,
      start_date: dateKeys[0],
      end_date: dateKeys[dateKeys.length - 1],
      source_error: null,
      offline: true,
    },
    await loadYearMarkers(year)
  );
};

/*
 * Сохраняем свежий день, полученный с сервера.
 */
export const storeCalendarDay = async (date, language = 'ru', data) => {
  if (!data) {
    return false;
  }

  const key = getStorageKey(date, language);

  if (!key) {
    return false;
  }

  try {
    await AsyncStorage.setItem(key, JSON.stringify(data));

    return true;
  } catch (error) {
    console.log('Ошибка сохранения calendar cache:', error?.message || error);

    return false;
  }
};

/*
 * Сохраняем все дни свежего месяца.
 */
export const storeCalendarMonth = async (data, language = 'ru') => {
  const days = Array.isArray(data?.days) ? data.days : [];

  if (!days.length) {
    return false;
  }

  const entries = days
    .map((day) => {
      if (!day?.date_gregorian) {
        return null;
      }

      const key = getStorageKey(day.date_gregorian, language);

      return key ? [key, JSON.stringify(day)] : null;
    })
    .filter(Boolean);

  if (!entries.length) {
    return false;
  }

  try {
    await AsyncStorage.multiSet(entries);

    return true;
  } catch (error) {
    console.log('Ошибка сохранения calendar month cache:', error?.message || error);

    return false;
  }
};

/*
 * Удалить один сохранённый день.
 */
export const removeStoredCalendarDay = async (date, language = 'ru') => {
  const key = getStorageKey(date, language);

  if (!key) {
    return false;
  }

  try {
    await AsyncStorage.removeItem(key);

    return true;
  } catch (error) {
    console.log('Ошибка удаления calendar cache:', error?.message || error);

    return false;
  }
};
