export const READER_LANGUAGE_MODES = {
  CHURCH: 'church',
  BOTH: 'both',
  RUSSIAN: 'russian',
  UKRAINIAN: 'ukrainian', // legacy references; not an available prayer-reading mode
  TRADITIONAL: 'traditional',
};

let defaultReaderMode = READER_LANGUAGE_MODES.RUSSIAN;
export const setDefaultReaderMode = (mode) => { defaultReaderMode = mode; };
export const getReaderModeForAppLanguage = (language, {hasRussian = false, hasTraditional = false} = {}) => {
  // The app's UI language chooses the default ONLY. Per-book saved reading
  // mode remains authoritative, and missing traditional texts are not invented.
  if (language === 'csl_traditional' && hasTraditional) {
    return READER_LANGUAGE_MODES.TRADITIONAL;
  }
  if (defaultReaderMode === READER_LANGUAGE_MODES.RUSSIAN || defaultReaderMode === READER_LANGUAGE_MODES.BOTH) {
    return hasRussian ? defaultReaderMode : READER_LANGUAGE_MODES.CHURCH;
  }
  if (defaultReaderMode === READER_LANGUAGE_MODES.TRADITIONAL) {
    return hasTraditional ? defaultReaderMode : READER_LANGUAGE_MODES.CHURCH;
  }
  return READER_LANGUAGE_MODES.CHURCH;
};

export const buildReaderLanguageOptions = ({hasRussian = false, hasTraditional = false, hasChurch = true} = {}) => [
  ...(hasChurch ? [{key: READER_LANGUAGE_MODES.CHURCH, label: 'ЦС'}] : []),
  ...(hasRussian ? [{key: READER_LANGUAGE_MODES.RUSSIAN, label: 'РУС'}] : []),
  ...(hasChurch && hasRussian ? [{key: READER_LANGUAGE_MODES.BOTH, label: 'ЦС + РУС'}] : []),
  ...(hasTraditional ? [{key: READER_LANGUAGE_MODES.TRADITIONAL, label: 'ЦС традиц.'}] : []),
];
