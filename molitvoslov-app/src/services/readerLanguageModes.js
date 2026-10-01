export const READER_LANGUAGE_MODES = {
  CHURCH: 'church',
  BOTH: 'both',
  RUSSIAN: 'russian',
  TRADITIONAL: 'traditional',
};

export const buildReaderLanguageOptions = ({
  hasRussian = false,
  hasTraditional = false,
} = {}) => [
  {
    key: READER_LANGUAGE_MODES.CHURCH,
    label: 'ЦС',
  },
  {
    key: READER_LANGUAGE_MODES.BOTH,
    label: 'ЦС + Рус.',
    disabled: !hasRussian,
  },
  {
    key: READER_LANGUAGE_MODES.RUSSIAN,
    label: 'Рус.',
    disabled: !hasRussian,
  },
  {
    key: READER_LANGUAGE_MODES.TRADITIONAL,
    label: 'ЦС традиц.',
    disabled: !hasTraditional,
  },
];
