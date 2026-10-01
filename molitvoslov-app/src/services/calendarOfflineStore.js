import AsyncStorage from '@react-native-async-storage/async-storage';

import calendar2026 from '../data/calendar_2026.json';


const STORAGE_PREFIX = 'calendar-day';


const normalizeLanguage = (language) =>
  language === 'uk' ? 'uk' : 'ru';


const normalizeDate = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return value.slice(0, 10);
  }

  if (
    value instanceof Date &&
    !Number.isNaN(value.getTime())
  ) {
    const year = value.getFullYear();
    const month = String(
      value.getMonth() + 1
    ).padStart(2, '0');

    const day = String(
      value.getDate()
    ).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  return null;
};


const getStorageKey = (
  date,
  language
) => {
  const dateKey =
    normalizeDate(date);

  const lang =
    normalizeLanguage(language);

  if (!dateKey) {
    return null;
  }

  return `${STORAGE_PREFIX}:${lang}:${dateKey}`;
};


/*
 * Данные, уже сохранённые на телефоне.
 * Они имеют приоритет над встроенным JSON.
 */
export const getStoredCalendarDay = async (
  date,
  language = 'ru'
) => {
  const key =
    getStorageKey(
      date,
      language
    );

  if (!key) {
    return null;
  }

  try {
    const raw =
      await AsyncStorage.getItem(key);

    if (!raw) {
      return null;
    }

    return JSON.parse(raw);
  } catch (error) {
    console.log(
      'Ошибка чтения calendar cache:',
      error?.message || error
    );

    return null;
  }
};


/*
 * Встроенный календарь из APK.
 */
export const getBundledCalendarDay = (
  date,
  language = 'ru'
) => {
  const dateKey =
    normalizeDate(date);

  const lang =
    normalizeLanguage(language);

  if (!dateKey) {
    return null;
  }

  return (
    calendar2026?.days?.[dateKey]?.[lang] ||
    null
  );
};


/*
 * Сохраняем свежий день,
 * полученный позже с сервера.
 */
export const storeCalendarDay = async (
  date,
  language = 'ru',
  data
) => {
  if (!data) {
    return false;
  }

  const key =
    getStorageKey(
      date,
      language
    );

  if (!key) {
    return false;
  }

  try {
    await AsyncStorage.setItem(
      key,
      JSON.stringify(data)
    );

    return true;
  } catch (error) {
    console.log(
      'Ошибка сохранения calendar cache:',
      error?.message || error
    );

    return false;
  }
};


/*
 * Удалить один сохранённый день.
 */
export const removeStoredCalendarDay = async (
  date,
  language = 'ru'
) => {
  const key =
    getStorageKey(
      date,
      language
    );

  if (!key) {
    return false;
  }

  try {
    await AsyncStorage.removeItem(key);

    return true;
  } catch (error) {
    console.log(
      'Ошибка удаления calendar cache:',
      error?.message || error
    );

    return false;
  }
};