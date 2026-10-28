import {tokenize, stemWord} from './normalize.js';

const q = (s) => '"' + s.replace(/"/g, '""') + '"';

/** Старый экспорт: нормализованные слова запроса (одно слово короче 2 букв — пусто). */
export const tokenizeQuery = (query) => {
  const words = tokenize(query);
  return words.length === 1 && words[0].length < 2 ? [] : words;
};

/**
 * Разбор запроса.
 *  words   — нормализованные слова (без стемминга)
 *  stems   — основы
 *  phrases — фразы в "кавычках" (каждая — массив основ), обязательны
 *  key     — ключ кэша
 */
export const analyzeQuery = (query) => {
  const phrases = [];
  const rest = String(query || '').replace(/"([^"]*)"/g, (_, p) => {
    const w = tokenize(p);
    if (w.length) phrases.push({words: w, stems: w.map(stemWord)});
    return ' ';
  });
  let words = tokenize(rest);
  if (words.length === 1 && words[0].length < 2 && !phrases.length) words = [];
  const stems = words.map(stemWord);
  return {
    words, stems, phrases,
    key: JSON.stringify([words, phrases.map((p) => p.words)]),
    empty: !words.length && !phrases.length,
  };
};

/** Для последнего слова при наборе: основа и «сырой» префикс. */
const lastAlternatives = (word, stem) => {
  const alts = new Set([stem, word]);
  return [...alts].map((a) => q(a) + '*');
};

export const buildPhraseQuery = (stems, {prefixLast = true} = {}) =>
  stems.length ? q(stems.join(' ')) + (prefixLast ? '*' : '') : '';

/** Все слова обязательны; последнее — префикс (поиск по мере набора). */
export const buildAndQuery = (words, stems, {prefixLast = true} = {}) =>
  stems.map((s, i) => {
    const last = i === stems.length - 1;
    if (last && prefixLast) return '(' + lastAlternatives(words[i], s).join(' OR ') + ')';
    return q(s);
  }).join(' AND ');

export const buildOrQuery = (stems) => stems.map((s) => q(s)).join(' OR ');

export const buildPhrasesQuery = (phrases) => phrases.map((p) => q(p.stems.join(' '))).join(' AND ');
