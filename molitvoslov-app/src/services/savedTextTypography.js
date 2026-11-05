// Favorites must reproduce the typography of the source reader, not infer
// a font from historic Cyrillic letters or combining accents. Ordinary CS
// mode and the calendar both use a civil serif; traditional mode uses Ponomar.
const normalizeFont = value => String(value || '').trim().toLowerCase();

export const savedTextFontFamily = item => {
  const metadata = item?.metadata || {};
  const explicit = normalizeFont(
    metadata.font_family || metadata.fontFamily || metadata.reader_font
  );

  // A recorded original font always takes precedence over a language label.
  if (explicit) {
    if (explicit.includes('ponomar')) return 'Ponomar';
    // Do not override a source-specified non-Ponomar typeface.
    return 'serif';
  }

  const mode = normalizeFont(
    metadata.language || metadata.text_language || metadata.reader_mode
  );
  if (['traditional', 'cs_traditional', 'church_traditional'].includes(mode)) {
    return 'Ponomar';
  }
  // Historic records without original font metadata cannot be identified by
  // glyphs alone. Civil serif is a safe, non-speculative default.
  return 'serif';
};
