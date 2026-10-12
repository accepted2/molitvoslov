import AsyncStorage from '@react-native-async-storage/async-storage';

import {normalizeSearchText} from './searchIndex';

const SEARCH_HISTORY_KEY = '@molitvoslov/search-history/v1';
const MAX_HISTORY_ITEMS = 8;

const cleanQuery = (value) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

export const getSearchHistory = async () => {
  try {
    const raw = await AsyncStorage.getItem(SEARCH_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];

    return Array.isArray(parsed)
      ? parsed.map(cleanQuery).filter(Boolean).slice(0, MAX_HISTORY_ITEMS)
      : [];
  } catch (error) {
    console.log('Ошибка чтения истории поиска:', error?.message || error);
    return [];
  }
};

export const addSearchHistory = async (query) => {
  const clean = cleanQuery(query);

  if (clean.length < 2) {
    return getSearchHistory();
  }

  const current = await getSearchHistory();
  const normalized = normalizeSearchText(clean);

  const next = [
    clean,
    ...current.filter((item) => normalizeSearchText(item) !== normalized),
  ].slice(0, MAX_HISTORY_ITEMS);

  await AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));

  return next;
};

export const clearSearchHistory = async () => {
  await AsyncStorage.removeItem(SEARCH_HISTORY_KEY);
};
