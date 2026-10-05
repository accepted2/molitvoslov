import {APP_LANGUAGES, normalizeAppLanguage} from './languagePreferences';

export const READER_LANGUAGE_MODES = {
  CHURCH: 'church',
  BOTH: 'both',
  RUSSIAN: 'russian',
  UKRAINIAN: 'ukrainian',
  TRADITIONAL: 'traditional',
};

export const getReaderModeForAppLanguage = (
  language,
  {
    hasRussian = false,
    hasUkrainian = false,
  } = {}
) => {
  const appLanguage = normalizeAppLanguage(language);

  if (appLanguage === APP_LANGUAGES.CU) {
    return READER_LANGUAGE_MODES.CHURCH;
  }

  if (appLanguage === APP_LANGUAGES.UK) {
    if (hasUkrainian) {
      return READER_LANGUAGE_MODES.UKRAINIAN;
    }

    if (hasRussian) {
      return READER_LANGUAGE_MODES.RUSSIAN;
    }

    return READER_LANGUAGE_MODES.CHURCH;
  }

  return hasRussian
    ? READER_LANGUAGE_MODES.RUSSIAN
    : READER_LANGUAGE_MODES.CHURCH;
};

export const buildReaderLanguageOptions = ({
  hasRussian = false,
  hasUkrainian = false,
  hasTraditional = false,
} = {}) => [
  {
    key: READER_LANGUAGE_MODES.CHURCH,
    label: 'ЦС',
  },
  {
    key: READER_LANGUAGE_MODES.UKRAINIAN,
    label: 'Укр.',
    disabled: !hasUkrainian,
  },
  {
    key: READER_LANGUAGE_MODES.RUSSIAN,
    label: 'Рус.',
    disabled: !hasRussian,
  },
  {
    key: READER_LANGUAGE_MODES.BOTH,
    label: 'ЦС + Рус.',
    disabled: !hasRussian,
  },
  {
    key: READER_LANGUAGE_MODES.TRADITIONAL,
    label: 'ЦС традиц.',
    disabled: !hasTraditional,
  },
];
