import {APP_LANGUAGES, normalizeAppLanguage} from './languagePreferences';

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

export const getLocalizedTextTitle = (text, language) => {
  if (!text) return '';

  const lang = normalizeAppLanguage(language);

  if (lang === APP_LANGUAGES.UK) {
    return clean(text.title_uk) || clean(text.title);
  }
  if (lang === APP_LANGUAGES.CSL_TRADITIONAL) {
    return clean(text.title_traditional) || clean(text.traditionalTitle) ||
      clean(text.title_church) || clean(text.title_cs) || clean(text.title);
  }

  return clean(text.title);
};

export const getLocalizedTextDescription = (text, language) => {
  if (!text) return '';

  const lang = normalizeAppLanguage(language);

  if (lang === APP_LANGUAGES.UK) {
    return clean(text.description_uk) || clean(text.description);
  }
  if (lang === APP_LANGUAGES.CSL_TRADITIONAL) {
    return clean(text.description_traditional) ||
      clean(text.traditionalDescription) || clean(text.description_cs) ||
      clean(text.description);
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

  if (lang === APP_LANGUAGES.CSL_TRADITIONAL) {
    return clean(text.traditional_content) || clean(text.traditionalContent) ||
      clean(text.content) || clean(text.translation);
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

  if (lang === APP_LANGUAGES.CSL_TRADITIONAL) {
    return clean(item[field + '_traditional']) ||
      clean(item['traditional' + field.charAt(0).toUpperCase() + field.slice(1)]) ||
      clean(item[field + '_cs']) ||
      clean(item[fallbackField]);
  }
  return clean(item[fallbackField]);
};
