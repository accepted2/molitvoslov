// Pure reading/import presentation helpers. Do not modify user-owned SQLite rows.
export const normalizePrayerLabel = value => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f\u0483-\u0489]/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').toLowerCase().trim();

export const calendarSectionTitle = (section, feastTitle) => {
  const name = String(feastTitle || '').trim();
  const sectionName = String(section || '').trim().toLowerCase();
  const generic = sectionName === 'troparion' ? 'Тропарь'
    : sectionName === 'kontakion' ? 'Кондак' : '';
  return generic && name ? generic + ': ' + name : generic;
};

export const savedPrayerTitle = item => {
  const label = String(item?.item_title || '').trim();
  const metadata = item?.metadata || {};
  const sourceTitle = String(metadata.feast_title || item?.source_title || '').trim();
  const normalized = normalizePrayerLabel(label);
  if (['тропарь', 'кондак', 'тропар', 'кондакъ'].includes(normalized)) {
    return calendarSectionTitle(normalized.startsWith('тропар') ? 'troparion' : 'kontakion', sourceTitle) || label;
  }
  return label || String(item?.source_title || '').trim() || 'Молитва';
};

export const choosePrayerLanguage = ({church, russian, selected, language}) => {
  const explicit = String(language || '').toLowerCase();
  if (explicit === 'russian' || explicit === 'ru') return 'russian';
  if (['church', 'church_slavonic', 'cs', 'traditional'].includes(explicit)) return 'church';
  const sample = normalizePrayerLabel(selected);
  const c = normalizePrayerLabel(church);
  const ru = normalizePrayerLabel(russian);
  if (sample.length >= 12) {
    const inChurch = c.includes(sample);
    const inRussian = ru.includes(sample);
    if (inRussian && !inChurch) return 'russian';
    if (inChurch && !inRussian) return 'church';
    const beginning = sample.slice(0, Math.min(56, sample.length));
    if (ru.includes(beginning) && !c.includes(beginning)) return 'russian';
  }
  return 'church';
};

export const presentPersonalPrayer = prayer => {
  const origin = prayer?.origin_data || {};
  const metadata = origin.metadata || {};
  const originalTitle = String(prayer?.title || '').trim();
  let title = originalTitle;
  const calendarType = String(metadata.section || origin.section || '').toLowerCase();
  const feastName = String(metadata.feast_title || origin.feast_title || '').trim();
  if (['тропарь', 'тропар', 'кондак'].includes(normalizePrayerLabel(title))) {
    title = calendarSectionTitle(title.toLowerCase().startsWith('тропар') ? 'troparion' : 'kontakion', feastName) || title;
  } else if ((calendarType === 'troparion' || calendarType === 'kontakion') && !title) {
    title = calendarSectionTitle(calendarType, feastName);
  }

  let text = String(prayer?.text || '');
  // Previous library imports wrongly merged two complete language variants.
  // Only correct known imports at presentation time; never mutate saved rows.
  const oldParallel = text.match(/^([\s\S]+?)\n\s*Русский перевод\s*\n([\s\S]+)$/u);
  if (oldParallel && ['library', 'saved'].includes(origin.search_source === 'global_prayer_search' ? 'library' : prayer?.origin_type)) {
    const lang = choosePrayerLanguage({
      church: oldParallel[1], russian: oldParallel[2],
      selected: originalTitle, language: origin.language || metadata.language,
    });
    text = (lang === 'russian' ? oldParallel[2] : oldParallel[1]).trim();
  }
  const normalizedTitle = normalizePrayerLabel(originalTitle);
  const normalizedText = normalizePrayerLabel(text);
  const titleLooksCopied = normalizedTitle.length >= 16 &&
    (normalizedText.startsWith(normalizedTitle) ||
     (normalizedTitle.length > 32 && normalizedText.startsWith(normalizedTitle.slice(0, 32))));
  const autoTitle = origin.auto_generated_title === true ||
    (prayer?.origin_type !== 'custom' && titleLooksCopied);
  const genericUntitled = prayer?.origin_type !== 'custom' &&
    ['молитва', 'без названия'].includes(normalizedTitle);
  const displayTitle = autoTitle || genericUntitled ? '' : title;
  return {
    title: displayTitle,
    listTitle: displayTitle || 'Молитва',
    text,
  };
};
