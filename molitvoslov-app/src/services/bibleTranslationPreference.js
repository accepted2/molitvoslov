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
