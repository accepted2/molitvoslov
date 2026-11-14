import {isDarkReaderBackground, withOpacity} from './scopedReaderAppearance';

const channels = (hex) => [1, 3, 5].map(index =>
  parseInt(String(hex).slice(index, index + 2), 16)
);

// Colour shifts are intentionally subtle: the header should blend into the
// selected page background, rather than introduce a fixed beige/grey overlay.
export const mixReaderHeaderColor = (base, tint, ratio) => {
  const a = channels(base);
  const b = channels(tint);
  const amount = Math.max(0, Math.min(1, ratio));
  return '#' + a.map((value, index) =>
    Math.round(value + (b[index] - value) * amount)
      .toString(16).padStart(2, '0')
  ).join('').toUpperCase();
};

export const buildReaderHeaderChrome = (background, forceDark = false) => {
  const dark = forceDark || isDarkReaderBackground(background);
  const shade = dark ? '#000000' : '#FFFFFF';
  const contrast = dark ? '#FFFFFF' : '#70472A';
  const surface = mixReaderHeaderColor(background, shade, dark ? 0.09 : 0.045);
  const pill = mixReaderHeaderColor(background, contrast, dark ? 0.12 : 0.09);
  const active = mixReaderHeaderColor(background, contrast, dark ? 0.19 : 0.17);
  const border = withOpacity(dark ? '#E8CCAB' : '#70472A', dark ? 0.28 : 0.24);

  return {
    dark,
    background,
    border,
    foreground: dark ? '#EADBC7' : '#54351C',
    frost: withOpacity(surface, 0.95),
    gradient: [
      withOpacity(surface, 0.99),
      withOpacity(surface, 0.91),
      withOpacity(background, 0.54),
      withOpacity(background, 0),
    ],
    pill,
    active,
    dropdown: surface,
  };
};
