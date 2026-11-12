import crossReferences from '../data/bibleCrossReferences.json';
import supplementaryReferences from '../data/bibleCrossReferencesSupplement.json';
import curatedOrthodoxReferences from '../data/bibleCrossReferencesCurated.json';
import psalmVersification from '../data/biblePsalmVersification.json';

const rows = crossReferences?.references || {};
const supplementaryRows = supplementaryReferences?.references || {};
const curatedRows = curatedOrthodoxReferences?.references || {};
const rowsAt = (key) => {
  const original = rows[key] || [];
  const extra = supplementaryRows[key] || [];
  const curated = curatedRows[key] || [];
  return extra.length || curated.length ? [...original, ...extra, ...curated] : original;
};
const makeKey = (code, chapter, verse) =>
  [String(code || '').toUpperCase(), Number(chapter), Number(verse)].join('.');

// OpenBible addresses Psalms using English/KJV numbering, while both our
// Synodal and Church Slavonic Psalters use Septuagint numbering. STEP Bible
// supplies an exact verse concordance, including superscriptions and the
// merged/split Psalms. Null means no equivalent (do not guess a verse).
const convertPsalm = (chapter, verse, direction) => {
  const key = Number(chapter) + '.' + Number(verse);
  const table = direction === 'toEnglish'
    ? psalmVersification?.lxxToEnglish
    : psalmVersification?.englishToLxx;
  const result = table?.[key];
  if (result === null) return null;
  if (result === undefined) return {chapter: Number(chapter), verse: Number(verse)};
  if (!Array.isArray(result) || result.length < 2) return null;
  return {chapter: Number(result[0]), verse: Number(result[1])};
};

export const getPsalmEnglishReference = (chapter, verse) =>
  convertPsalm(chapter, verse, 'toEnglish');

export const getPsalmSeptuagintReference = (chapter, verse) =>
  convertPsalm(chapter, verse, 'toLxx');

const getSourceAddress = (code, chapter, verse) =>
  String(code || '').toUpperCase() === 'PSA'
    ? getPsalmEnglishReference(chapter, verse)
    : {chapter: Number(chapter), verse: Number(verse)};

const mapTargetToBible = ([bookCode, chapter, verse, endChapter, endVerse, votes]) => {
  if (bookCode !== 'PSA') {
    return {
      bookCode, chapter: Number(chapter), verse: Number(verse),
      endChapter: Number(endChapter), endVerse: Number(endVerse), votes: Number(votes),
    };
  }
  const start = getPsalmSeptuagintReference(chapter, verse);
  const end = getPsalmSeptuagintReference(endChapter, endVerse);
  if (!start || !end) return null;
  if (end.chapter < start.chapter ||
      (end.chapter === start.chapter && end.verse < start.verse)) return null;
  return {bookCode, chapter: start.chapter, verse: start.verse,
    endChapter: end.chapter, endVerse: end.verse, votes: Number(votes)};
};

export const hasBibleCrossReferences = (code, chapter, verse, translationCode = 'rst') => {
  const address = getSourceAddress(code, chapter, verse);
  if (!address) return false;
  const links = rowsAt(makeKey(code, address.chapter, address.verse));
  return Array.isArray(links) && links.some((edge) => Array.isArray(edge) &&
    Number(edge[5]) > 0 && mapTargetToBible(edge) !== null);
};

export const getBibleCrossReferences = (code, chapter, verse, limit = Infinity) => {
  const address = getSourceAddress(code, chapter, verse);
  if (!address) return [];
  const links = rowsAt(makeKey(code, address.chapter, address.verse));
  const maxEntries = Number.isFinite(Number(limit)) ? Math.max(0, Math.floor(Number(limit))) : Infinity;
  const seen = new Set();
  return links
    .filter((item) => Array.isArray(item) && item.length >= 6 && Number(item[5]) > 0)
    .map(mapTargetToBible)
    .filter((item) => {
      if (!item) return false;
      // Distinct English references can resolve to the same Septuagint verse.
      const key = [item.bookCode, item.chapter, item.verse, item.endChapter, item.endVerse].join('.');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, maxEntries);
};

export const BIBLE_CROSS_REFERENCE_ATTRIBUTION = {
  name: 'OpenBible.info',
  url: 'https://www.openbible.info/labs/cross-references/',
  license: 'CC BY 4.0',
};

export const BIBLE_CATHOLIC_CROSS_REFERENCE_ATTRIBUTION = {
  name: 'Catholic Cross References (Douay-Rheims / Haydock)',
  url: 'https://github.com/jesuslovestyler/Catholic-Cross-References',
  license: 'Public domain (Unlicense / CC0)',
};

export const BIBLE_PSALM_VERSIFICATION_ATTRIBUTION = {
  name: 'STEP Bible / Tyndale House',
  url: 'https://www.STEPBible.org',
  license: 'CC BY 4.0',
};
