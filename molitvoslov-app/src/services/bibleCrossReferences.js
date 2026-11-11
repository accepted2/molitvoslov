import crossReferences from '../data/bibleCrossReferences.json';

const rows = crossReferences?.references || {};
const makeKey = (code, chapter, verse) =>
  [String(code || '').toUpperCase(), Number(chapter), Number(verse)].join('.');

// OpenBible follows Hebrew/KJV Psalter numbering, not the Church Slavonic
// (Septuagint) Psalter. Hide ambiguous CSL Psalm source links until mapped.
export const hasBibleCrossReferences = (code, chapter, verse, translationCode = 'rst') => {
  if (translationCode === 'csl_traditional' && code === 'PSA') return false;
  const links = rows[makeKey(code, chapter, verse)];
  return Array.isArray(links) && links.some((edge) => Number(edge[5]) > 0);
};

export const getBibleCrossReferences = (code, chapter, verse, limit = Infinity) => {
  const links = rows[makeKey(code, chapter, verse)] || [];
  // Load every available cross-reference. The bottom sheet renders them in
  // small batches; truncating here silently hid valid connections after #24.
  const maxEntries = Number.isFinite(Number(limit)) ? Math.max(0, Math.floor(Number(limit))) : Infinity;
  return links
    .filter((item) => Array.isArray(item) && item.length >= 6 && Number(item[5]) > 0)
    .slice(0, maxEntries)
    .map(([bookCode, chapterStart, verseStart, chapterEnd, verseEnd, votes]) => ({
      bookCode,
      chapter: Number(chapterStart),
      verse: Number(verseStart),
      endChapter: Number(chapterEnd),
      endVerse: Number(verseEnd),
      votes: Number(votes),
    }));
};

export const BIBLE_CROSS_REFERENCE_ATTRIBUTION = {
  name: 'OpenBible.info',
  url: 'https://www.openbible.info/labs/cross-references/',
  license: 'CC BY 4.0',
};
