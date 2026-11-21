import {getLocalizedField, getLocalizedTextTitle} from './localizedContent';

const COMMUNION_SLUG = 'posledovanie-ko-svyatomu-prichashcheniyu';

// Display names in the "Continue Reading" surfaces only. Stable source
// identifiers, stored names, anchors and navigation routes never change.
export const getProgressEntityTitle = (entity, field, language, t) => {
  if (!entity) return '';
  const localized = getLocalizedField(entity, field, language);
  if (language === 'csl_traditional' && field === 'name' &&
      entity.slug === COMMUNION_SLUG) {
    return t('communion.sequence');
  }
  return localized;
};

export const getProgressSectionTitle = (item, language) => {
  if (!item) return '';
  return getLocalizedTextTitle(item.text || item, language) ||
    getLocalizedField(item, 'title', language);
};
