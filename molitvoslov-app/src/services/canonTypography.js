/**
 * Canon-only, presentation-only typography. Offsets refer to the ORIGINAL
 * text (UTF-16, as used by the WebView selection engine). Never rewrite
 * canon source strings, saved fragments or reader progress positions.
 */
const COMBINING_MARK = /[\u0300-\u036f\u0483-\u0489]/u;
const LETTER = /\p{L}/u;

// Normalize Church Slavonic accents while keeping a precise map back to the
// original UTF-16 offsets, including decomposed vowel + accent sequences.
const normalizeWithOffsets = (source) => {
  let normalized = '';
  const offsets = [];
  for (let i = 0; i < source.length; i += 1) {
    const piece = source[i].normalize('NFD');
    for (const symbol of piece) {
      if (COMBINING_MARK.test(symbol)) continue;
      const civil = ({
        'ѣ': 'е', 'Ѣ': 'Е', 'і': 'и', 'І': 'И', 'ѡ': 'о',
        'Ѡ': 'О', 'ѻ': 'о', 'Ѻ': 'О', 'ꙋ': 'у', 'Ꙋ': 'У',
        'ѧ': 'я', 'Ѧ': 'Я',
      })[symbol] || symbol;
      normalized += civil;
      for (let n = 0; n < civil.length; n += 1) offsets.push(i);
    }
  }
  return {normalized, offsets};
};

const extendCombiningMarks = (text, offset) => {
  let end = offset;
  while (end < text.length && COMBINING_MARK.test(text[end])) end += 1;
  return end;
};

const initialAt = (text, start) => {
  let position = start;
  while (position < text.length && /\s/u.test(text[position])) position += 1;
  if (!LETTER.test(text[position] || '')) return null;
  // Keep an accented initial together with every following combining mark.
  return {start: position, end: extendCombiningMarks(text, position + 1), kind: 'initial'};
};

const markAfter = (text, from, breaks, initials) => {
  const tail = text.slice(from);
  // Never introduce an extra blank line if the author already used one.
  if (/^[ \t]*\r?\n/u.test(tail)) {
    const first = initialAt(text, from);
    if (first) initials.push(first);
    return;
  }
  const spaces = /^[ \t]*/u.exec(tail)[0];
  const position = from + spaces.length;
  if (position >= text.length || !LETTER.test(text[position])) return;
  breaks.add(position);
  const first = initialAt(text, position);
  if (first) initials.push(first);
};

export const buildCanonTypography = (value, inlineLabel = '') => {
  const text = String(value || '');
  const ranges = [];
  const breakBefore = new Set();
  const initials = [];

  // Keep the established short headings (including "Ирмос:", "Припев:",
  // "Иисусу:" and "Слава:") while separating only long introductory cues.
  // "Молитва:" was already rendered on its own line in the canon reader.
  const mappedCue = normalizeWithOffsets(text);
  const cue = /^\s*((?:Тропар(?:ь|и)|Богородичен|Ирмос|Припев|Иисусу|Седален|Кондак|Икос|Светилен|Молитва|Слава|И\s+ныне|Ныне)[^:\n]{0,110}:)/iu.exec(mappedCue.normalized);
  let bodyStart = 0;
  if (cue) {
    const from = mappedCue.offsets[cue[0].length - cue[1].length];
    const to = extendCombiningMarks(text, mappedCue.offsets[cue[0].length - 1] + 1);
    const long = cue[1].trim().length >= 20;
    const prayer = /^\s*молитва/iu.test(cue[1]);
    const glory = /^\s*(?:слава|и\s+ныне|ныне)\s*:/iu.test(cue[1]);
    ranges.push({
      start: from, end: to,
      kind: prayer ? 'prayer-cue' : long ? 'long-cue' : glory ? 'glory-cue' : 'short-cue',
    });
    if (long || prayer) {
      bodyStart = to;
      markAfter(text, to, breakBefore, initials);
    } else {
      const opening = initialAt(text, 0);
      if (opening) initials.push(opening);
      const body = initialAt(text, to);
      if (body) initials.push(body);
    }
  } else {
    const first = initialAt(text, 0);
    if (first) initials.push(first);
  }

  // Colored first letters after actual paragraph breaks.
  for (const match of text.matchAll(/\n[ \t]*\r?\n/gu)) {
    const first = initialAt(text, match.index + match[0].length);
    if (first) initials.push(first);
  }

  const {normalized, offsets} = normalizeWithOffsets(text);
  const doxologies = [
    /слава\s+(?:отцу|оцу),?\s+и\s+(?:сыну|сну),?\s+и\s+(?:святому|стому)\s+(?:духу|дху)[ \t]*[.:;!?]?/giu,
    /(?:и\s+)?ныне,?\s+и\s+присно,?\s+и\s+во\s*веки\s+веков[ъ]?[ \t]*[.,;:]?[ \t]*амин[ьъ]?[ \t]*[.!?]?/giu,
  ];

  for (const pattern of doxologies) {
    for (const match of normalized.matchAll(pattern)) {
      const start = offsets[match.index];
      const last = offsets[match.index + match[0].length - 1];
      if (!Number.isInteger(start) || !Number.isInteger(last)) continue;
      const end = extendCombiningMarks(text, last + 1);
      ranges.push({start, end, kind: 'doxology'});
      markAfter(text, end, breakBefore, initials);
    }
  }

  // Same subdued rubric color as the existing "(Трижды)" notation.
  const repeats = /\(\s*(?:дважды|трижды)\s*\.?\s*\)/giu;
  for (const match of normalized.matchAll(repeats)) {
    const start = offsets[match.index];
    const last = offsets[match.index + match[0].length - 1];
    if (Number.isInteger(start) && Number.isInteger(last)) {
      ranges.push({start, end: extendCombiningMarks(text, last + 1), kind: 'repeat-note'});
    }
  }

  // If the actual body follows a long inlineLabel outside the text root,
  // the next line and the initial must be styled within this text root.
  const standaloneInlineLabel = String(inlineLabel).replace(/[:\s]+$/u, '').trim().length >= 20;
  if (standaloneInlineLabel && bodyStart === 0 && text) {
    const first = initialAt(text, 0);
    if (first) initials.push(first);
  }

  ranges.push(...initials);
  const unique = new Map();
  for (const range of ranges) {
    if (range.start < 0 || range.end > text.length || range.end <= range.start) continue;
    unique.set(range.kind + ':' + range.start + ':' + range.end, range);
  }
  return {
    ranges: [...unique.values()].sort((left, right) => left.start - right.start),
    breakBefore: [...breakBefore].sort((a, b) => a - b),
    standaloneInlineLabel,
  };
};
