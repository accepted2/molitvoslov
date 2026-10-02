import AsyncStorage from '@react-native-async-storage/async-storage';

import calendar2026 from '../data/calendar_2026.json';

const STORAGE_PREFIX = 'calendar-day';

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
    (_item, index) =>
      `${normalizedYear}-${monthText}-${String(index + 1).padStart(2, '0')}`
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

  return calendar2026?.days?.[dateKey]?.[lang] || null;
};

/*
 * Лучший локальный вариант дня:
 * сначала более свежий кэш телефона, затем встроенный JSON из APK.
 */
export const getOfflineCalendarDay = async (date, language = 'ru') => {
  const stored = await getStoredCalendarDay(date, language);

  if (stored) {
    return stored;
  }

  return getBundledCalendarDay(date, language);
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

  const days = dateKeys
    .map(
      (dateKey) =>
        storedByDate.get(dateKey) || calendar2026?.days?.[dateKey]?.[lang] || null
    )
    .filter(Boolean);

  if (!days.length) {
    return null;
  }

  return {
    year: Number(year),
    month: Number(month),
    language: lang,
    days,
    total_days: days.length,
    start_date: dateKeys[0],
    end_date: dateKeys[dateKeys.length - 1],
    source_error: null,
    offline: true,
  };
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

  await Promise.all(
    days.map((day) =>
      day?.date_gregorian
        ? storeCalendarDay(day.date_gregorian, language, day)
        : Promise.resolve(false)
    )
  );

  return true;
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
