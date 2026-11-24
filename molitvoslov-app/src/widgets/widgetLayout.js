// Sizing helpers for Android RemoteViews widgets (no React/native imports).
// Android system sans-serif (Roboto on most devices), not Church Slavonic Ponomar.
export const FONT = 'sans-serif';

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
// Android clipping, because actual Android glyph widths vary.
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

export const calendarWidgetGeometry = (width, height) => {
  const size = readSize(width, height, {width: 320, height: 150});
  const W = size.width, H = size.height;
  const scale = getScale(size, {width: 320, height: 150}, 0.8, 1.5);
  const pad = Math.round(clamp(10 * scale, 7, 14));
  const gap = Math.round(clamp(8 * scale, 5, 12));
  const contentH = Math.max(1, H - pad * 2 - 2);
  const panelPadLeft = Math.round(clamp(8 * scale, 5, 12));
  const minPanel = 7 * 15 + panelPadLeft + 1;
  const maximumPanel = Math.max(minPanel, Math.min(240, W - pad * 2 - gap - 85));
  const panelW = clamp(Math.round(W * 0.46), minPanel, maximumPanel);
  const leftW = Math.max(1, W - 2 - 2 * pad - gap - panelW);
  const cellW = Math.max(15, Math.floor((panelW - panelPadLeft - 1) / 7));
  const gridW = 7 * cellW;
  const monthHeaderH = Math.round(clamp(22 * scale, 16, 30));
  const showWeekdays = contentH >= 110;
  const weekdayH = showWeekdays ? Math.round(clamp(11 * scale, 9, 15)) : 0;
  const rowH = Math.max(1, Math.floor(
    Math.max(1, contentH - monthHeaderH - weekdayH) / 6,
  ));
  const dayFont = Math.round(clamp(Math.min(rowH, cellW) * 0.58, 7, 15));
  const bubble = Math.max(6, Math.min(cellW - 2, rowH - 1, 26));
  const weekdayFont = Math.round(clamp(weekdayH * 0.72, 7, 11));
  const arrowW = Math.round(cellW * 1.4);
  return {W,H,scale,pad,gap,contentH,panelPadLeft,panelW,leftW,
    cellW,gridW,monthHeaderH,showWeekdays,weekdayH,rowH,
    dayFont,bubble,weekdayFont,arrowW};
};
