import AsyncStorage from '@react-native-async-storage/async-storage';

import {READER_LANGUAGE_MODES, setDefaultReaderMode} from './readerLanguageModes';
import {getCachedBackendUser} from './backendAuth';
// Cloud sync is required lazily in the user action to avoid a circular
// module initialization (the sync layer also imports global preferences).

const readerSettingsListeners = new Set();
export const subscribeReadingSettings = (listener) => {
  readerSettingsListeners.add(listener);
  return () => readerSettingsListeners.delete(listener);
};
const notifyReadingSettings = (value) => {
  for (const listener of readerSettingsListeners) listener(value);
};
export const INTERFACE_SCALES = [1, 1.1, 1.25];
const normalizeInterfaceScale = (value) =>
  INTERFACE_SCALES.includes(Number(value)) ? Number(value) : 1;


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
export const makeReaderPreferenceId = (sourceType, sourceId) =>
  `${String(sourceType || 'reader')}:${encodeURIComponent(String(sourceId || ''))}`;
export const getAccountReaderModeStorageKey = (userId, scope) =>
  `@molitvoslov/reader-language-mode/v2:account-${encodeURIComponent(String(userId))}:${scope}`;

export const getReaderLanguageModePreference = async ({sourceType, sourceId}) => {
  if (!sourceId) return null;
  const user = await getCachedBackendUser().catch(() => null);
  if (user?.id) {
    const accountMode = await AsyncStorage.getItem(
      getAccountReaderModeStorageKey(user.id, makeReaderPreferenceId(sourceType, sourceId)),
    );
    if (SUPPORTED_MODES.has(accountMode)) return accountMode;
    // A signed-in account with no local override inherits its cloud/global mode.
    return (await getReadingSettings()).defaultMode;
  }
  // Legacy guest preferences remain readable.
  const legacy = await AsyncStorage.getItem(buildStorageKey({sourceType, sourceId}));
  if (SUPPORTED_MODES.has(legacy)) return legacy;
  return (await getReadingSettings()).defaultMode;
};

export const saveReaderLanguageModePreference = async ({sourceType, sourceId, mode}) => {
  if (!sourceId || !SUPPORTED_MODES.has(mode)) return;
  const user = await getCachedBackendUser().catch(() => null);
  const scope = makeReaderPreferenceId(sourceType, sourceId);
  if (user?.id) {
    await AsyncStorage.setItem(getAccountReaderModeStorageKey(user.id, scope), mode);
    const {queueAccountPreferencePatch} = require('./accountPreferencesSync');
    queueAccountPreferencePatch({reader_modes: {[scope]: mode}}).catch(console.warn);
  } else {
    await AsyncStorage.setItem(buildStorageKey({sourceType, sourceId}), mode);
  }
};


const GLOBAL_PREFERENCES_KEY = '@molitvoslov/reading-settings/v1';
export const DEFAULT_READING_SETTINGS = {
  defaultMode: READER_LANGUAGE_MODES.CHURCH,
  fontSize: 17,
  interfaceScale: 1,
  palette: 'parchment',
  customBackground: '#FFF4DE',
  customText: '#3E2A1D',
};
const PALETTES = new Set(['parchment', 'warm', 'ivory', 'night', 'custom']);
const safeHex = (value, fallback) => /^#[0-9a-fA-F]{6}$/.test(String(value)) ? value : fallback;
export const getReadingSettings = async () => {
  try {
    const raw = await AsyncStorage.getItem(GLOBAL_PREFERENCES_KEY);
    const data = raw ? JSON.parse(raw) : {};
    const result = {
      defaultMode: SUPPORTED_MODES.has(data.defaultMode) ? data.defaultMode : DEFAULT_READING_SETTINGS.defaultMode,
      fontSize: Number.isFinite(Number(data.fontSize)) ? Math.max(14, Math.min(28, Number(data.fontSize))) : 17,
      interfaceScale: normalizeInterfaceScale(data.interfaceScale),
      palette: PALETTES.has(data.palette) ? data.palette : 'parchment',
      customBackground: safeHex(data.customBackground, '#FFF4DE'),
      customText: safeHex(data.customText, '#3E2A1D'),
    };
    setDefaultReaderMode(result.defaultMode);
    return result;
  } catch {
    return {...DEFAULT_READING_SETTINGS};
  }
};
export const saveReadingSettings = async (settings) => {
  const merged = {...(await getReadingSettings()), ...settings};
  const result = {
    defaultMode: SUPPORTED_MODES.has(merged.defaultMode) ? merged.defaultMode : DEFAULT_READING_SETTINGS.defaultMode,
    fontSize: Math.max(14, Math.min(28, Number(merged.fontSize) || 17)),
    interfaceScale: normalizeInterfaceScale(merged.interfaceScale),
    palette: PALETTES.has(merged.palette) ? merged.palette : 'parchment',
    customBackground: safeHex(merged.customBackground, '#FFF4DE'),
    customText: safeHex(merged.customText, '#3E2A1D'),
  };
  await AsyncStorage.setItem(GLOBAL_PREFERENCES_KEY, JSON.stringify(result));
  setDefaultReaderMode(result.defaultMode);
  notifyReadingSettings(result);
  return result;
};

export const resetReadingSettings = async () => {
  await AsyncStorage.removeItem(GLOBAL_PREFERENCES_KEY);
  setDefaultReaderMode(DEFAULT_READING_SETTINGS.defaultMode);
  notifyReadingSettings(DEFAULT_READING_SETTINGS);
  return {...DEFAULT_READING_SETTINGS};
};
