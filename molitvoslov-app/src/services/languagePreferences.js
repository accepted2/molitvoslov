import * as SecureStore from 'expo-secure-store';

const APP_LANGUAGE_KEY = 'molitvoslov_app_language';
const LEGACY_CALENDAR_LANGUAGE_KEY = 'church_calendar_language';

export const APP_LANGUAGES = {
  RU: 'ru',
  UK: 'uk',
};

export const LANGUAGE_OPTIONS = [
  {value: APP_LANGUAGES.RU, label: 'РУ'},
  {value: APP_LANGUAGES.UK, label: 'УК'},
];

export const normalizeAppLanguage = (language) => {
  if (language === APP_LANGUAGES.UK) {
    return APP_LANGUAGES.UK;
  }

  return APP_LANGUAGES.RU;
};

export const getCalendarDataLanguage = (language) =>
  normalizeAppLanguage(language) === APP_LANGUAGES.UK ? APP_LANGUAGES.UK : APP_LANGUAGES.RU;

export const getAppLanguage = async () => {
  try {
    const stored = await SecureStore.getItemAsync(APP_LANGUAGE_KEY);

    if (stored) {
      const normalized = normalizeAppLanguage(stored);

      if (stored !== normalized) {
        await SecureStore.setItemAsync(APP_LANGUAGE_KEY, normalized);
      }

      return normalized;
    }

    // Миграция старой настройки языка календаря.
    const legacy = await SecureStore.getItemAsync(LEGACY_CALENDAR_LANGUAGE_KEY);
    const migrated = normalizeAppLanguage(legacy);

    await SecureStore.setItemAsync(APP_LANGUAGE_KEY, migrated);

    return migrated;
  } catch {
    return APP_LANGUAGES.RU;
  }
};

export const setAppLanguage = async (language) => {
  const next = normalizeAppLanguage(language);

  try {
    await SecureStore.setItemAsync(APP_LANGUAGE_KEY, next);

    // Пока календарный API поддерживает RU/UK, сохраняем совместимое
    // legacy-значение для старых частей приложения/виджетов.
    await SecureStore.setItemAsync(LEGACY_CALENDAR_LANGUAGE_KEY, getCalendarDataLanguage(next));
  } catch (error) {
    console.log('Не удалось сохранить язык приложения:', error?.message || error);
  }

  return next;
};
