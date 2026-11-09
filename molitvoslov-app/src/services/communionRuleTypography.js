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


// Communion prayer headings are separate "section" items followed by a
// "text" item with an empty title. Strip Church Slavonic stress marks so the
// same rule also recognizes headings such as "Моли́тва 1-я" and "Его́ же, 8-я".
export const isCommunionPrayerHeading = value => {
  const heading = String(value || '')
    .normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase().replace(/ё/g, 'е')
    .replace(/\s+/gu, ' ').trim();
  return /^молитв(?:а|ы)(?:\s|$|[:.,])/u.test(heading) ||
    /^благодарственн[а-я]*\s+молитв[а-я]*/u.test(heading) ||
    /^его\s+же\s*,?\s*\d{1,2}\s*[-‑–]?[ая]?(?:\s|$|[.,:])/u.test(heading);
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

// Compact three identical "Аллилуйа ... слава Тебе, Боже."
// invocations without rewriting selectable source text or saved offsets.
export const getCommunionAlleluiaCompaction = value => {
  const {source, normalized, positions} = mappedText(value);
  const phrase = /(?:ал{1,2}илу(?:й?[ая]|и[ая])\s*[,;]\s*){3}слава\s+тебе\s*,?\s*боже[.!]?/giu;
  const found = [...normalized.matchAll(phrase)];
  const signature = matched => matched[0].toLowerCase()
    .replace(/[^\p{L}]+/gu, ' ').trim();
  const ranges = [];
  for (let i = 0; i + 2 < found.length; i += 1) {
    const first = found[i], second = found[i + 1], third = found[i + 2];
    const firstEnd = first.index + first[0].length;
    const secondEnd = second.index + second[0].length;
    if (signature(first) !== signature(second) ||
        signature(first) !== signature(third) ||
        !/^\s*$/u.test(normalized.slice(firstEnd, second.index)) ||
        !/^\s*$/u.test(normalized.slice(secondEnd, third.index))) continue;
    const note = /^\s*\((?:с\s+тремя\s+поклонами|трижды)\)/iu.exec(
      normalized.slice(third.index + third[0].length)
    );
    const last = third.index + third[0].length + (note ? note[0].length : 0);
    const start = positions[firstEnd];
    const lastPosition = positions[last - 1];
    if (!Number.isInteger(start) || !Number.isInteger(lastPosition)) continue;
    let end = lastPosition + 1;
    while (end < source.length && MARK.test(source[end])) end += 1;
    ranges.push({start, end, kind: 'alleluia-replace'});
    i += 2;
  }
  return ranges;
};

export const compactCommunionAlleluiaDisplay = value => {
  const source = String(value || '');
  const ranges = getCommunionAlleluiaCompaction(source);
  let result = source;
  for (const range of [...ranges].reverse()) {
    result = result.slice(0, range.start) + ' (Трижды)' + result.slice(range.end);
  }
  return result;
};


// Short prayers in the Communion preparation can contain two or three
// separate liturgical invocations inside one database Text item. Add visual
// dividers at their source offsets, without modifying selectable source text.
export const getCommunionLiturgicalSeparators = value => {
  const source = String(value || '');
  const gaps = [...source.matchAll(/\r?\n[ \t]*\r?\n[ \t]*/gu)];
  if (!gaps.length || gaps.length > 5) return [];

  const parts = [];
  let cursor = 0;
  for (const gap of gaps) {
    parts.push(source.slice(cursor, gap.index));
    cursor = gap.index + gap[0].length;
  }
  parts.push(source.slice(cursor));

  const fold = text => String(text || '').normalize('NFD')
    .replace(/\p{M}/gu, '').trim().toLowerCase().replace(/ё/g, 'е');

  const shortInvocation = part =>
    /^(?:святы[йи]\s+боже|пресвятая\s+троице|господи\s*,?\s*помилу[йи]|слава\s+отцу|и\s+ныне(?:\s|,|:))/u.test(fold(part));

  // Several Trisagion invocations are sometimes stored in one Text item.
  if (parts.every(shortInvocation)) {
    return gaps.map(gap => gap.index + gap[0].length);
  }
  if (parts.length === 2) {
    const first = fold(parts[0]);
    const second = fold(parts[1]);
    // Canon ode 8: "Припев: ... слава Тебе." followed by the next stanza.
    if (/^припев\s*:/u.test(first) && second.length > 0) {
      return [gaps[0].index + gaps[0][0].length];
    }
    // "Господи, помилуй (12 раз)" and the following "Приидите".
    if (/^господи\s*,?\s*помилу[йи][\s\S]*\(\s*12\s*раз(?:а)?\s*\)$/u.test(first) &&
        /^приидите/u.test(second)) {
      return [gaps[0].index + gaps[0][0].length];
    }
  }
  // Introductory "Слава Отцу" / "И ныне" are RUBRICS, not dividers:
  // highlight them in the reader but keep their following prayer together.
  return [];
};

// The "Слава Отцу..." and "И ныне..." troparia are consecutive Text
// items, but form a single two-part hymn. Only its second part is followed
// by the ordinary rule-item divider.
export const isCommunionDoxologyPair = (first, second) => {
  const fold = value => String(value || '').normalize('NFD')
    .replace(/\p{M}/gu, '').trim().toLowerCase().replace(/ё/g, 'е');
  return /^слава\s+отцу(?:\s|,)/u.test(fold(first)) &&
    /^и\s+ныне(?:\s|,)/u.test(fold(second));
};

export const buildCommunionTypography = (value, {continuousPrayer = false, communionKind = null} = {}) => {
  const {source, normalized, positions} = mappedText(value);
  const ranges = getCommunionAlleluiaCompaction(value);
  const breakBefore = new Set();
  const separatorBefore = communionKind === 'preparation' && !continuousPrayer
    ? getCommunionLiturgicalSeparators(source)
    : [];

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

  // The red introduction is its own line, but NOT a separate paragraph or
  // hymn. Keep the source intact and insert a visual <br> only when words
  // follow it in the same Text item (e.g. "Слава... Во причастие...").
  const introductoryDoxology =
    /^\s*(слава\s+отцу\s*,?\s+и\s+сыну\s*,?\s+и\s+святому\s+духу\s*[.!?:;]?|и\s+ныне\s*,?\s+и\s+присно\s*,?\s+и\s+во\s+веки\s+веков\s*,?\s+аминь\s*[.!?:;]?)(?=\s|$)/iu.exec(normalized);
  if (introductoryDoxology) {
    const from = introductoryDoxology.index +
      introductoryDoxology[0].indexOf(introductoryDoxology[1]);
    const ending = from + introductoryDoxology[1].length;
    addRange(from, ending, 'response');
    if (communionKind === 'preparation') {
      const continuation = /^\s+(\p{L})/u.exec(normalized.slice(ending));
      if (continuation) {
        const next = ending + continuation[0].length - continuation[1].length;
        if (Number.isInteger(positions[next])) breakBefore.add(positions[next]);
      }
    }
  }

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
  const responseLines = /(?:^|\n)[ \t]*([^\n]{1,160})(?=\n|$)/gmu;
  for (const match of normalized.matchAll(responseLines)) {
    const from = match.index + match[0].lastIndexOf(match[1]);
    const piece = match[1].trim();
    const isDoxology =
      /^Слава\s+Отцу[\s\S]{0,100}Святому\s+Духу[.!?:;]*$/iu.test(piece) ||
      /^И\s+ныне\s*,?\s+и\s+(?:присно|всегда)[\s\S]{0,85}во\s+веки\s+веков[ъ]?\s*[.,;:]?\s*аминь[.!?]*$/iu.test(piece);
    const isMercy = /^(?:Господи|Гдси)\s*,?\s*помилуй\s*[.!?]?(?:\s*[\[(]\s*(?:3|12|40|трижды)\s*\.?\s*[\])])?$/iu.test(piece);
    const isAlleluia = /^Аллилу[ийа]+[.!?]*$/iu.test(piece);
    if (isDoxology || isMercy || isAlleluia) {
      addRange(from, from + match[1].trimEnd().length, 'response');
    }
  }

  // Some imported prayer editions contain a Latin 'T' in "(Tрижды)".
  // Recognize both spellings for display only; never rewrite the text.
  const note = /[\[(]\s*(?:[тt]р[иії]жды|дважды|единожды|поклон(?:ы)?|12\s*раз(?:а)?|40\s*раз(?:а)?)\s*\.?\s*[\])]/gimu;
  for (const match of normalized.matchAll(note)) {
    const isThrice = /[тt]р[иії]жды/iu.test(match[0]);
    addRange(match.index, match.index + match[0].length,
      isThrice ? 'count-note' : 'note');
  }

  addInitial(0);
  // A long Communion prayer is one uninterrupted prayer, even when its
  // source contains editorial blank lines. Preserve a single first initial;
  // do not decorate every paragraph start as a separate prayer.
  if (!continuousPrayer) {
    for (const match of source.matchAll(/\n[ \t]*\r?\n/gu)) {
      addInitial(match.index + match[0].length);
    }
  }
  const unique = new Map();
  for (const range of ranges) {
    if (range.start < 0 || range.end > source.length || range.end <= range.start) continue;
    unique.set(range.kind + ':' + range.start + ':' + range.end, range);
  }
  return {
    ranges: [...unique.values()].sort((a, b) => a.start - b.start || a.end - b.end),
    breakBefore: [...breakBefore].sort((a, b) => a - b),
    separatorBefore,
  };
};
