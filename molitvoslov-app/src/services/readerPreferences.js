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

  return SUPPORTED_MODES.has(storedMode) ? storedMode : null;
};

export const saveReaderLanguageModePreference = async ({sourceType, sourceId, mode}) => {
  if (!sourceId || !SUPPORTED_MODES.has(mode)) {
    return;
  }

  await AsyncStorage.setItem(buildStorageKey({sourceType, sourceId}), mode);
};
