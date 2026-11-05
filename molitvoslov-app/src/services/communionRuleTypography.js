/**
 * Display-only typography for the Communion preparation and thanksgiving rules.
 * Never insert hyphens, change source strings or rebase UTF-16 selection offsets.
 */
const MARK = /\p{M}/u;
const LETTER = /\p{L}/u;

export const getCommunionRuleKind = rule => {
  const name = [rule?.name, rule?.name_uk, rule?.traditional_name]
    .filter(Boolean).join(' ').normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase().replace(/ё/g, 'е');
  const slug = String(rule?.slug || '').toLowerCase();
  if (/благодарствен[а-я]*\s+молитв|благодарствен[а-я]*.{0,35}причащ/u.test(name) ||
      /blagodarstven|thanksgiving/i.test(slug)) return 'thanksgiving';
  if (/последован[а-я]*.{0,65}(?:причащ|причаст)|ко\s+святому\s+причащению/u.test(name) ||
      /^последование$/u.test(name.trim()) ||
      /posledovan|prichashchen|prichaschen|communion-preparation/i.test(slug)) return 'preparation';
  return null;
};

const mappedText = value => {
  const source = String(value || '');
  let normalized = '';
  const positions = [];
  for (let index = 0; index < source.length; index += 1) {
    for (const char of source[index].normalize('NFD')) {
      if (MARK.test(char)) continue;
      normalized += char;
      positions.push(index);
    }
  }
  return {source, normalized, positions};
};

export const buildCommunionTypography = value => {
  const {source, normalized, positions} = mappedText(value);
  const ranges = [];
  const breakBefore = new Set();

  const addRange = (from, to, kind) => {
    if (to <= from || !Number.isInteger(positions[from]) ||
        !Number.isInteger(positions[to - 1])) return null;
    const start = positions[from];
    let end = positions[to - 1] + 1;
    while (end < source.length && MARK.test(source[end])) end += 1;
    ranges.push({start, end, kind});
    return {start, end};
  };
  const addInitial = offset => {
    let at = offset;
    while (at < source.length && /\s/u.test(source[at])) at += 1;
    if (!LETTER.test(source[at] || '')) return;
    if (ranges.some(range => range.start <= at && at < range.end &&
        (range.kind === 'cue' || range.kind === 'response'))) return;
    let end = at + 1;
    while (end < source.length && MARK.test(source[end])) end += 1;
    ranges.push({start: at, end, kind: 'initial'});
  };

  // Only a real rubric at the start of a physical line gets red typography.
  // The same words inside a prayer paragraph remain untouched.
  const cue = /(?:^|\n)[ \t]*((?:Слава(?:\s*,?\s*и\s+ныне)?|И\s+ныне|Ирмос|Припев|Богородичен|Троичен|Кондак|Икос|Седален|Тропар(?:ь|и)|Молитва(?:\s+\d{1,2})?)\s*[:;])/gimu;
  for (const match of normalized.matchAll(cue)) {
    const from = match.index + match[0].lastIndexOf(match[1]);
    const range = addRange(from, from + match[1].length, 'cue');
    if (!range) continue;
    const tail = source.slice(range.end);
    if (/^молитва/iu.test(match[1]) && /^[ \t]*\p{L}/u.test(tail)) {
      const next = range.end + (/^[ \t]*/u.exec(tail)?.[0].length || 0);
      breakBefore.add(next);
      addInitial(next);
    }
  }

  // A whole short liturgical response is a rubric. Do not match the same
  // words when they appear within longer prayer sentences.
  const response = /(?:^|\n)[ \t]*((?:Слава\s+Отцу[^\n]{0,115}|И\s+ныне\s*,?\s+и\s+(?:присно|всегда)[^\n]{0,115}|(?:Господи|Гдси)\s*,?\s*помилуй[^\n]{0,35}|Аллилу[ийа][^\n]{0,22}))(?=\n|$)/gimu;
  for (const match of normalized.matchAll(response)) {
    const from = match.index + match[0].lastIndexOf(match[1]);
    const piece = match[1].trim();
    if (/^(?:Слава\s+Отцу|И\s+ныне)/iu.test(piece) &&
        !/(?:Дух|веков|Амин)/iu.test(piece)) continue;
    addRange(from, from + match[1].length, 'response');
  }

  const note = /[\[(]\s*(?:тр[иії]жды|дважды|единожды|поклон(?:ы)?|12\s*раз(?:а)?|40\s*раз(?:а)?)\s*\.?\s*[\])]/gimu;
  for (const match of normalized.matchAll(note)) {
    addRange(match.index, match.index + match[0].length, 'note');
  }

  addInitial(0);
  for (const match of source.matchAll(/\n[ \t]*\r?\n/gu)) {
    addInitial(match.index + match[0].length);
  }
  const unique = new Map();
  for (const range of ranges) {
    if (range.start < 0 || range.end > source.length || range.end <= range.start) continue;
    unique.set(range.kind + ':' + range.start + ':' + range.end, range);
  }
  return {
    ranges: [...unique.values()].sort((a, b) => a.start - b.start || a.end - b.end),
    breakBefore: [...breakBefore].sort((a, b) => a - b),
  };
};
