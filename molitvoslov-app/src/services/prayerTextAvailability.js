// Availability of each prayer language is determined by its actual text,
// never by the app's global default. These helpers are shared by the
// standalone prayer reader, prayer rules, and placeholder readers.
const hasRealPrayerText = value => {
  const text = String(value || '').trim();
  if (!text) return false;
  // Legacy placeholder records sometimes contain an explanatory sentence in
  // the source field. Treat only the whole known placeholder as missing.
  return !/^(?:текст (?:церковнославянской версии|в традиционном написании)(?: пока отсутствует| будет добавлен позже)|русский перевод будет добавлен позже|перевод пока отсутствует)\.?$/i.test(text);
};

export const getPrayerTextAvailability = text => ({
  hasChurch: hasRealPrayerText(text?.content),
  hasRussian: hasRealPrayerText(text?.translation),
  hasTraditional: hasRealPrayerText(text?.traditional_content),
});

export const isPrayerModeAvailable = (mode, {hasChurch = false, hasRussian = false, hasTraditional = false} = {}) => {
  switch (mode) {
    case 'church': return !!hasChurch;
    case 'russian': return !!hasRussian;
    case 'both': return !!hasChurch && !!hasRussian;
    case 'traditional': return !!hasTraditional;
    default: return false;
  }
};

export const resolvePrayerMode = (requested, availability = {}) => {
  if (isPrayerModeAvailable(requested, availability)) return requested;
  // Prefer the source language when present; for Russian-only prayers
  // open RU directly, even if "ЦС" was saved as a previous preference.
  if (availability.hasChurch) return 'church';
  if (availability.hasRussian) return 'russian';
  if (availability.hasTraditional) return 'traditional';
  return 'church'; // empty placeholder: keep its existing explanatory message
};

export const buildPrayerModeOptions = availability => [
  {key: 'church', label: 'ЦС', disabled: !isPrayerModeAvailable('church', availability)},
  {key: 'russian', label: 'РУС', disabled: !isPrayerModeAvailable('russian', availability)},
  {key: 'both', label: 'ЦС + РУС', disabled: !isPrayerModeAvailable('both', availability)},
  {key: 'traditional', label: 'ЦС традиц.', disabled: !isPrayerModeAvailable('traditional', availability)},
];
