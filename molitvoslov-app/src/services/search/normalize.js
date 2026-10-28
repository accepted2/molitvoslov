// Нормализация и стемминг. ДОЛЖНЫ совпадать с tools/search_seed_lib.py
// (clean/tokens/stem) — это проверяет tests/search/search.test.mjs.
//
// Что делает нормализация:
//  • убирает ударения, титла и другие надстрочные знаки (краткая «й» сохраняется);
//  • ё→е, старые буквы ѣ і ѳ ѵ ѡ ѧ ѹ ꙋ ѿ ѯ ѱ → современные;
//  • отбрасывает конечный ъ (дореформенная орфография).
// Стемминг лёгкий: снимается одно окончание, остаток не короче 3 букв.

const MARKS = /(?!\u0306)[\p{Mn}\p{Me}]/gu;
const LEGACY = {
  'ѣ': 'е', 'і': 'и', 'ї': 'и', 'ѳ': 'ф', 'ѵ': 'и', 'ѡ': 'о', 'ѻ': 'о', 'ѧ': 'я', 'ѩ': 'я',
  'ѹ': 'у', 'ꙋ': 'у', 'ѥ': 'е', 'ѕ': 'з', 'ѯ': 'кс', 'ѱ': 'пс', 'ѿ': 'от', 'ѫ': 'у', 'ѭ': 'ю',
  'ꙗ': 'я', 'ё': 'е',
};
const LEGACY_RE = new RegExp('[' + Object.keys(LEGACY).join('') + ']', 'g');
const WORD = /[\p{L}\p{N}]+/gu;

export const cleanText = (text) =>
  String(text == null ? '' : text)
    .toLowerCase()
    .normalize('NFD')
    .replace(MARKS, '')
    .normalize('NFC')
    .replace(LEGACY_RE, (c) => LEGACY[c]);

const finishWord = (w) => (w.endsWith('ъ') ? w.slice(0, -1) : w);

export const tokenize = (text) => {
  const out = [];
  for (const m of cleanText(text).matchAll(WORD)) {
    const w = finishWord(m[0]);
    if (w) out.push(w);
  }
  return out;
};

const SUFFIXES = [...new Set([
  'ившись', 'ывшись', 'ающий', 'ующий', 'ающ', 'яющ', 'ующ', 'ейш',
  'ость', 'ости', 'остию', 'ение', 'ения', 'ению', 'ением', 'ении',
  'ание', 'ания', 'анию', 'анием', 'ании', 'иями', 'ями', 'ами',
  'ого', 'его', 'аго', 'яго', 'ому', 'ему', 'ыми', 'ими', 'ией',
  'ться', 'ется', 'ится', 'ются', 'ятся', 'атся', 'ует', 'уют', 'ает', 'яет', 'ают', 'яют',
  'ить', 'ать', 'ять', 'еть', 'ешь', 'ишь', 'ете', 'ите',
  'ех', 'ах', 'ях', 'ов', 'ев', 'ам', 'ям', 'ем', 'им', 'ом', 'ей', 'ий', 'ый', 'ой',
  'ая', 'яя', 'ое', 'ее', 'ые', 'ие', 'ых', 'их', 'ую', 'юю', 'ою', 'ею', 'ия', 'ии',
  'ью', 'ся', 'сь', 'ь', 'а', 'я', 'о', 'е', 'у', 'ю', 'ы', 'и', 'й',
])].sort((a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0));

export const stemWord = (w) => {
  if (w.length <= 3 || /^\p{N}+$/u.test(w)) return w;
  for (const s of SUFFIXES) {
    if (w.length - s.length >= 3 && w.endsWith(s)) return w.slice(0, -s.length);
  }
  return w;
};

export const stemTokens = (text) => tokenize(text).map(stemWord);

/** Нормализованный текст без стемминга. Совместим со старым экспортом. */
export const normalizeSearchText = (value) => tokenize(value).join(' ');

/** Слова оригинального текста с позициями — для подсветки и сниппетов. */
export const wordSpans = (text) => {
  const src = String(text == null ? '' : text);
  const out = [];
  for (const m of src.matchAll(/[\p{L}\p{M}\p{N}]+/gu)) {
    const w = finishWord(cleanText(m[0]).replace(/[^\p{L}\p{N}]/gu, ''));
    if (w) out.push({start: m.index, end: m.index + m[0].length, word: w, stem: stemWord(w)});
  }
  return out;
};
