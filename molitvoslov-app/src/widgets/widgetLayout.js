// Sizing helpers for Android RemoteViews widgets (no React/native imports).
export const FONT = 'Ponomar-Regular';

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const readSize = (width, height, fallback) => {
  const w = Number(width);
  const h = Number(height);
  return {
    width: Number.isFinite(w) && w > 0 ? w : fallback.width,
    height: Number.isFinite(h) && h > 0 ? h : fallback.height,
  };
};

// Use the smaller dimension to prevent a wide/short widget inflating fonts.
export const getScale = (size, base, min = 0.8, max = 1.6) =>
  clamp(Math.min(size.width / base.width, size.height / base.height), min, max);

// Approximate text measurement for sizing only; maxLines enforces the final
// Android clipping, because the real Ponomar glyph widths vary.
const AVG_CHAR = 0.52;
export const textWidth = (value, fontSize) => String(value || '').length * fontSize * AVG_CHAR;

export const countLines = (value, fontSize, maxWidth) => {
  const perLine = Math.max(1, Math.floor(Math.max(1, maxWidth) / (fontSize * AVG_CHAR)));
  let count = 0;
  for (const paragraph of String(value || '').split('\n')) {
    count += 1;
    let used = 0;
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const length = word.length;
      const need = used ? used + 1 + length : length;
      if (need <= perLine) {
        used = need;
      } else if (length <= perLine) {
        count += 1;
        used = length;
      } else {
        if (used) count += 1;
        count += Math.ceil(length / perLine) - 1;
        used = length % perLine || perLine;
      }
    }
  }
  return count;
};

export const fitText = ({
  text, maxWidth, maxHeight, maxFont, minFont = 10, lineRatio = 1.25,
}) => {
  const clean = String(text || '').trim();
  const bottom = Math.max(8, Math.round(minFont));
  const ceiling = Math.max(bottom, Math.round(maxFont));
  const availableHeight = Math.max(1, maxHeight);
  const lineHeightOf = size => Math.max(1, Math.round(size * lineRatio));
  for (let size = ceiling; size >= bottom; size--) {
    const lineHeight = lineHeightOf(size);
    if (countLines(clean, size, maxWidth) * lineHeight <= availableHeight) {
      return {fontSize: size, lineHeight,
        maxLines: Math.max(1, Math.floor(availableHeight / lineHeight)), fits: true};
    }
  }
  const lineHeight = lineHeightOf(bottom);
  return {fontSize: bottom, lineHeight,
    maxLines: Math.max(1, Math.floor(availableHeight / lineHeight)), fits: false};
};

export const fitOneLine = ({candidates, maxWidth, maxFont, minFont = 8}) => {
  for (const candidate of candidates) {
    for (let size = maxFont; size >= minFont; size--) {
      if (textWidth(candidate, size) <= maxWidth) {
        return {text: candidate, fontSize: size};
      }
    }
  }
  return {text: candidates[candidates.length - 1] || '', fontSize: minFont};
};
