import {normalizeSearchText} from './normalize';
export const tokenizeQuery = (query) => {
  const words = normalizeSearchText(query).match(/[\p{L}\p{N}]+/gu) || [];
  return words.length === 1 && words[0].length < 2 ? [] : words;
};
const quote = (word) => '"' + word.replace(/"/g, '""') + '"';
export const buildPhraseQuery = (words) =>
  words.length ? '"' + words.map((word) => word.replace(/"/g, '""')).join(' ') + '"*' : '';
export const buildAndQuery = (words) => words.map((word) => quote(word) + '*').join(' AND ');
