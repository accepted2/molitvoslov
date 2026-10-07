import {APP_LANGUAGES, normalizeAppLanguage} from './languagePreferences';

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

export const getLocalizedTextTitle = (text, language) => {
  if (!text) return '';

  const lang = normalizeAppLanguage(language);

  if (lang === APP_LANGUAGES.UK) {
    return clean(text.title_uk) || clean(text.title);
  }

  return clean(text.title);
};

export const getLocalizedTextDescription = (text, language) => {
  if (!text) return '';

  const lang = normalizeAppLanguage(language);

  if (lang === APP_LANGUAGES.UK) {
    return clean(text.description_uk) || clean(text.description);
  }

  return clean(text.description);
};

export const getLocalizedTextContent = (text, language) => {
  if (!text) return '';

  const lang = normalizeAppLanguage(language);

  if (lang === APP_LANGUAGES.UK) {
    return (
      clean(text.translation_uk) ||
      clean(text.translation) ||
      clean(text.content) ||
      clean(text.traditional_content)
    );
  }

  return clean(text.translation) || clean(text.content) || clean(text.traditional_content);
};

export const getLocalizedField = (item, field, language, fallbackField = field) => {
  if (!item) return '';

  const lang = normalizeAppLanguage(language);

  if (lang === APP_LANGUAGES.UK) {
    const ukField = `${field}_uk`;
    return clean(item[ukField]) || clean(item[fallbackField]);
  }

  return clean(item[fallbackField]);
};
