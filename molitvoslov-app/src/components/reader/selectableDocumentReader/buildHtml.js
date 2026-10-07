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
          }
        : null,
  };

  const bookMode = documentData.readerMode === 'book';

  const resolvedTopPadding = bookMode
    ? Math.max(0, Number(topContentInset || 0))
    : Math.max(14, Number(topContentInset || 0) + 14);

  const resolvedBottomPadding = bookMode ? Math.max(34, Number(bottomContentInset || 0)) : 88;

  return HTML_TEMPLATE.replace(
    '__PONOMAR_FONT_URL__',
    String(ponomarFontDataUri || '').replace(/"/g, '%22')
  )
    .replace('__READER_TOP_PADDING__', String(resolvedTopPadding))
    .replace('__READER_BOTTOM_PADDING__', String(resolvedBottomPadding))
    .replace('__READER_PAYLOAD__', scriptSafeJson(payload));
};
