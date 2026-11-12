import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'bible.translationCode.v1';

const normalize = (code) => code === 'csl_traditional' ? 'csl_traditional' : 'rst';

export const getPreferredBibleTranslation = async () => {
  try {
    return normalize(await AsyncStorage.getItem(STORAGE_KEY));
  } catch {
    return 'rst';
  }
};

export const savePreferredBibleTranslation = (code) =>
  AsyncStorage.setItem(STORAGE_KEY, normalize(code));

// Calendar Bible translation is independent of the reader's preferred translation.
const CALENDAR_STORAGE_KEY = 'calendar.bible.translationCode.v1';
export const getCalendarBibleTranslation = async () => {
  try {
    return normalize(await AsyncStorage.getItem(CALENDAR_STORAGE_KEY));
  } catch {
    return 'rst';
  }
};
export const saveCalendarBibleTranslation = (code) =>
  AsyncStorage.setItem(CALENDAR_STORAGE_KEY, normalize(code));
