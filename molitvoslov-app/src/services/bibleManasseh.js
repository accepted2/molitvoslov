// The Elizabethan source keeps the Prayer of Manasseh as an appendix at
// 2 Chronicles 36:24, with eleven numbered CSL textual divisions.
// Expose the same source as a navigable separate book without modifying
// original verse IDs, lectionary anchors, or cross-reference targets.
const MAN_BOOK_ID = 500079;
const MAN_CHAPTER_ID = 10079001;
const MAN_VERSE_ID_BASE = 179001000;

export const withSeparateCslManasseh = (payload) => {
  if (!Array.isArray(payload?.books) || payload.books.some((book) => book.code === 'MAN')) {
    return payload;
  }

  const twoChroniclesIndex = payload.books.findIndex((book) => book.code === '2CH');
  if (twoChroniclesIndex < 0) return payload;
  const chronicles = payload.books[twoChroniclesIndex];
  const appendix = chronicles.chapters?.find((chapter) => Number(chapter.number) === 36)
    ?.verses?.find((verse) => Number(verse.number) === 24);
  const source = String(appendix?.text || '');
  const markers = [...source.matchAll(/\((\d{1,2})\)/g)];

  if (markers.length !== 11 || markers.some((match, index) => Number(match[1]) !== index + 1)) {
    return payload;
  }

  const introduction = source.slice(0, markers[0].index).trim();
  const headingEnd = introduction.indexOf('. ');
  if (headingEnd < 0) return payload;
  const heading = introduction.slice(0, headingEnd + 1);
  const invocation = introduction.slice(headingEnd + 2).trim();

  const verses = markers.map((match, index) => ({
    id: MAN_VERSE_ID_BASE + index + 1,
    number: index + 1,
    text: (
      (index === 0 ? invocation + ' ' : '') +
      source.slice(
        match.index + match[0].length,
        markers[index + 1]?.index ?? source.length
      )
    ).trim(),
  }));

  if (verses.some((verse) => !verse.text) || !verses[0].text.startsWith('Гдⷭ҇и')) {
    return payload;
  }

  const book = {
    id: MAN_BOOK_ID,
    code: 'MAN',
    testament: 'old',
    section: 'old',
    name: 'Молитва Манассіи',
    short_name: 'Молитва Манассіи',
    slug: 'prayerofmanasseh',
    // Position after 2 Chronicles; do not renumber or rewrite the other 77 books.
    canonical_order: Number(chronicles.canonical_order || 14) + 0.5,
    is_appendix: true,
    chapters: [{id: MAN_CHAPTER_ID, number: 1, heading, verses}],
  };

  return {
    ...payload,
    books: [
      ...payload.books.slice(0, twoChroniclesIndex + 1),
      book,
      ...payload.books.slice(twoChroniclesIndex + 1),
    ],
  };
};
