// Liturgical visual semantics for the Hours reader.
// Classifications are intentionally conservative: never rewrite prayer text,
// change word order, infer missing translations, or change selection offsets.

const removeStress = (value) =>
  String(value || '').normalize('NFD')
    .replace(/[\u0300-\u036f\u0483-\u0489]/gu, '');

const canonical = (value) =>
  removeStress(value).replace(/\s+/gu, ' ').trim().toLocaleLowerCase('ru');

export const classifyHoursSection = (title) => {
  const name = canonical(title);
  if (/^(?:псалом|ѱалом|псалм|псалмы)(?=\s|[:.,;!?]|$)/u.test(name)) return 'psalm';
  if (/^(?:молитва|молитвы|молитвословие)(?=\s|[:.,;!?]|$)/u.test(name)) return 'prayer';
  if (/^(?:тропарь|тропари|кондак|кондаки|богородичен|стихира|прокимен|причастен|седален)(?=\s|[:.,;!?]|$)/u.test(name)) return 'hymn';
  if (/^(?:паремия|паримия|пророчество|апостол|евангелие|чтение)(?=\s|[:.,;!?]|$)/u.test(name)) return 'reading';
  if (/^(?:кафизма|слава|и ныне|поклоны|поклон|трисвятое)(?=\s|[:.,;!?]|$)/u.test(name)) return 'rubric';
  return 'general';
};

export const classifyHoursRow = ({text, sectionKind = 'general'}) => {
  const value = canonical(text);
  if (!value) return 'empty';
  // Headings must be short and standalone. Never style a whole psalm like a
  // heading merely because the very first words are "Псалом 5".
  if (value.length <= 100 &&
      /^(?:псалом|ѱалом|псалм)\s*[\dа-яѣіѳѡ]{1,10}[:.]?$/u.test(value)) return 'heading';
  if (value.length <= 135 &&
      /^(?:(?:тропарь|кондак|богородичен|стихира|кафизма|прокимен|паремия|паримия|молитва|глас|седален)(?=\s|[:.,;!?]|$)[^.!?]{0,60}:?)[.]?$/u.test(value) &&
      !/господи\s*(?:,|\s)\s*помилуй/u.test(value)) return 'rubric';
  if (value.length <= 150 &&
      /^(?:господи[,\s]+помилуй|аллилуи[ая]|аминь(?=\s|[:.,;!?]|$))/u.test(value)) return 'response';
  if (/^(?:иерей|священник|диакон|чтец|лик|хор|певцы|народ|мы же)\s*:/u.test(value)) return 'dialogue';
  if (value.length <= 125 &&
      /^(?:слава[,\s]+и[,\s]+ныне|слава\s+отцу|и\s+ныне)\s*:/u.test(value)) return 'doxology';
  if (value.length <= 155 &&
      /^(?:и\s+паки|по\s+отче\s+наш|поклоны|трижды|трисвятое|приидите,?\s+поклонимся)(?=\s|[:.,;!?]|$)/u.test(value)) return 'rubric';
  return sectionKind === 'psalm' ? 'psalm' : 'prose';
};

// The mapping preserves UTF-16 indices, including stress marks and
// combining Church Slavonic signs; the renderer styles *exact* source ranges.
const mappedText = (value) => {
  const original = String(value || '');
  let normalized = '';
  const offsets = [];
  for (let i = 0; i < original.length;) {
    const cp = String.fromCodePoint(original.codePointAt(i));
    const part = cp.normalize('NFD');
    for (const char of part) {
      if (/[\u0300-\u036f\u0483-\u0489]/u.test(char)) continue;
      normalized += char;
      offsets.push(i);
    }
    i += cp.length;
  }
  return {normalized, offsets};
};

export const collectHoursTextMarks = (value) => {
  if (!value) return [];
  const {normalized, offsets} = mappedText(value);
  const ranges = [];
  const push = (start, end, kind) => {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
    // Include trailing combining accents in the styled word.
    while (end < value.length && /[\u0300-\u036f\u0483-\u0489]/u.test(value[end])) end += 1;
    ranges.push({start, end, kind});
  };
  const add = (pattern, kind, locate = (m) => [m.index, m.index + m[0].length]) => {
    for (const match of normalized.matchAll(pattern)) {
      const [startNorm, endNorm] = locate(match);
      if (endNorm <= startNorm) continue;
      const start = offsets[startNorm];
      const last = offsets[endNorm - 1];
      if (Number.isFinite(start) && Number.isFinite(last)) {
        const cpSize = String.fromCodePoint(value.codePointAt(last)).length;
        push(start, last + cpSize, kind);
      }
    }
  };

  // Role names are rubric cues; the following prayer remains normal text.
  add(/(?:^|[\n.;]\s*)(иерей|священник|диакон|чтец|лик|хор|певцы|народ|мы же)\s*:/gimu,
    'speaker',
    (match) => {
      const at = match.index + match[0].lastIndexOf(match[1]);
      return [at, match.index + match[0].length];
    });
  add(/(?:слава,?\s+и\s+ныне|слава\s+отцу|и\s+ныне)\s*:/gimu,
    'doxology');
  add(/господи,?\s+помилуй/giu, 'mercy');
  add(/аллилуи[ая]/giu, 'alleluia');
  add(/\(\s*(?:3|12|40|трижды|поклон(?:ы)?|три\s+раза)\s*[.]?\s*\)|(?=\s|[:.,;!?]|$)трижды(?=\s|[:.,;!?]|$)/giu,
    'repeat');
  add(/(?:^|\n)\s*(тропарь|кондак|богородичен|стихира|прокимен|паремия|паримия|глас|молитва|кафизма|священник|чтец)(?=\s|[:.,;!?]|$)[^\n:]{0,45}:/gimu,
    'cue',
    (match) => {
      const at = match.index + match[0].indexOf(match[1]);
      return [at, match.index + match[0].length];
    });

  // Prefer speaker/doxology labels over overlapping cues and replies.
  const priority = {speaker: 0, doxology: 1, mercy: 2, alleluia: 3, repeat: 4, cue: 5};
  return ranges
    .sort((a, b) => a.start - b.start || priority[a.kind] - priority[b.kind])
    .filter((range, i, all) =>
      // Keep source offsets intact; overlapping decorations are dropped.
      !all.slice(0, i).some(other =>
        other.start < range.end && range.start < other.end &&
        (other.start < range.start ||
          (other.start === range.start && priority[other.kind] < priority[range.kind])))
    )
    .sort((a, b) => a.start - b.start);
};
