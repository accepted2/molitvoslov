import {HTML_TEMPLATE} from './htmlTemplate';

export const scriptSafeJson = (value) =>
  JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

export const buildHtml = ({
  documentData,
  savedProgress,
  focusTarget,
  topContentInset,
  bottomContentInset,
  ponomarFontDataUri,
  bookAppearance = null,
}) => {
  const payload = {
    document: documentData,

    savedItems: documentData.savedItems || [],

    progressAnchorType: documentData.progressAnchorType,

    focusTarget: focusTarget || null,

    progress:
      savedProgress && savedProgress.anchor_type === documentData.progressAnchorType
        ? {
            anchorId: Number(savedProgress.anchor_id),

            offset: Number(savedProgress.offset || 0),
            offsetRatio: savedProgress.offsetRatio ?? null,
          }
        : null,
  };

  const bookMode = documentData.readerMode === 'book';

  const resolvedTopPadding = bookMode
    ? Math.max(0, Number(topContentInset || 0))
    : Math.max(14, Number(topContentInset || 0) + 14);

  const resolvedBottomPadding = bookMode ? Math.max(34, Number(bottomContentInset || 0)) : 88;

  // Apply the saved Bible palette before the first WebView frame.
  // Otherwise Android first paints parchment and later injects the custom
  // palette, making chapter transitions flash or keep a stale page texture.
  const bookColor = (value, fallback) =>
    /^#[0-9a-fA-F]{6}$/.test(String(value || '')) ? String(value) : fallback;
  const initialBookTheme = bookMode && bookAppearance ? {
    background: bookColor(bookAppearance.background, '#FFF4DE'),
    text: bookColor(bookAppearance.text, '#3E2A1D'),
    dark: !!bookAppearance.dark,
    custom: bookAppearance.palette === 'custom',
    fontSize: Math.max(14, Math.min(28, Number(bookAppearance.fontSize) || 17)),
  } : null;

  const markup = HTML_TEMPLATE.replace(
    '__PONOMAR_FONT_URL__',
    String(ponomarFontDataUri || '').replace(/"/g, '%22')
  )
    .replace('__READER_TOP_PADDING__', String(resolvedTopPadding))
    .replace('__READER_BOTTOM_PADDING__', String(resolvedBottomPadding))
    .replace('__READER_PAYLOAD__', scriptSafeJson(payload));

  if (!initialBookTheme) return markup;
  const {background, text, dark, custom, fontSize} = initialBookTheme;
  const initialCss = ':root {' +
    '--book-paper:' + background + ';' +
    '--book-body-color:' + text + ';' +
    '--background:' + background + ';' +
    '--surface:' + background + ';' +
    '--text:' + text + ';' +
    '--book-font-size:' + fontSize + 'px;' +
    '--book-line-height:' + (fontSize * 1.32).toFixed(2) + 'px;' +
    '--book-drop-cap-size:' + (fontSize * 2.72).toFixed(2) + 'px;' +
    '}';
  const classes = ['book-mode', ...(dark ? ['book-night'] : []),
    ...(custom ? ['book-custom'] : [])].join(' ');
  return markup.replace('</style>', initialCss + '</style>')
    .replace('<body>', '<body class="' + classes + '">');
};
