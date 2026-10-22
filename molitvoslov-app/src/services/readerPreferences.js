import AsyncStorage from '@react-native-async-storage/async-storage';

import {READER_LANGUAGE_MODES} from './readerLanguageModes';

const STORAGE_PREFIX = '@molitvoslov/reader-language-mode/v1';

const SUPPORTED_MODES = new Set([
  READER_LANGUAGE_MODES.CHURCH,
  READER_LANGUAGE_MODES.RUSSIAN,
  READER_LANGUAGE_MODES.BOTH,
  READER_LANGUAGE_MODES.TRADITIONAL,
]);

const buildStorageKey = ({sourceType, sourceId}) =>
  `${STORAGE_PREFIX}:${encodeURIComponent(String(sourceType || 'reader'))}:${encodeURIComponent(
    String(sourceId || '')
  )}`;

export const getReaderLanguageModePreference = async ({sourceType, sourceId}) => {
  if (!sourceId) {
    return null;
  }

  const storedMode = await AsyncStorage.getItem(buildStorageKey({sourceType, sourceId}));

  return SUPPORTED_MODES.has(storedMode) ? storedMode : (await getReadingSettings()).defaultMode;
};

export const saveReaderLanguageModePreference = async ({sourceType, sourceId, mode}) => {
  if (!sourceId || !SUPPORTED_MODES.has(mode)) {
    return;
  }

  await AsyncStorage.setItem(buildStorageKey({sourceType, sourceId}), mode);
};


const GLOBAL_PREFERENCES_KEY = '@molitvoslov/reading-settings/v1';
export const DEFAULT_READING_SETTINGS = {
  defaultMode: READER_LANGUAGE_MODES.RUSSIAN,
  fontSize: 17,
  palette: 'parchment',
};
const PALETTES = new Set(['parchment', 'warm', 'ivory', 'night']);
export const getReadingSettings = async () => {
  try {
    const raw = await AsyncStorage.getItem(GLOBAL_PREFERENCES_KEY);
    const data = raw ? JSON.parse(raw) : {};
    return {
      defaultMode: SUPPORTED_MODES.has(data.defaultMode) ? data.defaultMode : DEFAULT_READING_SETTINGS.defaultMode,
      fontSize: Number.isFinite(Number(data.fontSize)) ? Math.max(14, Math.min(28, Number(data.fontSize))) : 17,
      palette: PALETTES.has(data.palette) ? data.palette : 'parchment',
    };
  } catch {
    return {...DEFAULT_READING_SETTINGS};
  }
};
export const saveReadingSettings = async (settings) => {
  const merged = {...(await getReadingSettings()), ...settings};
  const result = {
    defaultMode: SUPPORTED_MODES.has(merged.defaultMode) ? merged.defaultMode : DEFAULT_READING_SETTINGS.defaultMode,
    fontSize: Math.max(14, Math.min(28, Number(merged.fontSize) || 17)),
    palette: PALETTES.has(merged.palette) ? merged.palette : 'parchment',
  };
  await AsyncStorage.setItem(GLOBAL_PREFERENCES_KEY, JSON.stringify(result));
  return result;
};
